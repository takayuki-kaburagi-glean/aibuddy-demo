import express from 'express';
import { config } from '../config.js';
import { getProfile } from '../lib/memory.js';
import { runBuddy, complete } from '../lib/buddy.js';
import { getGleanAuth, findGleanAgent } from './llmGateway.js';
import { sessions } from '../lib/sessions.js';
import { getCached, setCached, hashStr } from '../lib/translateCache.js';
import { db } from '../db.js';

export const buddyRouter = express.Router();

// Run history management
buddyRouter.get('/runs', (req, res) => res.json({ runs: db.listRuns() }));
buddyRouter.post('/runs/clear', (req, res) => { db.clearRuns(); res.json({ ok: true }); });
buddyRouter.get('/runs/:id', (req, res) => {
  const r = db.getRun(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(r);
});
buddyRouter.delete('/runs/:id', (req, res) => res.json({ ok: db.deleteRun(req.params.id) }));

// ── Japanese translation of memory (server-side, via LLM Gateway) ─────────────────────────
// Translate multiple lines in a single LLM call and map them back by number.
async function translateLinesSrv(userId, lines) {
  const src = lines.filter((l) => l && String(l).trim());
  if (!src.length) return {};
  const numbered = src.map((l, i) => `${i + 1}. ${String(l).replace(/\s*\n\s*/g, ' ')}`).join('\n');
  const sys = 'You are a professional translator. Translate each line into natural Japanese and output one line at a time in the form "N. translation" (keeping the original number). Keep proper nouns, IDs, PR numbers, slugs, and tool names as-is. Output only the translations.';
  const out = await complete({ userId, system: sys, text: numbered, maxTokens: 3072 });
  const map = {};
  for (const line of String(out).split('\n')) {
    const m = line.match(/^\s*(\d+)[.)]\s*(.+)$/);
    if (m) map[Number(m[1]) - 1] = m[2].trim();
  }
  const dict = {};
  src.forEach((l, i) => { dict[l] = map[i] ?? l; });
  return dict;
}
async function translateParsedSrv(userId, parsed) {
  const set = new Set();
  const add = (s) => { if (s && String(s).trim()) set.add(String(s)); };
  for (const k of ['projects', 'threads', 'summaries']) (parsed[k] || []).forEach((x) => { add(x.label); add(x.detail); });
  (parsed.topics || []).forEach(add);
  (parsed.preferences || []).forEach(add);
  const dict = await translateLinesSrv(userId, [...set]);
  const tr = (s) => (s ? (dict[String(s)] ?? s) : s);
  const mapItems = (arr) => (arr || []).map((x) => ({ label: tr(x.label), detail: tr(x.detail) }));
  return {
    projects: mapItems(parsed.projects), threads: mapItems(parsed.threads), summaries: mapItems(parsed.summaries),
    topics: (parsed.topics || []).map(tr), preferences: (parsed.preferences || []).map(tr),
    collaborators: parsed.collaborators || [], // keep person names as-is
  };
}
async function translateTextSrv(userId, text) {
  if (!text || !text.trim()) return text;
  return complete({
    userId,
    system: 'Translate the input into natural Japanese and output only the translation (no preamble). Keep IDs, PR numbers, slugs, tool names, and code as-is.',
    text, maxTokens: 8192,
  });
}

// Return the id and connection status of the Glean agent used for Connect (OAuth).
buddyRouter.get('/glean', (req, res) => {
  const userId = req.query.userId || 'default';
  const agent = findGleanAgent();
  if (!agent) return res.json({ agentId: null, connected: false, reason: 'Glean agent not registered' });
  const tok = sessions.getToken(agent.id, userId);
  res.json({
    agentId: agent.id,
    label: agent.label || 'Glean',
    connected: !!tok,
    expired: tok?.expiresAt ? Date.now() > tok.expiresAt : false,
  });
});

// Personalization: fetch memory live and return material for the greeting / proactive suggestions.
buddyRouter.get('/profile', async (req, res) => {
  const userId = req.query.userId || 'default';
  if (!getGleanAuth(userId)) {
    return res.status(401).json({ error: 'Glean is not connected. Please Connect (OAuth).' });
  }
  try {
    const profile = await getProfile(userId);
    res.json({
      projects: profile.projects,
      threads: profile.threads,
      topics: profile.topics,
      collaborators: profile.collaborators,
      preferences: profile.preferences,
      suggestions: profile.suggestions,
      tool: profile.tool,
    });
  } catch (e) {
    res.status(e.code === 'NO_MEMORY_TOOL' ? 400 : 502).json({ error: e.message, code: e.code || null });
  }
});

