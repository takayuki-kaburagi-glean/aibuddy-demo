// AI Buddy orchestration engine.
// An entry point that mimics an in-house "AI Buddy":
//   1) Fetch Glean MCP personal memory live and inject it as user context (personalization)
//   2) Present the registry's domain agents (Legal/HR/Research/Sales/IT) to the LLM as tools,
//      and "route to the appropriate agent" via tool-calling through the Glean LLM Gateway
//   3) Gate on permission (allowed departments) in the backend before the A2A call (cross-org governance)
//   4) Generate proactive "suggestions" from memory + the answer context
// An async generator that yields the execution timeline as SSE events.
import { db } from '../db.js';
import { parseCard } from './agentCard.js';
import { getGleanAuth, getGatewayDefaultModel } from '../routes/llmGateway.js';
import { messageSend, extractText } from './a2a.js';
import { getProfile } from './memory.js';
import { runGleanAgent, streamGleanAgent } from './gleanAgents.js';
import { getEmailRecipient } from '../routes/settings.js';
import { mcpListTools, mcpCallTool } from './mcpClient.js';

const MAX_STEPS = 6;
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const providerOf = (m) => (String(m || '').toLowerCase().startsWith('claude') ? 'anthropic' : 'openai');
const isModelUnknownError = (msg) =>
  /is not known|BAD_REQUEST|validation error: Model|not_found|model.*not.*found/i.test(String(msg || ''));
