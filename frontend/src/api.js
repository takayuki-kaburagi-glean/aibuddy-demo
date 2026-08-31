// Thin client for the backend. All external communication goes through the backend proxy.
async function j(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  health: () => j('/api/health'),
  gleanInfo: (userId = 'default') => j(`/api/buddy/glean?userId=${encodeURIComponent(userId)}`),
  profile: (userId = 'default') => j(`/api/buddy/profile?userId=${encodeURIComponent(userId)}`),
  listAgents: () => j('/api/agents'),
  // Search, add, and delete real Glean agents
  gleanSearch: (q, userId = 'default') => j(`/api/agents/glean/search?userId=${encodeURIComponent(userId)}&q=${encodeURIComponent(q || '')}`),
  gleanAdd: (agent, userId = 'default') =>
    j(`/api/agents/glean/add?userId=${encodeURIComponent(userId)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: agent.agentId, name: agent.name, description: agent.description }),
    }),
  deleteAgent: (id) => j(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  oauthAuthorize: (agentId, userId = 'default') =>
    j(`/oauth/authorize?agentId=${encodeURIComponent(agentId)}&userId=${encodeURIComponent(userId)}`),
  oauthStatus: (agentId, userId = 'default') =>
    j(`/api/oauth/status?agentId=${encodeURIComponent(agentId)}&userId=${encodeURIComponent(userId)}`),
  oauthDisconnect: (agentId, userId = 'default') =>
    j('/api/oauth/disconnect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId, userId }),
    }),

  models: (userId = 'default') => j(`/api/llm-gateway/model?userId=${encodeURIComponent(userId)}`),
  setModel: (model) =>
    j('/api/llm-gateway/model', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
    }),
  // Model catalog provided by the LLM Gateway (full lineup, fetched live)
  listGatewayModels: (userId = 'default') => j(`/api/llm-gateway/models?userId=${encodeURIComponent(userId)}`),
  // Actually call the given model once to measure whether it responds. enable=true adds it to the "enabled models".
  probeModel: (model, enable = false) =>
    j(`/api/llm-gateway/probe?model=${encodeURIComponent(model)}&max=512${enable ? '&enable=1' : ''}`),
  disableModel: (model) => j(`/api/llm-gateway/models/verified?model=${encodeURIComponent(model)}`, { method: 'DELETE' }),

  // Glean MCP tools (Tools tab)
  listTools: (userId = 'default') => j(`/api/mcp/tools?userId=${encodeURIComponent(userId)}`),
  callTool: (name, args, userId = 'default') =>
    j(`/api/mcp/call?userId=${encodeURIComponent(userId)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, args }),
    }),

  // Returned Personal Memory content (for the Memory tab).
  //   lang='ja' -> Japanese (translated only on first call and cached on the server) / omitted -> raw data from MCP (original)
  memory: (lang, userId = 'default') =>
    j(`/api/buddy/memory?userId=${encodeURIComponent(userId)}${lang === 'ja' ? '&lang=ja' : ''}`),

  // App settings (e.g. demo email recipient)
  getSettings: () => j('/api/settings'),
  setSettings: (patch) =>
    j('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  // Run history (History tab)
  listRuns: () => j('/api/buddy/runs'),
  getRun: (id) => j(`/api/buddy/runs/${encodeURIComponent(id)}`),
  deleteRun: (id) => j(`/api/buddy/runs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  clearRuns: () => j('/api/buddy/runs/clear', { method: 'POST' }),

  // Translate arbitrary text via the Glean LLM Gateway (Anthropic-native path) (the live-translate button in the Memory tab)
  translate: (text, target = '日本語') =>
    j('/api/buddy/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, target }),
    }).then((r) => r.text || ''),

  // SSE URL for AI Buddy runs (subscribe with EventSource)
  chatStreamUrl: ({ q, userId = 'default', dept = 'Sales', model, cid, lang }) => {
    const p = new URLSearchParams({ q, userId, dept });
    if (model) p.set('model', model);
    if (cid) p.set('cid', cid);
    if (lang) p.set('lang', lang);
    return `/api/buddy/chat?${p.toString()}`;
  },

  // SSE URL for chat mode (passes through Glean chat as-is)
  gchatUrl: ({ q, userId = 'default', agent = 'DEFAULT', save = false, include = '', exclude = '', tz = 0 }) => {
    const p = new URLSearchParams({ q, userId, agent, save: save ? '1' : '0', tz: String(tz) });
    if (include) p.set('include', include);
    if (exclude) p.set('exclude', exclude);
    return `/api/buddy/gchat?${p.toString()}`;
  },
};
