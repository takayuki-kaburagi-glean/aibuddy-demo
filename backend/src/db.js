import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// Simple JSON file persistence (in place of SQLite; avoids native dependencies)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'registry.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ agents: [], composites: [], runs: [] }, null, 2));
  }
}

function read() {
  ensure();
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(data.composites)) data.composites = []; // backward compatibility
    if (!Array.isArray(data.runs)) data.runs = [];
    return data;
  } catch {
    return { agents: [], composites: [], runs: [] };
  }
}

function write(data) {
  ensure();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

export const db = {
  listAgents() {
    return read().agents;
  },

  getAgent(id) {
    return read().agents.find((a) => a.id === id) || null;
  },

  /** Detect duplicate base/card URLs (prevents registering the same agent twice) */
  findByUrl(url) {
    const norm = (u) => String(u || '').replace(/\/$/, '').toLowerCase();
    const target = norm(url);
    return (
      read().agents.find(
        (a) => norm(a.cardUrl) === target || norm(a.baseUrl) === target
      ) || null
    );
  },

  addAgent(agent) {
    const data = read();
    const record = {
      id: agent.id || crypto.randomUUID(),
      baseUrl: agent.baseUrl || null,
      cardUrl: agent.cardUrl || null,
      auth: agent.auth || 'none', // none | bearer | oauth2_authcode
      bearerToken: agent.bearerToken || null, // used when auth=bearer
      label: agent.label || null,
      logo: agent.logo || null, // uploaded logo (data URI)
      card: agent.card || null, // fetched raw Agent Card JSON
      cardMeta: agent.cardMeta || null, // summary of the parsed result
      meta: agent.meta || null, // registry extension meta (department/platform/permission/rating/executionRating)
      department: agent.department || null, // owning department (Legal/HR/Research/Sales/IT)
      fake: agent.fake || false, // demo card for UI display only (not executable)
      mcp: agent.mcp || false, // Glean MCP Gateway (tool source) card
      skill: agent.skill || false, // Glean skill/agent (metadata only, no A2A support)
      catalogKind: agent.catalogKind || null, // 'agent' | 'skill' (kind of metadata registration)
      lastFetchedAt: agent.lastFetchedAt || null,
      lastError: agent.lastError || null,
      createdAt: new Date().toISOString(),
    };
    data.agents.push(record);
    write(data);
    return record;
  },

  updateAgent(id, patch) {
    const data = read();
    const idx = data.agents.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    data.agents[idx] = { ...data.agents[idx], ...patch, id };
    write(data);
    return data.agents[idx];
  },

  deleteAgent(id) {
    const data = read();
    const before = data.agents.length;
    data.agents = data.agents.filter((a) => a.id !== id);
    write(data);
    return data.agents.length < before;
  },

  /** Reorder agents by the given id order (unspecified ones go to the end, relative order preserved) */
  reorderAgents(ids) {
    const data = read();
    const pos = new Map(ids.map((id, i) => [id, i]));
    data.agents = data.agents
      .map((a, i) => ({ a, r: pos.has(a.id) ? pos.get(a.id) : ids.length + i }))
      .sort((x, y) => x.r - y.r)
      .map((o) => o.a);
    write(data);
    return data.agents;
  },

  // ── Composite agents (orchestration definitions) ─────────────
  listComposites() {
    return read().composites;
  },

  getComposite(id) {
    return read().composites.find((c) => c.id === id) || null;
  },

  addComposite(c) {
    const data = read();
    const record = {
      id: c.id || crypto.randomUUID(),
      name: c.name || 'Composite Agent',
      goal: c.goal || '', // natural-language task description (runtime goal)
      subAgentIds: Array.isArray(c.subAgentIds) ? c.subAgentIds : [],
      mcpTools: Array.isArray(c.mcpTools) ? c.mcpTools : [], // individually selected MCP tool names (via Glean MCP Gateway)
      model: c.model || null, // orchestrator model (falls back to Gateway default if unspecified)
      createdAt: new Date().toISOString(),
    };
    data.composites.push(record);
    write(data);
    return record;
  },

  updateComposite(id, patch) {
    const data = read();
    const idx = data.composites.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    data.composites[idx] = { ...data.composites[idx], ...patch, id };
    write(data);
    return data.composites[idx];
  },

  deleteComposite(id) {
    const data = read();
    const before = data.composites.length;
    data.composites = data.composites.filter((c) => c.id !== id);
    write(data);
    return data.composites.length < before;
  },

  // ── Run history (run) ─────────────────────────────────────────
  listRuns() {
    // Return a lightweight summary for the list (excludes events)
    return read().runs.map(({ events, ...r }) => ({ ...r, steps: (events || []).filter((e) => e.type === 'tool_call').length }));
  },

  getRun(id) {
    return read().runs.find((r) => r.id === id) || null;
  },

  addRun(run) {
    const data = read();
    const rec = { id: run.id || crypto.randomUUID(), ...run };
    data.runs.unshift(rec); // newest first
    if (data.runs.length > 200) data.runs = data.runs.slice(0, 200); // cap
    write(data);
    return rec;
  },

  deleteRun(id) {
    const data = read();
    const before = data.runs.length;
    data.runs = data.runs.filter((r) => r.id !== id);
    write(data);
    return data.runs.length < before;
  },

  clearRuns() {
    const data = read();
    data.runs = [];
    write(data);
  },

  // ── App settings (e.g. demo email recipient) ─────────────────────────
  getSettings() {
    const data = read();
    return data.settings && typeof data.settings === 'object' ? data.settings : {};
  },
  setSettings(patch) {
    const data = read();
    data.settings = { ...(data.settings || {}), ...(patch || {}) };
    write(data);
    return data.settings;
  },

  // Verified models added at runtime (separate allow-list from .env)
  listVerifiedModels() {
    return read().verifiedModels || [];
  },
  addVerifiedModel(id) {
    const data = read();
    if (!Array.isArray(data.verifiedModels)) data.verifiedModels = [];
    if (!data.verifiedModels.includes(id)) data.verifiedModels.push(id);
    write(data);
    return data.verifiedModels;
  },
  removeVerifiedModel(id) {
    const data = read();
    data.verifiedModels = (data.verifiedModels || []).filter((m) => m !== id);
    write(data);
    return data.verifiedModels;
  },
};
