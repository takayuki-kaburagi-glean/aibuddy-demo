import express from 'express';
import { db } from '../db.js';
import { parseCard } from '../lib/agentCard.js';
import { searchGleanAgents, getGleanAgent } from '../lib/gleanAgents.js';

export const agentsRouter = express.Router();

// Search the tenant's real Glean agents (for the add menu)
agentsRouter.get('/glean/search', async (req, res) => {
  const userId = req.query.userId || 'default';
  try {
    const agents = await searchGleanAgents(userId, req.query.q || '', { limit: 25 });
    // Mark already-registered gleanAgentIds so they can be excluded
    const added = new Set(db.listAgents().map((a) => a.meta?.gleanAgentId).filter(Boolean));
    res.json({ agents: agents.map((a) => ({ ...a, added: added.has(a.agentId) })) });
  } catch (e) {
    res.status(e.message.includes('not connected') ? 401 : 502).json({ error: e.message });
  }
});

// Add the selected real Glean agent to the registry (execution via runs/wait)
agentsRouter.post('/glean/add', express.json(), async (req, res) => {
  const userId = req.query.userId || req.body?.userId || 'default';
  const { agentId, name } = req.body || {};
  if (!agentId || !name) return res.status(400).json({ error: 'agentId and name are required' });
  if (db.listAgents().some((a) => a.meta?.gleanAgentId === agentId)) {
    return res.status(409).json({ error: 'This agent has already been added' });
  }
  let description = req.body?.description || '';
  try { const d = await getGleanAgent(userId, agentId); if (d?.description) description = d.description; } catch { /* noop */ }
  const rec = db.addAgent({
    baseUrl: null,
    auth: 'oauth2_authcode',
    label: name,
    department: 'Glean',
    meta: {
      department: 'Glean',
      platform: 'Glean',
      permission: ['Company-wide'],
      rating: 5.0,
      executionRating: 1.0,
      description: description || 'A real agent on Glean (executed via runs/wait).',
      gleanAgentId: agentId, // when present, buddy executes via runs/wait
      real: true,
    },
  });
  res.json({ ok: true, id: rec.id });
});

// Delete an agent from the registry
agentsRouter.delete('/:id', (req, res) => {
  res.json({ ok: db.deleteAgent(req.params.id) });
});

// Registry list (for the Registry view). Also returns domain agents' extension meta.
agentsRouter.get('/', (req, res) => {
  const agents = db.listAgents().map((a) => {
    const meta = a.card ? parseCard(a.card) : a.cardMeta;
    return {
      id: a.id,
      label: a.label,
      name: meta?.name || a.label,
      description: meta?.description || a.meta?.description || '',
      skills: meta?.skills || [],
      provider: meta?.provider || null,
      url: meta?.url || a.baseUrl,
      auth: a.auth,
      fake: a.fake,
      mcp: a.mcp,
      // Registry notes (description / permission / metadata / rating / execution rating)
      meta: a.meta || null,
    };
  });
  res.json({ agents });
});

agentsRouter.get('/:id', (req, res) => {
  const a = db.getAgent(req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  res.json(a);
});
