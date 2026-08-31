// Responsible for fetching and parsing the Agent Card.
// Fetching is always done on the backend (avoids CORS + hides secrets).

const WELL_KNOWN_NEW = '/.well-known/agent-card.json'; // new spec
const WELL_KNOWN_OLD = '/.well-known/agent.json'; // old spec fallback

/** Infer the base URL (origin + path basis) from the input URL */
export function deriveBaseUrl(inputUrl) {
  const u = new URL(inputUrl);
  // If a well-known path is included, strip it and use the origin as the base
  if (u.pathname.includes('/.well-known/')) {
    return `${u.origin}`;
  }
  // Treat the path with the trailing slash removed as the base
  return `${u.origin}${u.pathname}`.replace(/\/$/, '');
}

/** Build a list of candidate card URLs from the given input */
export function candidateCardUrls(inputUrl) {
  const urls = [];
  const u = new URL(inputUrl);

  if (u.pathname.endsWith('.json') || u.pathname.includes('/.well-known/')) {
    // Already looks like a card URL, so keep it as the top priority
    urls.push(inputUrl);
    // Also add the new->old mutual fallbacks
    const origin = u.origin;
    urls.push(`${origin}${WELL_KNOWN_NEW}`);
    urls.push(`${origin}${WELL_KNOWN_OLD}`);
  } else {
    const base = `${u.origin}${u.pathname}`.replace(/\/$/, '');
    urls.push(`${base}${WELL_KNOWN_NEW}`);
    urls.push(`${base}${WELL_KNOWN_OLD}`);
    // Also try directly under the origin (a safeguard when the base has a path)
    if (base !== u.origin) {
      urls.push(`${u.origin}${WELL_KNOWN_NEW}`);
      urls.push(`${u.origin}${WELL_KNOWN_OLD}`);
    }
  }
  // Deduplicate
  return [...new Set(urls)];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryFetchOnce(url, { headers = {}, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // HTTP errors are not retryable (retrying 404/401 etc. is pointless)
      return { ok: false, status: res.status, url, retryable: false };
    }
    const text = await res.text();
    try {
      return { ok: true, url, json: JSON.parse(text) };
    } catch {
      return { ok: false, status: res.status, url, error: 'invalid JSON', retryable: false };
    }
  } catch (e) {
    // Network-layer failures (fetch failed / timeout / ECONNRESET) are retryable
    return {
      ok: false,
      url,
      error: e.name === 'AbortError' ? 'timeout' : e.message,
      retryable: true,
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * To be resilient to transient network failures (fetch failed etc.),
 * retry only retryable failures up to 2 times with exponential backoff.
 */
async function tryFetchJson(url, opts = {}) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await tryFetchOnce(url, opts);
    if (last.ok || !last.retryable) return last;
    if (attempt < 2) await sleep(300 * (attempt + 1)); // 300ms, 600ms
  }
  return last;
}

/**
 * Fallback for implementations that return the card via agent/getCard JSON-RPC.
 * Sends JSON-RPC to the A2A endpoint (base URL).
 */
async function tryGetCardRpc(baseUrl, { headers = {} } = {}) {
  const body = {
    jsonrpc: '2.0',
    id: 'getcard-' + Math.floor(Math.random() * 1e6),
    method: 'agent/getCard',
    params: {},
  };
  try {
    const r = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const json = await r.json();
    if (json.result) return { ok: true, url: baseUrl, json: json.result, viaRpc: true };
    return { ok: false, error: json.error?.message || 'no result' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Resolve the card. Tries in order: well-known (new) -> well-known (old) -> agent/getCard.
 * @param {string} inputUrl base URL or Agent Card URL
 * @param {object} opts { headers } auth headers, etc.
 */
export async function resolveAgentCard(inputUrl, opts = {}) {
  const attempts = [];
  const headers = opts.headers || {};

  for (const url of candidateCardUrls(inputUrl)) {
    const r = await tryFetchJson(url, { headers });
    attempts.push({ url, ok: r.ok, status: r.status, error: r.error });
    if (r.ok && r.json && (r.json.name || r.json.protocolVersion || r.json.skills)) {
      return { card: r.json, sourceUrl: url, via: 'well-known', attempts };
    }
  }

  // JSON-RPC agent/getCard fallback
  const base = deriveBaseUrl(inputUrl);
  const rpc = await tryGetCardRpc(base, { headers });
  attempts.push({ url: base, method: 'agent/getCard', ok: rpc.ok, error: rpc.error });
  if (rpc.ok && rpc.json) {
    return { card: rpc.json, sourceUrl: base, via: 'agent/getCard', attempts };
  }

  const err = new Error('Could not fetch the Agent Card');
  err.attempts = attempts;
  throw err;
}

/**
 * Extract display metadata from the Agent Card. Supports both new and old schemas.
 */
export function parseCard(card) {
  if (!card || typeof card !== 'object') return null;

  // Resolve the auth method: securitySchemes (new) / authentication.schemes (old)
  const authSchemes = extractAuthSchemes(card);

  const skills = Array.isArray(card.skills)
    ? card.skills.map((s) => ({
        id: s.id || s.name,
        name: s.name || s.id,
        description: s.description || '',
        tags: Array.isArray(s.tags) ? s.tags : [],
        examples: Array.isArray(s.examples) ? s.examples : [],
      }))
    : [];

  const capabilities = card.capabilities || {};
  const iface = resolveInterface(card);

  return {
    name: card.name || '(no name)',
    description: card.description || '',
    // Pick up an icon URL if the card has one (A2A extension; Glean does not have it)
    iconUrl: card.iconUrl || card.logoUrl || card.icon || null,
    version: card.version || null,
    protocolVersion:
      card.protocolVersion || card.protocol_version || iface?.protocolVersion || null,
    provider: card.provider
      ? {
          organization: card.provider.organization || card.provider.name || null,
          url: card.provider.url || null,
        }
      : null,
    // A2A JSON-RPC endpoint. top-level url (old/Glean) -> supportedInterfaces (new a2a-sdk)
    url: card.url || iface?.url || null,
    // Which transport/protocol dialect (used to branch message/stream calls)
    transport: (card.preferredTransport || iface?.protocolBinding || 'JSONRPC').toUpperCase(),
    capabilities: {
      streaming: !!capabilities.streaming,
      pushNotifications: !!capabilities.pushNotifications,
      stateTransitionHistory: !!capabilities.stateTransitionHistory,
    },
    skills,
    // The full set of tags (for filtering)
    allTags: [...new Set(skills.flatMap((s) => s.tags))],
    authSchemes, // [{ scheme: 'oauth2'|'bearer'|'none'|..., detail }]
    authKinds: [...new Set(authSchemes.map((a) => a.kind))],
    verified: Array.isArray(card.signatures) && card.signatures.length > 0,
    defaultInputModes: card.defaultInputModes || card.defaultInputModes || [],
    defaultOutputModes: card.defaultOutputModes || [],
  };
}

/**
 * Resolve the A2A endpoint of a new-spec card.
 * Picks the url from supportedInterfaces / additionalInterfaces (preferring JSONRPC).
 */
function resolveInterface(card) {
  const list = card.supportedInterfaces || card.additionalInterfaces || [];
  if (!Array.isArray(list) || list.length === 0) return null;
  // Prefer the JSONRPC binding. Otherwise the first one.
  const jsonrpc = list.find(
    (i) => String(i.protocolBinding || i.transport || '').toUpperCase() === 'JSONRPC'
  );
  const pick = jsonrpc || list[0];
  return {
    url: pick.url || null,
    protocolBinding: pick.protocolBinding || pick.transport || null,
    protocolVersion: pick.protocolVersion || pick.protocol_version || null,
  };
}

/** Normalize and extract auth schemes from both new and old schemas */
function extractAuthSchemes(card) {
  const out = [];

  // New spec: securitySchemes { name: { type, flows, scheme, ... } }
  if (card.securitySchemes && typeof card.securitySchemes === 'object') {
    for (const [name, def] of Object.entries(card.securitySchemes)) {
      out.push(normalizeScheme(name, def));
    }
  }

  // Old spec: authentication.schemes: ['Bearer', 'OAuth2', ...] or [{...}]
  const legacy = card.authentication?.schemes;
  if (Array.isArray(legacy)) {
    for (const s of legacy) {
      if (typeof s === 'string') {
        out.push(normalizeScheme(s, { type: s }));
      } else if (s && typeof s === 'object') {
        out.push(normalizeScheme(s.name || s.type || 'unknown', s));
      }
    }
  }

  if (out.length === 0) {
    out.push({ name: 'none', kind: 'none', detail: null });
  }
  return dedupeSchemes(out);
}

function normalizeScheme(name, def = {}) {
  const type = String(def.type || name || '').toLowerCase();
  let kind = 'other';
  if (type.includes('oauth')) kind = 'oauth2';
  else if (type.includes('http') && String(def.scheme || '').toLowerCase() === 'bearer')
    kind = 'bearer';
  else if (type.includes('bearer')) kind = 'bearer';
  else if (type.includes('apikey') || type.includes('api_key')) kind = 'apiKey';
  else if (type === 'none' || type === '') kind = 'none';

  // Dig out the OAuth2 authorize/token URLs
  let oauth = null;
  const flows = def.flows || {};
  const ac = flows.authorizationCode || flows.authorization_code;
  if (kind === 'oauth2') {
    oauth = {
      authorizationUrl: ac?.authorizationUrl || def.authorizationUrl || null,
      tokenUrl: ac?.tokenUrl || def.tokenUrl || null,
      scopes: ac?.scopes ? Object.keys(ac.scopes) : def.scopes ? Object.keys(def.scopes) : [],
    };
  }

  return { name, kind, detail: def.description || null, oauth };
}

function dedupeSchemes(schemes) {
  const seen = new Set();
  const out = [];
  for (const s of schemes) {
    const key = `${s.kind}:${s.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