const truncate = (s, n = 600) => {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n) + ' …(truncated)' : s;
};
const slugify = (name, taken) => {
  let base = (name || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'agent';
  let slug = base, i = 2;
  while (taken.has(slug)) slug = `${base}_${i++}`;
  taken.add(slug);
  return slug;
};

function gleanHeaders(token, extra = {}) {
  return { Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`, 'content-type': 'application/json', ...extra };
}

// The canonical path is /rest/api/v1/... . /api/v1/... is a transitional alias that returns 404 on
// this tenant, so prefer /rest and only fall back to the old path on 404/405.
async function postGleanLLM(base, subpath, token, body, extraHeaders = {}) {
  const urls = [`${base}/rest/api/v1/${subpath}`, `${base}/api/v1/${subpath}`];
  let last;
  for (const url of urls) {
    last = await fetch(url, { method: 'POST', headers: gleanHeaders(token, extraHeaders), body: JSON.stringify(body) });
    if (last.status !== 404 && last.status !== 405) return last;
  }
  return last;
}

// ── Claude: Anthropic Messages (non-streaming, tools) ─────────────────
async function claudeTurn({ base, token, model, system, history, tools, maxTokens }) {
  const messages = history.map((h) => {
    if (h.role === 'user') return { role: 'user', content: [{ type: 'text', text: h.text || '' }] };
    if (h.role === 'assistant') {
      const content = [];
      if (h.text) content.push({ type: 'text', text: h.text });
      for (const c of h.toolCalls || []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} });
      return { role: 'assistant', content };
    }
    return { role: 'user', content: [{ type: 'tool_result', tool_use_id: h.toolCallId, content: h.text || '' }] };
  });
  const body = {
    model,
    max_tokens: maxTokens || 2048,
    ...(system ? { system } : {}),
    ...(tools?.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
    messages,
  };
  const res = await postGleanLLM(base, 'anthropic/v1/messages', token, body, { 'anthropic-version': '2023-06-01' });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  let text = '';
  const toolCalls = [];
  for (const b of j.content || []) {
    if (b.type === 'text') text += b.text || '';
    if (b.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, args: b.input || {} });
  }
  return { text, toolCalls };
}

// ── GPT: OpenAI Responses (SSE, tools) ───────────────────────────────
function parseResponsesSSE(text) {
  let out = '';
  const items = {};
  for (const block of String(text).replace(/\r\n/g, '\n').split('\n\n')) {
    const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
    if (!data || data === '[DONE]') continue;
    let j;
    try { j = JSON.parse(data); } catch { continue; }
    if (j.type === 'response.output_text.delta') out += typeof j.delta === 'string' ? j.delta : j.delta?.text || '';
    else if (j.type === 'response.output_item.added' && j.item?.type === 'function_call')
      items[j.item.id] = { call_id: j.item.call_id, name: j.item.name, args: '' };
    else if (j.type === 'response.function_call_arguments.delta' && items[j.item_id]) items[j.item_id].args += j.delta || '';
  }
  const toolCalls = Object.values(items).map((c) => {
    let args = {};
    try { args = JSON.parse(c.args || '{}'); } catch { /* ignore */ }
    return { id: c.call_id, name: c.name, args };
  });
  return { text: out, toolCalls };
}

async function gptTurn({ base, token, model, system, history, tools }) {
  const input = [];
  for (const h of history) {
    if (h.role === 'user') input.push({ role: 'user', content: h.text || '' });
    else if (h.role === 'assistant') {
      if (h.text) input.push({ role: 'assistant', content: h.text });
      for (const c of h.toolCalls || []) input.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.args || {}) });
    } else input.push({ type: 'function_call_output', call_id: h.toolCallId, output: h.text || '' });
  }
  const body = {
    model, input, stream: true,
    ...(system ? { instructions: system } : {}),
    ...(tools?.length ? { tools: tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })) } : {}),
  };
  const res = await postGleanLLM(base, 'openai/v1/responses', token, body, { Accept: 'text/event-stream' });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseResponsesSSE(await res.text());
}

// ── Model fallback ─────────────────────────────────────────────
// The tenant's available models change (e.g. claude-sonnet-4-6 suddenly becomes "not known").
// On a model error, try candidates in order, cache the one that works in-process, and reuse it.
let cachedWorkingModel = null;
const KNOWN_GOOD_MODELS = [
  'claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5',
  'CLAUDE_4_6_SONNET_20260217', 'gpt-4o-mini', 'gpt-5',
];
function candidateModels(preferred) {
  const list = [];
  const add = (m) => { if (m && !list.includes(m)) list.push(m); };
  add(cachedWorkingModel);       // most recently successful model first
  add(preferred);
  add(getGatewayDefaultModel());
  for (const m of KNOWN_GOOD_MODELS) add(m);
  return list;
}

/** Try candidate models in order for one turn. Only advance on model-caused failures. Cache the working model. */
async function runTurnWithFallback(auth, { system, history, tools, maxTokens }, preferred) {
  const cands = candidateModels(preferred);
  let lastErr;
  for (const m of cands) {
    const fn = providerOf(m) === 'anthropic' ? claudeTurn : gptTurn;
    try {
      const res = await fn({ base: auth.base, token: auth.token, model: m, system, history, tools, maxTokens });
      cachedWorkingModel = m;
      return { ...res, model: m };
    } catch (e) {
      if (isModelUnknownError(e.message)) { lastErr = e; continue; } // model not available -> next
      throw e; // anything else (auth, upstream failure, etc.) errors immediately
    }
  }
  throw lastErr || new Error('No usable model was found.');
}

/**
 * A single LLM completion (no tools). Used for general purposes like translation/summarization.
 * If the model fails, it automatically falls back to a usable model.
 */
export async function complete({ userId = 'default', system, text, model, maxTokens = 4096 }) {
  const auth = getGleanAuth(userId);
  if (!auth) throw new Error('Glean is not connected. Please Connect (OAuth).');
  const { text: out } = await runTurnWithFallback(
    auth,
    { system, history: [{ role: 'user', text: String(text || '') }], tools: [], maxTokens },
    model
  );
  return out || '';
}

// ── Routing targets: collect the registry's domain agents ───────────
function collectDomainAgents() {
  return db.listAgents()
    .filter((a) => a.meta && a.meta.department && !a.fake && !a.mcp && !a.skill)
    .map((a) => {
      const meta = a.card ? parseCard(a.card) : a.cardMeta;
      return {
        agentId: a.id,
        name: meta?.name || a.label,
        description: meta?.description || a.meta.description || '',
        url: meta?.url || a.baseUrl,
        auth: a.auth || 'none',
        department: a.meta.department,
        platform: a.meta.platform || 'Glean',
        permission: Array.isArray(a.meta.permission) ? a.meta.permission : [],
        rating: a.meta.rating ?? null,
        executionRating: a.meta.executionRating ?? null,
        gleanAgentId: a.meta.gleanAgentId || null, // when present, run the real agent via runs/stream
      };
    });
}

/** Whether userDept may use the agent (own department / company-wide / included in permission) */
function permissionAllows(agent, userDept) {
  const perm = agent.permission || [];
  if (!perm.length) return true; // unset = allow all
  if (perm.includes('Company-wide')) return true;
  if (agent.department === userDept) return true;
  return perm.includes(userDept);
}

// Demo safety: always override the recipient of email-sending tools with the
// address configured in app settings (prevents accidental sends). If no
// recipient is configured, the args are left untouched.
function forceEmailRecipient(toolName, args) {
  if (!/gmail|email|\bmail\b/i.test(String(toolName))) return args;
  const recipient = getEmailRecipient();
  if (!recipient) return args; // not configured -> do not override
  const out = { ...(args || {}) };
  let set = false;
  for (const k of Object.keys(out)) {
    if (/^(to|recipient|recipients|to_email|recipient_email|toaddress|to_address|torecipients|email)$/i.test(k)) {
      out[k] = Array.isArray(out[k]) ? [recipient] : recipient;
      set = true;
    }
    if (/^(cc|bcc)$/i.test(k)) delete out[k]; // strip extra recipients
  }
  if (!set) out.to = recipient; // add a recipient field if none present
  return out;
}

const langName = (lang) => (String(lang).toLowerCase().startsWith('ja') ? 'Japanese' : 'English');

function buildSystem({ userDept, contextBlock, agents, mcpToolNames = [], lang = 'en' }) {
  const emailRecipient = getEmailRecipient();
  const outLang = langName(lang);
  const roster = agents
    .map((a) => {
      const rating = a.rating != null ? `★${a.rating}` : '★-';
      const exec = a.executionRating != null ? `exec success ${Math.round(a.executionRating * 100)}%` : 'exec success -';
      return `  - ${a.name} (owner: ${a.department} / platform: ${a.platform} / allowed: ${a.permission.join(', ') || 'Company-wide'} / rating: ${rating} / ${exec}): ${a.description}`;
    })
    .join('\n');
  return `You are the in-house AI assistant "AI Buddy". You understand each employee's work context and proactively help them.
Current user's department: 【${userDept}】
Respond in ${outLang} — write BOTH your reasoning and your final answer in ${outLang}.

# Your knowledge as a personal assistant (from Glean personal memory)
${contextBlock || '(Personal context could not be fetched this time)'}

# Specialist agents you can call (per-department, scattered across multiple platforms, unified in the registry)
${roster}

# Glean tools you can use (actions / search)
${mcpToolNames.length ? mcpToolNames.map((n) => `  - ${n}`).join('\n') : '(none)'}
- When you need company-wide search, document retrieval, Jira creation, Slack/email sending, etc., call the Glean tools above directly (can be combined with routing to specialist agents).

# Tool execution policy (important — always follow)
- When the user clearly instructs a real action ("send", "post", "file a ticket", "create", etc.), do not stop to ask; **actually call the tool and execute it**. Emitting a long confirmation checklist and waiting is forbidden.
- Fill in missing parameters (recipient, channel, title, body, etc.) by **reasonably inferring from the conversation context, personal memory, or the immediately preceding agent output** and then execute. Base the body/summary on agent output or search results and avoid fabricating content (operational params like recipient or title may use reasonable defaults).
- Only when exactly one item that is strictly required and truly impossible to guess is missing (e.g. a recipient) should you briefly confirm that single item (infer everything else and proceed).
- Ending with a refusal like "I can't send because there isn't enough information" is not allowed. Execute first, then report the result (created issue ID, destination, post target, etc.).
- When multiple actions are instructed (e.g. file a Jira issue → notify on Slack), execute all of them in order.
${emailRecipient ? `- For email sends, always send to "${emailRecipient}" no matter who the user specifies (fixed demo recipient; also enforced server-side). Do not ask for the recipient.` : ''}

# Behavior
- Grasp the user's intent and route to the single most appropriate specialist agent (occasionally multiple) to answer.
- For cross-department requests (e.g. you're in Sales but want Legal to check something), relay to the appropriate agent on the user's behalf.
- Before calling an agent, always state a short "reasoning": ① how you interpreted the intent, and ② why that agent (from the owner department / platform / permission / rating angle) is best, in 1–2 sentences.
  * Do NOT write the final answer during this reasoning stage (compose the answer after the agent runs).
- The final permission decision is made server-side. If there's no permission, that is returned in the result, so explain it clearly to the user.
- When multiple agents can do the same job, choose by reliability signals (rating ★ and exec success rate). As a rule, prefer higher exec success = proven agents. Avoid, for important work, high-★ but low-exec-success ones (new/Beta with little track record) and low-success legacy platforms, and state the reason (success rate) in your reasoning. Adopt them only when the user explicitly requests it, adding a one-line note about the risk (low success rate).

# Questions that share a company-wide baseline but vary by role (important)
- Compensation, bonuses, HR policy, work rules, evaluations, expense reimbursement, travel policy, etc. need both a "company-wide baseline" and "per-role differences".
- For such questions, call the company-wide agent (whose name includes "Company-wide") together with the role-specific agents related to the topic, "all at once" in a single response (e.g. bonus → Company-wide Compensation Policy + Sales Incentive + Engineer Compensation + Manager Compensation simultaneously).
- Merge those results and answer clearly in the order: ① company-wide baseline → ② emphasize what applies to the user's role (${userDept}) → ③ the main differences from other roles.
- Do not fabricate any agent's answer; always integrate based on the actual tool output.

- Answer concisely in ${outLang}. At the end, add a next step informed by the user's work context when appropriate.`;
}

/**
 * Run AI Buddy and yield the timeline.
 * @param {object} p { task, userId, userDept, model }
 */
export async function* runBuddy({ task, userId = 'default', userDept = 'Sales', model: reqModel, priorTurns = [], lang = 'en' } = {}) {
  const auth = getGleanAuth(userId);
  if (!auth) {
    yield { type: 'error', message: 'Glean is not connected. Connect (OAuth) from the top right of the screen.' };
    return;
  }
  const { base, token } = auth;
  const model = reqModel || getGatewayDefaultModel() || DEFAULT_MODEL;

  // 1) Fetch personal memory live (personalization)
  let profile = null;
  try {
    profile = await getProfile(userId);
    yield {
      type: 'memory_loaded',
      tool: profile.tool,
      projects: profile.projects,
      threads: profile.threads,
      topics: profile.topics,
      collaborators: profile.collaborators,
    };
  } catch (e) {
    yield { type: 'memory_error', message: e.message };
  }
  const contextBlock = profile?.contextBlock || '';

  // 2) Turn routing-target agents into tools
  const agents = collectDomainAgents();
  if (!agents.length) {
    yield { type: 'error', message: 'No routable agents are registered (check the registry seed).' };
    return;
  }
  const taken = new Set();
  const bySlug = {};
  const tools = agents.map((a) => {
    const slug = slugify(a.name, taken);
    bySlug[slug] = a;
    return {
      name: slug,
      description: `${a.name} (${a.department} / ${a.platform}): ${a.description}. Put the question to pass to this agent in "input".`,
      parameters: { type: 'object', properties: { input: { type: 'string', description: 'The question to send to this agent' } }, required: ['input'] },
    };
  });

  // Make Glean MCP tools usable from AI Buddy too.
  // Exclude the memory tools (internal use) and ones that are unnecessary for the demo and cause errors
  // (artifact / image / skill / generic run_tool, etc.), presenting only action/search tools.
  const MCP_DENY = /^(memory|memory_schema|create_artifact|create_image|edit_artifact|edit_image|share_artifact|find_skills|read_skill_files|run_tool)$/i;
  let mcpToolNames = [];
  try {
    const mtools = (await mcpListTools(userId)).filter((t) => !MCP_DENY.test(t.name));
    for (const mt of mtools) {
      const slug = slugify(`tool_${mt.name}`, taken);
      bySlug[slug] = { mcpTool: true, name: mt.name };
      mcpToolNames.push(mt.name);
      tools.push({
        name: slug,
        description: `[Glean tool] ${mt.name}: ${(mt.description || '').slice(0, 160)}`,
        parameters: mt.inputSchema && typeof mt.inputSchema === 'object' ? mt.inputSchema : { type: 'object', properties: {} },
      });
    }
  } catch { /* if fetching fails, continue with no tools */ }

  const system = buildSystem({ userDept, contextBlock, agents, mcpToolNames, lang });
  // Stack prior turns (the user/assistant exchanges of the same conversation) as leading context → multi-turn continuity.
  const history = [];
  for (const tn of priorTurns) {
    if (tn && tn.role && (tn.text || '').trim()) history.push({ role: tn.role === 'assistant' ? 'assistant' : 'user', text: String(tn.text) });
  }
  history.push({ role: 'user', text: task || '' });
  let notedModel = null;
  let finalText = '';

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      // If the model fails, auto-fall back to a usable model
      const turnRes = await runTurnWithFallback({ base, token }, { system, history, tools }, model);
      if (turnRes.model !== model && notedModel !== turnRes.model) {
        notedModel = turnRes.model;
        yield { type: 'assistant', text: `⚠ The specified model is unavailable, continuing with "${turnRes.model}".` };
      }
      const { text, toolCalls } = turnRes;

      // No tool calls = final answer. Emit the answer only as final (not duplicated as reasoning).
      if (!toolCalls.length) {
        finalText = text || '';
        yield { type: 'final', text: finalText };
        break;
      }

      // There are tool calls = the "reasoning" before routing. Emit it separately from the answer.
      if (text && text.trim()) yield { type: 'thinking', text: text.trim() };

      history.push({ role: 'assistant', text, toolCalls });
      for (const call of toolCalls) {
        const agent = bySlug[call.name];
        const input = call.args?.input ?? '';
        if (!agent) {
          history.push({ role: 'tool', toolCallId: call.id, text: `ERROR: unknown agent ${call.name}` });
          continue;
        }
        // Glean tool (MCP) call
        if (agent.mcpTool) {
          const callArgs = forceEmailRecipient(agent.name, call.args || {});
          yield { type: 'tool_use', tool: agent.name, input: truncate(JSON.stringify(callArgs), 300) };
          let toolResult;
          try { toolResult = await mcpCallTool(agent.name, callArgs, userId); }
          catch (e) { toolResult = `ERROR: ${e.message}`; }
          yield { type: 'tool_result', worker: agent.name, isTool: true, result: truncate(toolResult, 800) };
          history.push({ role: 'tool', toolCallId: call.id, text: toolResult });
          continue;
        }
        // routing_decision (visualize permission decision and rating)
        const allowed = permissionAllows(agent, userDept);
        yield {
          type: 'routing_decision',
          agent: {
            name: agent.name, department: agent.department, platform: agent.platform,
            permission: agent.permission, rating: agent.rating, executionRating: agent.executionRating,
          },
          reason: (text || '').trim().slice(0, 240),
          userDept, permissionOk: allowed,
        };
        if (!allowed) {
          const denied = `[Permission error] ${userDept} does not have permission to use "${agent.name}" (owner: ${agent.department}) (allowed: ${agent.permission.join(', ') || 'Company-wide'}).`;
          yield { type: 'tool_result', worker: agent.name, denied: true, result: denied };
          history.push({ role: 'tool', toolCallId: call.id, text: denied });
          continue;
        }
        yield { type: 'tool_call', worker: agent.name, department: agent.department, platform: agent.platform, input: truncate(input, 300) };
        let result;
        try {
          if (agent.gleanAgentId) {
            // Real Glean agent → run via runs/stream (incremental display + avoids fetch failed)
            result = '';
            for await (const delta of streamGleanAgent(userId, agent.gleanAgentId, String(input))) {
              result += delta;
              yield { type: 'worker_delta', worker: agent.name, result: truncate(result, 4000) };
            }
            if (!result) result = '(No response from the agent)';
          } else {
            const raw = await messageSend(agent.url, String(input), { token: agent.auth === 'none' ? null : token });
            result = extractText(raw) || (typeof raw === 'string' ? raw : JSON.stringify(raw));
          }
        } catch (e) {
          result = `ERROR: ${e.message}`;
        }
        yield { type: 'tool_result', worker: agent.name, result: truncate(result, 800) };
        history.push({ role: 'tool', toolCallId: call.id, text: result });
      }
    }
    if (!finalText) yield { type: 'final', text: '(Reached the step limit)' };

    // 4) Proactive suggestions (conversation context + memory). Fall back to memory-derived ones if LLM generation fails.
    const turnFn = ({ system, history, tools }) => runTurnWithFallback({ base, token }, { system, history, tools }, providerOf(model) === 'anthropic' ? model : DEFAULT_MODEL);
    const suggestions = await generateSuggestions({ turnFn, finalText, task, profile, userDept, lang });
    if (suggestions.length) yield { type: 'suggestions', suggestions };
  } catch (e) {
    yield { type: 'error', message: `AI Buddy run failed: ${e.message}` };
  }
}

/** Generate 3 next steps. On failure, fall back to memory-derived suggestions. */
async function generateSuggestions({ turnFn, finalText, task, profile, userDept, lang = 'en' }) {
  const fallback = (profile?.suggestions || []).slice(0, 3).map((s) => ({ title: s.title, prompt: s.prompt }));
  try {
    const sys = `You are the in-house AI Buddy. Based on the user's (${userDept}) recent exchange and work context, output 3 concrete next-action suggestions in ${langName(lang)}, one per line, each prefixed with "- ". No preamble or closing text.`;
    const ctx = `# Recent question\n${task}\n\n# Answer summary\n${(finalText || '').slice(0, 600)}\n\n# Work context\n${(profile?.contextBlock || '').slice(0, 600)}`;
    const { text } = await turnFn({ system: sys, history: [{ role: 'user', text: ctx }], tools: [] });
    const items = String(text || '')
      .split('\n').map((l) => l.replace(/^\s*[-*\d.)]+\s*/, '').trim()).filter((l) => l.length > 3)
      .slice(0, 3)
      .map((l) => ({ title: l.slice(0, 60), prompt: l }));
    return items.length ? items : fallback;
  } catch {
    return fallback;
  }
}
