import express from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { parseCard } from '../lib/agentCard.js';
import { sessions } from '../lib/sessions.js';
import { resolveEndpoints, refreshToken } from '../lib/oauth.js';

export const llmGatewayRouter = express.Router();

/** Return the connected Glean { base, token } (null if none). Reused by the orchestrator, etc. */
export function getGleanAuth(userId = 'default') {
  const base = config.glean.instanceUrl;
  if (!base) return null;
  const agent = findGleanAgent();
  if (!agent) return null;
  const token = sessions.getToken(agent.id, userId);
  if (!token) return null;
  return { base, token };
}

// ── Selecting the model used via the Gateway (for the dropdown) ──────────────
// Model candidates merge two sources:
//   1) Glean's live catalog (fetched from /v1/anthropic/v1/models with the connected token)
//   2) .env GLEAN_MODELS (fallback / always included in the candidates)
// The selected value is in-memory (process-global). For the demo, assumes a single user (default).

/** Static candidates from .env (includes the default model at the front) */
function envModels() {
  const list = config.glean.models.length ? [...config.glean.models] : [];
  if (config.glean.model && !list.includes(config.glean.model)) list.unshift(config.glean.model);
  return list.filter(Boolean);
}
/** Selectable model candidates (in the builder, etc.) = .env-fixed + ones verified OK in the app (persisted in DB). */
function availableModels() {
  return [...new Set([...envModels(), ...db.listVerifiedModels()])];
}
let selectedModel = config.glean.model || envModels()[0] || null;

/** Gateway default model (currently selected -> .env default). Used as the fallback target from unavailable models. */
export function getGatewayDefaultModel() {
  return selectedModel || config.glean.model || envModels()[0] || null;
}

// GET /api/llm-gateway/model → { selected, models, source }
// Candidates are .env GLEAN_MODELS + models verified OK in the app (DB). It does not
// auto-import the live catalog (that would return models whose real calls fail, e.g. gpt-5/GEMINI).
llmGatewayRouter.get('/model', (req, res) => {
  const models = availableModels();
  // If the currently selected model is no longer a candidate, revert to the default (safeguard right after startup or a settings change).
  if (selectedModel && !models.includes(selectedModel)) {
    selectedModel = config.glean.model || models[0] || null;
  }
  res.json({ selected: selectedModel, models, source: 'env+verified', via: null });
});

// POST /api/llm-gateway/model { model } → update the selection (only candidates allowed)
llmGatewayRouter.post('/model', (req, res) => {
  const model = (req.body?.model || '').trim();
  if (!model) return res.status(400).json({ error: 'model is required' });
  const models = availableModels();
  if (!models.includes(model)) {
    return res.status(400).json({ error: `Unsupported model: ${model} (candidates: ${models.join(', ')})` });
  }
  selectedModel = model;
  res.json({ selected: selectedModel, models, source: 'env+verified', via: null });
});

// ── The model catalog the Gateway provides (for browsing, live-fetched) ────────────
// Important: /openai/v1/models covers only OpenAI-family (+ NVIDIA/Fireworks), Claude is at
// /anthropic/v1/models, and the org-wide unified list is /v1/models... the lineup differs per "surface".
// So a single endpoint misses Claude/Gemini. Aggregate multiple surfaces to show them all.
// Each surface's canonical is /rest/api/...; /api/... is a transitional compatibility fallback.
function modelSources() {
  const base = config.glean.instanceUrl;
  if (!base) return [];
  return [
    { name: 'openai', urls: [`${base}/rest/api/v1/openai/v1/models`, `${base}/api/v1/openai/v1/models`] },
    { name: 'anthropic', urls: [`${base}/rest/api/v1/anthropic/v1/models`, `${base}/api/v1/anthropic/v1/models`] },
    { name: 'gemini', urls: [`${base}/rest/api/v1/gemini/v1/models`, `${base}/api/v1/gemini/v1/models`] },
    { name: 'unified', urls: [`${base}/rest/api/v1/models`, `${base}/api/v1/models`] },
    ...(process.env.GLEAN_GATEWAY_MODELS_URL ? [{ name: 'env', urls: [process.env.GLEAN_GATEWAY_MODELS_URL] }] : []),
  ];
}

