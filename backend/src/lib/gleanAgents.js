// Search and run the tenant's "real Glean agents".
//   Search: POST {base}/rest/api/v1/agents/search { query }
//   Run: POST {base}/rest/api/v1/agents/runs/wait { agent_id, input:{ text } }
// Both inject the connected OAuth token (LLM_PROXY/AGENTS scopes) as Bearer.
import { getGleanAuth } from '../routes/llmGateway.js';

function headers(token) {
  return {
    Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    'content-type': 'application/json',
    Accept: 'application/json',
  };
}

/** Search for real agents (excludes noisy test/draft ones and dedupes by name) */
export async function searchGleanAgents(userId, query, { limit = 25 } = {}) {
  const auth = getGleanAuth(userId);
  if (!auth) throw new Error('Glean is not connected. Please Connect (OAuth).');
  const res = await fetch(`${auth.base}/rest/api/v1/agents/search`, {
    method: 'POST', headers: headers(auth.token), body: JSON.stringify({ query: query || '' }),
  });
  if (!res.ok) throw new Error(`agents/search ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = await res.json();
  const arr = j.agents || j.results || j.data || [];
  // Broadly exclude test/draft/internal-verification noise (test tenants are messy)
  const JUNK = /\btest\b|testing|regress|recheck|consistency|\bround\b|starttime|inbound|outbound|do not delete|\bdnd\b|share modal|hero central|untitled|\(copy\)|default draft|sandbox|preview|dummy|demo agent|scratch|\btemp\b|\bwip\b|\bv\d\b/i;
  // The agents/search API ignores the query and returns everything, so we filter by query here.
  const terms = (query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const seen = new Set();
  const all = [];
  for (const a of arr) {
    const name = (a.name || '').trim();
    if (!name || JUNK.test(name)) continue;
    if (terms.length) {
      const hay = `${name} ${a.description || ''}`.toLowerCase();
      if (!terms.every((tm) => hay.includes(tm))) continue; // only those whose name + description contain all terms
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({
      agentId: a.agent_id || a.agentId || a.id,
      name,
      description: (a.description || '').trim(),
      streaming: !!(a.capabilities && a.capabilities['ap.io.streaming']),
    });
  }
  // Prioritize "usable-looking" ones that have a description
  all.sort((x, y) => (y.description ? 1 : 0) - (x.description ? 1 : 0));
  return all.slice(0, limit);
}

/**
 * Run a real agent via runs/stream and yield text deltas incrementally.
 * runs/wait blocks synchronously for 5+ minutes and causes fetch failed, so we use streaming.
 * SSE: each `data:` line is { messages:[{ role, content:[{ text, type }] }] }, where text is a delta.
 */
export async function* streamGleanAgent(userId, agentId, text) {
  const auth = getGleanAuth(userId);
  if (!auth) throw new Error('Glean is not connected.');
  const res = await fetch(`${auth.base}/rest/api/v1/agents/runs/stream`, {
    method: 'POST',
    headers: { ...headers(auth.token), Accept: 'text/event-stream' },
    body: JSON.stringify({ agent_id: agentId, input: { text: String(text || '') }, stream: true }),
  });
  if (!res.ok) throw new Error(`agents/runs/stream ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      const m = line.match(/^data:\s?(.*)$/);
      if (!m) continue;
      const payload = m[1];
      if (!payload || payload === '[DONE]') continue;
      let obj; try { obj = JSON.parse(payload); } catch { continue; }
      for (const msg of obj.messages || []) {
        for (const c of msg.content || []) if (c.text) yield c.text;
      }
    }
  }
}

/** Run a single real agent and return the full answer text (aggregates streaming internally). */
export async function runGleanAgent(userId, agentId, text) {
  let out = '';
  for await (const delta of streamGleanAgent(userId, agentId, text)) out += delta;
  return out || '(No response from the agent)';
}

/** Fetch details for one agent (to fill in the description when adding) */
export async function getGleanAgent(userId, agentId) {
  const auth = getGleanAuth(userId);
  if (!auth) throw new Error('Glean is not connected.');
  const res = await fetch(`${auth.base}/rest/api/v1/agents/${encodeURIComponent(agentId)}`, { headers: headers(auth.token) });
  if (!res.ok) return null;
  return res.json();
}