// For the Memory tab: return the memory content (categories, parsed result, raw sample).
//   lang unset  → raw data from MCP (original; fetched live each time via the "Original" button)
//   lang=ja     → Japanese translation. Translated only on first request and cached to disk; returned instantly afterwards (not re-translated each time)
buddyRouter.get('/memory', async (req, res) => {
  const userId = req.query.userId || 'default';
  const wantJa = req.query.lang === 'ja';
  if (!getGleanAuth(userId)) {
    return res.status(401).json({ error: 'Glean is not connected. Please Connect (OAuth).' });
  }
  try {
    const p = await getProfile(userId, { limit: Number(req.query.limit) || 12 });
    const base = {
      tool: p.tool,
      categories: p.categories,
      rawLength: p.rawLength,
      parsed: {
        projects: p.projects, threads: p.threads, topics: p.topics,
        collaborators: p.collaborators, preferences: p.preferences, summaries: p.summaries,
      },
      suggestions: p.suggestions,
      sample: p.sample,
    };
    if (!wantJa) return res.json({ ...base, lang: 'raw', translated: false });

    // Japanese: cache by content signature (re-translate if content changes)
    const sig = hashStr(`${p.rawLength}|${(p.sample || '').slice(0, 300)}|${(p.projects || []).length}|${(p.threads || []).length}`);
    const cached = getCached(userId, sig);
    if (cached) return res.json({ ...cached, lang: 'ja', translated: true, cached: true });

    const [parsed, sample] = await Promise.all([
      translateParsedSrv(userId, base.parsed),
      translateTextSrv(userId, p.sample),
    ]);
    const out = { tool: p.tool, categories: p.categories, rawLength: p.rawLength, parsed, suggestions: p.suggestions, sample };
    setCached(userId, sig, out);
    return res.json({ ...out, lang: 'ja', translated: true, cached: false });
  } catch (e) {
    res.status(e.code === 'NO_MEMORY_TOOL' ? 400 : 502).json({ error: e.message, code: e.code || null });
  }
});

// On-the-fly translation: translate arbitrary text via the Glean LLM Gateway (Anthropic-native route).
buddyRouter.post('/translate', async (req, res) => {
  const userId = req.query.userId || req.body?.userId || 'default';
  const text = (req.body?.text || '').toString();
  const target = (req.body?.target || 'Japanese').toString();
  if (!text.trim()) return res.status(400).json({ error: 'text is empty' });
  if (!getGleanAuth(userId)) return res.status(401).json({ error: 'Glean is not connected.' });
  const system = `You are a professional translator. Translate the input text into natural ${target}. Preserve structure such as headings, bullet lists, and symbols, and output only the translation (no preamble or explanation). Keep proper nouns, IDs, and code (PR numbers / slugs / tool names, etc.) as-is.`;
  try {
    const out = await complete({ userId, system, text, maxTokens: 4096 });
    res.json({ text: out });
  } catch (e) {
    res.status(502).json({ error: `Translation failed: ${e.message}` });
  }
});

// ── Chat mode: stream Glean's Chat API as-is (no routing) ──
// query: q (required) / userId / agent(DEFAULT|GPT) / save(0|1) / include / exclude / tz / timeout
function extractChat(obj) {
  const msgs = obj?.messages || [];
  let answer = '';
  const steps = [];
  let citations = [];
  for (const m of msgs) {
    if (m.author !== 'GLEAN_AI') continue;
    if (m.messageType === 'CONTENT') {
      answer += (m.fragments || []).map((f) => f.text || '').join('');
      if (Array.isArray(m.citations) && m.citations.length) citations = m.citations;
    } else {
      const name = (m.fragments || []).map((f) => f.text || f.action?.metadata?.displayName || '').join('').trim();
      if (name) steps.push(name.replace(/\*\*/g, ''));
    }
  }
  return { answer, steps: [...new Set(steps)], citations };
}

