import express from 'express';
import { getGleanAuth } from './llmGateway.js';
import { mcpListTools, mcpCallTool, mcpUrl } from '../lib/mcpClient.js';

export const mcpRouter = express.Router();

// List of MCP tools for the connected Glean environment
mcpRouter.get('/tools', async (req, res) => {
  const userId = req.query.userId || 'default';
  if (!getGleanAuth(userId)) return res.status(401).json({ error: 'Glean is not connected. Please Connect (OAuth).' });
  try {
    const tools = await mcpListTools(userId);
    res.json({ url: mcpUrl(), tools });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Execute a tool (for test runs from the Tools tab)
mcpRouter.post('/call', express.json({ limit: '1mb' }), async (req, res) => {
  const userId = req.query.userId || req.body?.userId || 'default';
  const { name, args } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!getGleanAuth(userId)) return res.status(401).json({ error: 'Glean is not connected.' });
  try {
    const result = await mcpCallTool(name, args || {}, userId);
    res.json({ result });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
