// A thin wrapper that live-fetches Glean MCP's personal memory (Personal Graph).
// The fuel for AI Buddy's "personalization = proactive suggestions".
//   1) Dynamically resolve the memory tool name from tools/list (exposure varies per tenant)
//   2) Read via tools/call action=read (the Glean memory tool requires _user_goal as an argument)
//   3) Format the returned text into "active projects / open threads / recent topics / preferences"
// If it can't be fetched, throw an error and surface the reason in the UI (live-fetch policy = no synthetic fallback).
import { mcpListTools, mcpCallTool } from './mcpClient.js';

const MEMORY_GOAL = "Fetch the user's work context for AI Buddy's personalization (proactive suggestions)";

/** Resolve the memory tool name from tools/list (excludes memory_schema etc., prefers plain memory) */
export async function resolveMemoryToolName(userId = 'default') {
  const tools = await mcpListTools(userId);
  const names = tools.map((t) => t.name);
  // Prefer an exact 'memory' match first, then *memory* (avoid schema/log variants)
  if (names.includes('memory')) return 'memory';
  const cand = names.find(
    (n) => /memory/i.test(n) && !/schema/i.test(n)
  );
  return cand || null;
}

/** Run the memory tool with read and return the raw text. Tries multiple arg shapes to tolerate tenant differences. */
export async function readMemoryRaw(userId = 'default', { limit = 12 } = {}) {
  const tool = await resolveMemoryToolName(userId);
  if (!tool) {
    const err = new Error(
      'This Glean MCP server does not expose a memory tool (enable memory in the admin console)'
    );
    err.code = 'NO_MEMORY_TOOL';
    throw err;
  }
  // The Glean memory tool requires _user_goal. action=read reads all categories.
  const argVariants = [
    { action: 'read', _user_goal: MEMORY_GOAL, limit },
    { action: 'read', _user_goal: MEMORY_GOAL },
    { _user_goal: MEMORY_GOAL, limit },
  ];
  let lastErr;
  for (const args of argVariants) {
    try {
      const text = await mcpCallTool(tool, args, userId);
      if (text && text.trim()) return { tool, text };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Failed to read memory');
}

// ── Parse: extract structures for display/suggestions from the memory text ────────────
const stripMd = (s) =>
  String(s || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();

/** Split a single bullet item into a "heading label" and "body" (handles the **label**: body format) */
function splitLabel(item) {
  const clean = stripMd(item);
  const m = clean.match(/^([^:：]{2,60})[:：]\s*(.*)$/);
  if (m) return { label: m[1].trim(), detail: m[2].trim() };
  return { label: clean.slice(0, 48), detail: clean };
}

// In the memory content, newlines are escaped as literal \n, so restore them to real newlines.
export function unescapeMemory(text) {
  return String(text)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/\\"/g, '"');
}

/** Pick up the list of returned categories from the leading "categories[N]: a,b,c" */
export function parseCategories(rawText) {
  const m = String(rawText).match(/categories\[\d+\]:\s*(.+)/);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function parseMemory(rawText) {
  const text = unescapeMemory(rawText);
  const lines = text.split('\n');
  const projects = [];
  const threads = [];
  const collaborators = [];
  const topics = [];
  const preferences = [];
  const summaries = []; // session summaries (fallback material for tenants without Active Projects)
  let section = null;
  let lastSlug = null;

  for (const line of lines) {
    if (/Active Projects|Focus Areas/i.test(line)) { section = 'projects'; continue; }
    if (/Open Threads/i.test(line)) { section = 'threads'; continue; }
    if (/Top Collaborators/i.test(line)) { section = 'collab'; continue; }
    if (/Observations|## Metadata|Preference signals|### Knowledge/i.test(line)) { section = null; }

    // slug (DailySessionLog) -> recent topic
    const slug = line.match(/\*\*slug:\*\*\s*(.+)/i) || line.match(/(?:^|\s)slug:\s*([a-z0-9_-]+)/i);
    if (slug) { lastSlug = slug[1].trim(); topics.push(lastSlug.replace(/[-_]/g, ' ')); }

    // session_summary -> material for fallback suggestions (use the most recent slug as the label)
    const sum = line.match(/session_summary:\*{0,2}\s*(.+)/i);
    if (sum) {
      const detail = stripMd(sum[1]).slice(0, 200);
      if (detail.length > 12) summaries.push({ label: (lastSlug || 'session').replace(/[-_]/g, ' '), detail });
    }

    // [user] utterances in preference signals
    const user = line.match(/\[user\]\s*[「"](.+?)[」"]/);
    if (user) preferences.push(user[1].trim());

    const bullet = line.match(/^\s*[-*]\s+(.*\S)/);
    if (bullet && section) {
      const parsed = splitLabel(bullet[1]);
      if (!parsed.label) continue;
      if (section === 'projects') projects.push(parsed);
      else if (section === 'threads') threads.push(parsed);
      else if (section === 'collab') collaborators.push(parsed.label);
    }
  }

  const dedupe = (arr) => [...new Set(arr)].filter(Boolean);
  return {
    projects: dedupeBy(projects, 'label').slice(0, 6),
    threads: dedupeBy(threads, 'label').slice(0, 6),
    collaborators: dedupe(collaborators).slice(0, 6),
    topics: dedupe(topics).slice(0, 10),
    preferences: dedupe(preferences).slice(0, 6),
    summaries: dedupeBy(summaries, 'label').slice(0, 6),
  };
}

function dedupeBy(arr, key) {
  const seen = new Set();
  const out = [];
  for (const o of arr) {
    const k = (o[key] || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

/** Build the personal context string to inject into the LLM system prompt */
export function toContextBlock(profile) {
  const p = profile;
  const lines = [];
  if (p.projects?.length)
    lines.push('In-progress projects:\n' + p.projects.map((x) => `  - ${x.label}: ${x.detail}`.slice(0, 200)).join('\n'));
  if (p.threads?.length)
    lines.push('Open threads:\n' + p.threads.map((x) => `  - ${x.label}: ${x.detail}`.slice(0, 200)).join('\n'));
  if (p.collaborators?.length) lines.push('Key collaborators: ' + p.collaborators.join(', '));
  if (p.topics?.length) lines.push('Recent topics: ' + p.topics.slice(0, 8).join(' / '));
  if (!p.projects?.length && !p.threads?.length && p.summaries?.length)
    lines.push('Recent sessions:\n' + p.summaries.map((x) => `  - ${x.label}: ${x.detail}`.slice(0, 220)).join('\n'));
  if (p.preferences?.length)
    lines.push('Work-style preferences:\n' + p.preferences.map((x) => `  - ${x}`).join('\n'));
  return lines.join('\n\n');
}

/** Return the profile (greeting + proactive suggestions + LLM injection) together */
export async function getProfile(userId = 'default', { limit = 12 } = {}) {
  const { tool, text } = await readMemoryRaw(userId, { limit });
  const parsed = parseMemory(text);
  const suggestions = buildSuggestions(parsed);
  return {
    tool,
    categories: parseCategories(text),
    ...parsed,
    suggestions,
    contextBlock: toContextBlock(parsed),
    sample: unescapeMemory(text).slice(0, 8000), // raw sample for the Memory tab display
    rawLength: text.length,
  };
}

/** Generate "proactive suggestions" from memory (priority: open threads -> projects -> session summaries) */
export function buildSuggestions(parsed) {
  const src =
    (parsed.threads?.length && parsed.threads) ||
    (parsed.projects?.length && parsed.projects) ||
    parsed.summaries ||
    [];
  return src.slice(0, 3).map((x) => {
    // label and detail often overlap, so use whichever carries more information as the one-line title (no detail)
    const text = (x.detail && x.detail.length >= (x.label || '').length) ? x.detail : (x.label || x.detail || '');
    return {
      title: text,
      prompt: `Summarize the latest status and next steps for "${text}". If needed, also check with the appropriate department's agent.`,
    };
  });
}
