// Glean MCP Gateway client (Model Context Protocol / Streamable HTTP).
// Endpoint: {instanceUrl}/mcp/{server} (default is 'default'; override with GLEAN_MCP_URL).
// Auth: injects the connected Glean OAuth token (getGleanAuth) as Bearer.
// Required scopes: MCP, SEARCH, CHAT, AGENTS, DOCUMENTS, TOOLS, ENTITIES.
import { config } from '../config.js';
import { getGleanAuth } from '../routes/llmGateway.js';

export function mcpUrl() {
  if (process.env.GLEAN_MCP_URL) return process.env.GLEAN_MCP_URL;
  const base = config.glean.instanceUrl;
  const server = process.env.GLEAN_MCP_SERVER || 'default';
  return base ? `${base}/mcp/${server}` : null;
}

/** Extract the message from a JSON or SSE-wrapped JSON-RPC response */
function parseRpcBody(text, contentType) {
  const t = String(text || '');
  if ((contentType && contentType.includes('text/event-stream')) || /(^|\n)data:/.test(t)) {
    let last = null;
    for (const block of t.replace(/\r\n/g, '\n').split('\n\n')) {
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        if (j && (j.jsonrpc || j.result || j.error || j.id !== undefined)) last = j;
      } catch {
        /* skip */
      }
    }
    return last;
  }
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** A single JSON-RPC call (notifications have no id and no response body) */
async function mcpRpc({ token, sessionId, method, params, isNotification = false }) {
  const url = mcpUrl();
  if (!url) throw new Error('GLEAN_INSTANCE_URL is not set (cannot resolve the MCP URL)');
  const headers = {
    Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    'content-type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const body = {
    jsonrpc: '2.0',
    method,
    ...(isNotification ? {} : { id: Math.floor(Math.random() * 1e9) }),
    ...(params ? { params } : {}),
  };
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = r.headers.get('mcp-session-id') || sessionId || null;
  const text = await r.text();
  if (!r.ok) {
    const j = parseRpcBody(text, r.headers.get('content-type'));
    const detail = j?.error?.message || j?.error_description || j?.error || text.slice(0, 200);
    const e = new Error(`MCP ${r.status}: ${detail}`);
    e.status = r.status;
    throw e;
  }
  if (isNotification) return { sessionId: sid, result: null };
  const j = parseRpcBody(text, r.headers.get('content-type'));
  if (j?.error) throw new Error(`MCP ${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return { sessionId: sid, result: j?.result };
}

/** Perform initialize -> notifications/initialized, then run the callback with a session */
async function withSession(token, fn) {
  const init = await mcpRpc({
    token,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'a2a-demo', version: '1.0.0' },
    },
  });
  const sessionId = init.sessionId;
  try {
    await mcpRpc({ token, sessionId, method: 'notifications/initialized', isNotification: true });
  } catch {
    /* some servers don't need this */
  }
  return fn(sessionId);
}

/** Get the tool list: [{ name, description, inputSchema }] */
export async function mcpListTools(userId = 'default') {
  const auth = getGleanAuth(userId);
  if (!auth) throw new Error('Glean is not connected. Please Connect Glean in the UI.');
  return withSession(auth.token, async (sessionId) => {
    const { result } = await mcpRpc({ token: auth.token, sessionId, method: 'tools/list' });
    return (result?.tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || t.input_schema || { type: 'object', properties: {} },
    }));
  });
}

/** Execute a tool and return the result text */
export async function mcpCallTool(name, args, userId = 'default') {
  const auth = getGleanAuth(userId);
  if (!auth) throw new Error('Glean is not connected. Please Connect Glean in the UI.');
  return withSession(auth.token, async (sessionId) => {
    const { result } = await mcpRpc({
      token: auth.token,
      sessionId,
      method: 'tools/call',
      params: { name, arguments: args || {} },
    });
    if (result?.isError) {
      const msg = (result.content || []).map((c) => c.text || '').join('\n');
      throw new Error(msg || 'tool error');
    }
    const text = (result?.content || [])
      .map((c) => (c.type === 'text' ? c.text : c.text || JSON.stringify(c)))
      .filter(Boolean)
      .join('\n');
    return text || JSON.stringify(result || {});
  });
}