buddyRouter.get('/gchat', async (req, res) => {
  const userId = req.query.userId || 'default';
  const q = (req.query.q || '').toString();
  const auth = getGleanAuth(userId);

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  if (!auth) { send({ type: 'error', message: 'Glean is not connected. Please Connect (OAuth).' }); return res.end(); }
  if (!q.trim()) { send({ type: 'error', message: 'q is empty.' }); return res.end(); }

  const parseList = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);
  const body = {
    messages: [{ author: 'USER', messageType: 'CONTENT', fragments: [{ text: q }] }],
    stream: true,
    saveChat: req.query.save === '1',
    agentConfig: { agent: (req.query.agent || 'DEFAULT').toString(), mode: 'DEFAULT' },
    timezoneOffset: Number(req.query.tz) || 0,
  };
  const inc = parseList(req.query.include);
  const exc = parseList(req.query.exclude);
  if (inc.length) body.inclusions = { datasources: inc };
  if (exc.length) body.exclusions = { datasources: exc };
  if (req.query.timeout) body.timeoutMillis = Number(req.query.timeout);

  let closed = false;
  req.on('close', () => { closed = true; });
  try {
    const upstream = await fetch(`${auth.base}/rest/api/v1/chat?stream=true`, {
      method: 'POST',
      headers: { Authorization: `${auth.token.tokenType || 'Bearer'} ${auth.token.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!upstream.ok) {
      const t = await upstream.text();
      send({ type: 'error', message: `Glean Chat ${upstream.status}: ${t.slice(0, 200)}` });
      return res.end();
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let accum = ''; // each line is a delta, so accumulate
    const handle = (line) => {
      if (!line.trim()) return;
      let obj; try { obj = JSON.parse(line); } catch { return; }
      const { answer: delta, steps, citations } = extractChat(obj);
      if (steps.length) send({ type: 'steps', steps });
      if (delta) { accum += delta; send({ type: 'answer', text: accum }); }
      if (citations.length) {
        send({ type: 'citations', citations: citations.slice(0, 12).map((c) => ({
          title: c.sourceDocument?.title || c.sourceDocument?.name || c.text || 'Source',
          url: c.sourceDocument?.url || c.url || null,
        })) });
      }
    };
    while (!closed) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, idx)); buf = buf.slice(idx + 1); }
    }
    if (buf.trim()) handle(buf);
    if (!closed) { send({ type: 'final', text: accum }); send({ type: 'done' }); res.end(); }
  } catch (e) {
    if (!closed) { send({ type: 'error', message: e.message }); res.end(); }
  }
});

// AI Buddy run (SSE). Subscribe via EventSource (GET).
// query: q (required) / userId / dept / model
buddyRouter.get('/chat', async (req, res) => {
  const userId = req.query.userId || 'default';
  const task = (req.query.q || '').toString();
  const userDept = (req.query.dept || 'Sales').toString();
  const model = (req.query.model || '').toString() || undefined;
  const lang = (req.query.lang || 'en').toString(); // UI language: answer in this language
  const cid = (req.query.cid || '').toString(); // conversation ID (for multi-turn continuity)

  // Restore prior turns of the same conversation from the server side (saved runs) as context.
  // → Even if the connection drops on reload/sleep, you can continue the conversation with the same cid.
  let priorTurns = [];
  if (cid) {
    try {
      const past = db.listRuns()
        .filter((r) => r.cid === cid && r.userId === userId)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      for (const r of past.slice(-8)) { // up to the last 8 exchanges
        if (r.query) priorTurns.push({ role: 'user', text: r.query });
        if (r.final) priorTurns.push({ role: 'assistant', text: r.final });
      }
    } catch { /* continue even if history can't be read */ }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  if (!task.trim()) {
    send({ type: 'error', message: 'q (the question) is empty.' });
    return res.end();
  }

  let closed = false;
  // Even if the client disconnects (closing the tab / stepping away / sleep dropping the connection),
  // do not interrupt the run; let it finish server-side and save it to history. After disconnect, only stop writing to the socket.
  req.on('close', () => { closed = true; });

  const events = [];
  try {
    for await (const ev of runBuddy({ task, userId, userDept, model, priorTurns, lang })) {
      events.push(ev);
      if (!closed) send(ev); // do not interrupt; only send to a live connection
    }
  } catch (e) {
    events.push({ type: 'error', message: e.message });
    if (!closed) send({ type: 'error', message: e.message });
  } finally {
    // Save as run history (managed in the History menu)
    try {
      const final = events.find((e) => e.type === 'final')?.text || '';
      const routed = events.filter((e) => e.type === 'routing_decision').map((e) => ({ name: e.agent.name, permissionOk: e.permissionOk }));
      db.addRun({ query: task, dept: userDept, userId, cid: cid || null, model: model || null, final, routed, events, createdAt: new Date().toISOString() });
    } catch { /* ignore save failures */ }
    if (!closed) { send({ type: 'done' }); res.end(); }
  }
});

// Lightweight health before connecting (for the frontend's initial display)
buddyRouter.get('/health', (req, res) => {
  res.json({ ok: true, instanceUrlSet: !!config.glean.instanceUrl, mcpSet: !!(process.env.GLEAN_MCP_URL || config.glean.instanceUrl) });
});
