import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { db } from './db.js';
import { agentsRouter } from './routes/agents.js';
import { oauthRouter } from './routes/oauth.js';
import { llmGatewayRouter } from './routes/llmGateway.js';
import { buddyRouter } from './routes/buddy.js';
import { mcpRouter } from './routes/mcp.js';
import { settingsRouter } from './routes/settings.js';
import { DOMAIN_AGENTS, cardFor } from '../../examples/agents/domainSpecs.mjs';

const app = express();

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser(config.sessionSecret));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    glean: {
      instanceUrlSet: !!config.glean.instanceUrl,
      mcpUrlSet: !!(process.env.GLEAN_MCP_URL || config.glean.instanceUrl),
      clientIdSet: !!config.glean.oauth.clientId,
      redirectUri: config.glean.oauth.redirectUri,
      scopes: config.glean.oauth.scopes,
      model: config.glean.model,
    },
  });
});

app.use('/api/agents', agentsRouter);
app.use('/api/llm-gateway', llmGatewayRouter);
app.use('/api/buddy', buddyRouter);
app.use('/api/mcp', mcpRouter);
app.use('/api/settings', settingsRouter);
// OAuth uses redirect_uri /oauth/callback (backend directly), so also mount at the root
app.use('/oauth', oauthRouter);
app.use('/api/oauth', oauthRouter);

// ── Seed the Glean Assistant (OAuth connection target) ──────────────────────────
// The agent ID is fixed ('glean-assistant'). Since tokens are stored by (agentId::userId),
// a random UUID would drop the connection every time the registry resets. A fixed ID keeps it stable permanently.
const GLEAN_AGENT_ID = 'glean-assistant';
function seedGleanAgent() {
  const cardUrl = config.glean.agentCardUrl;
  const base = config.glean.instanceUrl;
  const url = cardUrl || base;
  if (!url) {
    console.log('[seed] GLEAN_INSTANCE_URL is not set; skipping registration of the Glean connection target');
    return;
  }
  const existing = db.findByUrl(url);
  if (existing && existing.id === GLEAN_AGENT_ID) {
    console.log('[seed] Glean Assistant already registered (fixed ID)');
    return;
  }
  if (existing) db.deleteAgent(existing.id); // recreate if an old random ID remains
  db.addAgent({ id: GLEAN_AGENT_ID, baseUrl: base || null, cardUrl: cardUrl || null, auth: 'oauth2_authcode', label: 'Glean Assistant' });
  console.log(`[seed] Registered Glean Assistant (fixed ID: ${GLEAN_AGENT_ID})`);
}

// ── Seed per-department domain agents (reset on every startup to reflect the latest specs) ──
function seedDomainAgents() {
  // Delete only the existing "mock" domain agents. Keep real Glean agents added by
  // the user (meta.real) so they don't disappear on restart.
  for (const a of db.listAgents()) {
    if (a.meta && a.meta.department && !a.meta.real) db.deleteAgent(a.id);
  }
  for (const spec of DOMAIN_AGENTS) {
    db.addAgent({
      baseUrl: `http://localhost:${spec.port}/a2a`,
      auth: 'none',
      label: spec.name,
      card: cardFor(spec),
      department: spec.department,
      meta: {
        department: spec.department,
        platform: spec.platform,
        permission: spec.permission,
        rating: spec.rating,
        executionRating: spec.executionRating,
        description: spec.description,
      },
    });
  }
  console.log(`[seed] Registered ${DOMAIN_AGENTS.length} domain agents`);
}

app.listen(config.port, () => {
  console.log(`\n▶ AI Buddy backend: http://localhost:${config.port}`);
  console.log(`  frontend (CORS allowed origin): ${config.frontendUrl}`);
  console.log(`  OAuth redirect_uri:    ${config.glean.oauth.redirectUri}`);
  console.log(`  Glean MCP:             ${process.env.GLEAN_MCP_URL || `${config.glean.instanceUrl}/mcp/default`}`);
  seedGleanAgent();
  seedDomainAgents();
  console.log('  Note: mock agents start with `npm run dev` (agents bundled) or `npm run agents`.\n');
});