/** Fetch a single endpoint -> normalized array (null if not reachable) */
async function fetchModelsFrom(url, token) {
  let r;
  // Time out after 8s so a single endpoint hanging doesn't freeze the whole /models call.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    r = await fetch(url, {
      headers: { Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`, Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) return null; // 404/405/403 etc. just mean this surface is absent -> skip
  const text = await r.text();
  let j;
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
  const arr = j.data || j.models || j.model_list || (Array.isArray(j) ? j : []);
  return arr
    .map((m) => {
      if (typeof m === 'string') return { id: m, ownedBy: null, created: null };
      return {
        id: m.id || m.model || m.name || null,
        ownedBy: m.owned_by || m.ownedBy || m.provider || null,
        created: m.created || null,
      };
    })
    .filter((m) => m.id);
}

/** Aggregate all "surfaces" and return a deduplicated model list */
async function fetchGatewayModels(token) {
  const sources = modelSources();
  const byId = new Map();
  const usedUrls = [];
  for (const src of sources) {
    for (const url of src.urls) {
      const models = await fetchModelsFrom(url, token);
      if (models) {
        usedUrls.push(url);
        for (const m of models) if (!byId.has(m.id)) byId.set(m.id, m);
        break; // for that surface, use only the first reachable URL
      }
    }
  }
  if (!byId.size) throw new Error('No model catalog endpoint found (all surfaces returned 404/unavailable)');
  return { urls: usedUrls, models: [...byId.values()] };
}

// GET /api/llm-gateway/models → { urls, count, models, selectable, selected }
// selectable = candidates the builder can choose (.env + models verified OK in the app).
llmGatewayRouter.get('/models', async (req, res) => {
  const userId = req.query.userId || 'default';
  const selectable = availableModels();
  const auth = getGleanAuth(userId);
  if (!auth) {
    return res
      .status(401)
      .json({ error: 'Glean is not connected. Please Connect Glean in the UI.', selectable, selected: selectedModel });
  }
  try {
    const { urls, models } = await fetchGatewayModels(auth.token);
    res.json({ urls, count: models.length, models, selectable, selected: selectedModel });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message, selectable, selected: selectedModel });
  }
});

// A thin proxy to Glean's LLM Gateway (internally LLM Proxy / LLM Fabric).
//
// The standalone orchestrator (examples/agents/orchestrator.mjs) cannot hold Glean's
// access token directly (the token lives only in sessions memory).
// So the backend proxy-injects the Glean token connected in the UI, converts an Anthropic
// Messages-shaped request into OpenAI-compatible Responses (see responsesCandidates), and forwards it with Bearer.
// Note: when using Anthropic native directly, the canonical is POST {instanceUrl}/rest/api/v1/anthropic/v1/messages.
//    (the old /rest/api/llm-proxy/v1/messages is deprecated). The token is never included in the response.
//
// Prerequisites: Connected with the LLM_PROXY OAuth scope included, and the tenant's
//       LlmFabric_Enabled flag is on (if off, the upstream returns 403).

/** Identify the seeded Glean agent (auth=oauth2_authcode) */
export function findGleanAgent() {
  const byCard = config.glean.agentCardUrl && db.findByUrl(config.glean.agentCardUrl);
  if (byCard) return byCard;
  const byBase = config.glean.instanceUrl && db.findByUrl(config.glean.instanceUrl);
  if (byBase) return byBase;
  // Fallback: pick up an OAuth-authorization agent
  return db.listAgents?.().find((a) => a.auth === 'oauth2_authcode') || null;
}

// OpenAI-compatible Responses endpoint (a common entry for all models; the model string resolves Claude/GPT/Gemini...).
// Reference: POST `{model, input}` to `<gateway-url>/openai/v1/responses` (Bearer = Glean OAuth).
function responsesCandidates() {
  const base = config.glean.instanceUrl;
  if (!base) return [];
  return [
    process.env.GLEAN_GATEWAY_RESPONSES_URL,
    // canonical is /rest/api/... (scio request_handler.go). /api/... is transitional compatibility, to be removed later.
    `${base}/rest/api/v1/openai/v1/responses`,
    `${base}/api/v1/openai/v1/responses`,
  ].filter(Boolean);
}
let workingResponsesUrl = null; // cache the reachable path

/** Anthropic Messages-shaped body → Responses body ({model, instructions?, input, max_output_tokens}) */
function toResponsesBody(p) {
  // Assumes a single-turn chat: system→instructions, user messages→input (concatenated text).
  const parts = [];
  for (const m of p.messages || []) {
    if (m.role !== 'user') continue;
    const text = Array.isArray(m.content) ? m.content.map((c) => c.text || '').join('') : m.content || '';
    if (text) parts.push(text);
  }
  // This gateway's /responses requires stream (non-stream returns STREAM_TRUNCATED).
  const body = { model: p.model, input: parts.join('\n\n'), stream: true };
  if (p.system) body.instructions = p.system;
  // Reasoning models (gpt-5 family / Gemini Pro etc.) can exhaust their budget on reasoning alone and return empty body if it's too small.
  // Ensure default 1024, minimum 512 (clamp to the minimum even if the caller specifies a value).
  body.max_output_tokens = Math.max(p.max_tokens || 1024, 512);
  return body;
}

/**
 * Aggregate text from the SSE body (supports Anthropic / OpenAI-Responses / OpenAI-chat).
 * Besides incremental deltas, OpenAI Responses can return the final body via response.output_item.done
 * (content[].text of item.type=="message") / response.output_text.done.
 * In particular, Gemini emits no deltas and returns everything at the end via output_item.done,
 * so looking only at deltas yields empty even on 200. -> Prefer deltas, fall back to the done-family body if absent.
 */
function aggregateSSE(text) {
  let delta = ''; // incremental deltas (OpenAI Responses / Anthropic / OpenAI chat)
  let final = ''; // the final body returned all at once (non-incremental path, e.g. Gemini)
  for (const block of String(text).replace(/\r\n/g, '\n').split('\n\n')) {
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('\n');
    if (!data || data === '[DONE]') continue;
    let j;
    try {
      j = JSON.parse(data);
    } catch {
      continue;
    }
    if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
      delta += j.delta.text || ''; // Anthropic
    } else if (j.type === 'response.output_text.delta') {
      delta += typeof j.delta === 'string' ? j.delta : j.delta?.text || ''; // OpenAI Responses incremental
    } else if (j.type === 'response.output_item.done' && j.item?.type === 'message') {
      // Gemini etc.: the final message body (reasoning items have type!="message", so they aren't picked up)
      for (const c of j.item.content || []) final += c.text || c.output_text || '';
    } else if (j.type === 'response.output_text.done') {
      final += typeof j.text === 'string' ? j.text : ''; // final text fragment (fallback)
    } else if (Array.isArray(j.candidates)) {
      // Gemini / Vertex native (the path where streamGenerateContent flows through as-is).
      // part.thought=true is reasoning, so it's not included in the body.
      for (const cand of j.candidates)
        for (const part of cand.content?.parts || []) if (!part.thought) delta += part.text || '';
    } else if (j.choices?.[0]?.delta?.content) {
      delta += j.choices[0].delta.content; // OpenAI chat
    }
  }
  // If incremental deltas exist, use them (prevents double-counting with the done-family). Otherwise, the final body.
  return delta || final;
}

/** Forward upstream with Bearer (non-streaming JSON) */
async function forward(url, token, body) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      Accept: 'text/event-stream', // /responses requires SSE
    },
    body: JSON.stringify(body),
  });
}

/** On 401, refresh the token once using refresh_token (when possible) */
async function tryRefresh(agent, userId, token) {
  if (!token?.refreshToken) return null;
  const g = config.glean.oauth;
  const cardMeta = agent.card ? parseCard(agent.card) : agent.cardMeta;
  const endpoints = await resolveEndpoints({
    envAuthorizeUrl: g.authorizeUrl,
    envTokenUrl: g.tokenUrl,
    cardMeta,
    instanceUrl: config.glean.instanceUrl,
  });
  if (!endpoints?.tokenUrl) return null;
  try {
    const fresh = await refreshToken(endpoints.tokenUrl, {
      refreshToken: token.refreshToken,
      clientId: g.clientId,
      clientSecret: g.clientSecret,
      scope: g.scopes,
    });
    // Some implementations don't return a refresh_token, so carry over the existing one
    if (!fresh.refresh_token && token.refreshToken) fresh.refresh_token = token.refreshToken;
    return sessions.setToken(agent.id, userId, fresh);
  } catch {
    return null;
  }
}

// POST /api/llm-gateway/messages
// body: Anthropic Messages request (model / max_tokens / system / messages / tools)
llmGatewayRouter.post('/messages', async (req, res) => {
  const userId = req.query.userId || req.body?.userId || 'default';

  if (!config.glean.instanceUrl) {
    return res.status(500).json({ error: 'GLEAN_INSTANCE_URL is not set (check .env)' });
  }

  const agent = findGleanAgent();
  if (!agent) {
    return res.status(404).json({ error: 'No Glean agent is registered (check the backend seed)' });
  }

  let token = sessions.getToken(agent.id, userId);
  if (!token) {
    return res
      .status(401)
      .json({ error: 'Glean is not connected. Please Connect Glean (OAuth) in the UI.' });
  }

  // Don't pass internal fields like userId upstream
  const { userId: _omit, ...payload } = req.body || {};

  // Override with the model currently selected in the UI (takes priority over the orchestrator's value).
  if (selectedModel) payload.model = selectedModel;

  // To the Responses endpoint common to all models (the model string resolves Claude/GPT/Gemini).
  const cands = responsesCandidates();
  const tryUrls = workingResponsesUrl
    ? [workingResponsesUrl, ...cands.filter((u) => u !== workingResponsesUrl)]
    : cands;
  const body = toResponsesBody(payload);
  const doForward = (url, tok) => forward(url, tok, body);

  try {
    // 404/405 (wrong path) -> try the next candidate. Anything else (200/400/401/403...) means that path is correct.
    let upstream;
    let usedUrl = tryUrls[0];
    for (const url of tryUrls) {
      usedUrl = url;
      upstream = await doForward(url, token);
      if (upstream.status !== 404 && upstream.status !== 405) break;
    }
    workingResponsesUrl = usedUrl;

    // On 401 (e.g. expired), try refresh once and resend
    if (upstream.status === 401) {
      const refreshed = await tryRefresh(agent, userId, token);
      if (refreshed) {
        token = refreshed;
        upstream = await doForward(usedUrl, token);
      }
    }

    const text = await upstream.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!upstream.ok) {
      const hint =
        upstream.status === 403
          ? ' (LlmFabric_Enabled flag may be off, or the LLM_PROXY scope may be missing)'
          : upstream.status === 401
            ? ' (token expired; please re-Connect in the UI)'
            : upstream.status === 404 || upstream.status === 405
              ? ' (the Responses path may be unsupported; you can set it explicitly via GLEAN_GATEWAY_RESPONSES_URL)'
              : '';
      // Extract the upstream's actual message (e.g. model not found) and include it in the error
      const detail =
        json?.error?.message || json?.error || json?.message || json?.raw ||
        (typeof json === 'object' ? JSON.stringify(json).slice(0, 240) : '');
      return res.status(upstream.status).json({
        error: `Glean LLM Gateway ${upstream.status}${hint}${detail ? `: ${detail}` : ''}`,
        upstream: json,
      });
    }

    // On success, the SSE body. Aggregate the text, normalize to Anthropic shape, and return.
    const out = aggregateSSE(text);
    return res.json({ content: out ? [{ type: 'text', text: out }] : [] });
  } catch (e) {
    return res.status(502).json({ error: `Glean LLM Gateway forwarding failed: ${e.message}` });
  }
});

// GET /api/llm-gateway/probe?model=... → send one tiny request to the model and judge whether
// a response actually comes back (to empirically distinguish "listed in catalog" from "actually usable").
// Does not override selectedModel; uses the given model as-is.
llmGatewayRouter.get('/probe', async (req, res) => {
  const userId = req.query.userId || 'default';
  const model = (req.query.model || '').trim();
  if (!model) return res.status(400).json({ error: 'model is required' });
  if (!getGleanAuth(userId)) return res.status(401).json({ error: 'Glean is not connected. Please Connect Glean in the UI.' });

  // Important: each provider has a different call surface (Claude=Anthropic Messages /rest,
  // GPT=OpenAI Responses /rest). Routing all models through Responses makes Claude/Gemini
  // fail with 400 "not enabled in any provider". buddy's complete() routes per-provider
  // correctly (/rest preferred, /api fallback), so use it for the actual measurement.
  const maxTokens = Math.max(16, parseInt(req.query.max, 10) || 24);
  try {
    const { complete } = await import('../lib/buddy.js');
    const out = await complete({ userId, system: '', text: 'Reply with the single word: pong.', model, maxTokens });
    const ok = !!(out && out.trim());
    let enabled = db.listVerifiedModels().includes(model);
    if (ok && req.query.enable === '1' && !enabled) {
      db.addVerifiedModel(model);
      enabled = true;
    }
    return res.json({
      model, ok, status: 200,
      reason: ok ? 'ok' : 'empty', // even on 200, an empty body means it's effectively unusable
      output: (out || '').slice(0, 200), enabled,
    });
  } catch (e) {
    // Pick up and return the upstream's actual message (model not found / not enabled, etc.)
    return res.json({ model, ok: false, status: 0, reason: 'error', detail: String(e.message || '').slice(0, 240) });
  }
});

// GET /api/llm-gateway/models/verified → { models } / POST to add / DELETE to remove
llmGatewayRouter.get('/models/verified', (req, res) => {
  res.json({ models: db.listVerifiedModels() });
});
llmGatewayRouter.post('/models/verified', (req, res) => {
  const model = (req.body?.model || '').trim();
  if (!model) return res.status(400).json({ error: 'model is required' });
  res.json({ models: db.addVerifiedModel(model) });
});
llmGatewayRouter.delete('/models/verified', (req, res) => {
  const model = (req.query.model || req.body?.model || '').trim();
  if (!model) return res.status(400).json({ error: 'model is required' });
  // If the removed candidate was selected, revert to the default
  const models = db.removeVerifiedModel(model);
  if (selectedModel === model && !availableModels().includes(model)) {
    selectedModel = config.glean.model || availableModels()[0] || null;
  }
  res.json({ models });
});
