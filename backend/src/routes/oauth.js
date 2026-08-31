import express from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { parseCard } from '../lib/agentCard.js';
import { sessions } from '../lib/sessions.js';
import {
  makePkce,
  makeState,
  resolveEndpoints,
  buildAuthorizeUrl,
  exchangeCode,
} from '../lib/oauth.js';

export const oauthRouter = express.Router();

// Resolve an agent's OAuth settings.
// Currently assumes Glean, but it also looks at agent.card's securityScheme, so it can extend to other implementations.
function oauthSettingsFor(agent) {
  // Whether it's the default Glean agent is determined by matching cardUrl / instanceUrl
  const g = config.glean.oauth;
  return {
    clientId: g.clientId,
    clientSecret: g.clientSecret,
    redirectUri: g.redirectUri,
    scopes: g.scopes,
    envAuthorizeUrl: g.authorizeUrl,
    envTokenUrl: g.tokenUrl,
    instanceUrl: config.glean.instanceUrl,
  };
}

/**
 * Start authorization: generate the authorize URL and store the PKCE verifier tied to the state.
 * The frontend navigates the browser to the authorizeUrl returned here.
 */
oauthRouter.get('/authorize', async (req, res) => {
  const { agentId, userId = 'default' } = req.query;
  const agent = agentId ? db.getAgent(agentId) : null;
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  const s = oauthSettingsFor(agent);
  if (!s.clientId) {
    return res.status(400).json({
      error: 'GLEAN_OAUTH_CLIENT_ID is not set (check .env)',
    });
  }

  const cardMeta = agent.card ? parseCard(agent.card) : agent.cardMeta;
  const endpoints = await resolveEndpoints({
    envAuthorizeUrl: s.envAuthorizeUrl,
    envTokenUrl: s.envTokenUrl,
    cardMeta,
    instanceUrl: s.instanceUrl,
  });

  if (!endpoints?.authorizationUrl || !endpoints?.tokenUrl) {
    return res.status(400).json({
      error:
        'Could not resolve the authorize/token endpoints. ' +
        'Please set GLEAN_OAUTH_AUTHORIZE_URL / GLEAN_OAUTH_TOKEN_URL in .env.',
    });
  }

  const pkce = makePkce();
  const state = makeState();
  sessions.putPending(state, {
    agentId: agent.id,
    userId,
    verifier: pkce.verifier,
    tokenUrl: endpoints.tokenUrl,
    redirectUri: s.redirectUri,
    clientId: s.clientId,
    clientSecret: s.clientSecret,
    scope: s.scopes,
  });

  const authorizeUrl = buildAuthorizeUrl(endpoints.authorizationUrl, {
    clientId: s.clientId,
    redirectUri: s.redirectUri,
    scope: s.scopes,
    state,
    challenge: pkce.challenge,
  });

  res.json({ authorizeUrl, endpointSource: endpoints.source });
});

/**
 * Callback: where Glean redirects to.
 * Exchange the code for a token, store it per (agentId, userId), then return to the frontend.
 * Assumes redirect_uri is http://localhost:3000/oauth/callback (= backend directly).
 */
oauthRouter.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  const backToFrontend = (params) => {
    const u = new URL(config.frontendUrl);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    res.redirect(u.toString());
  };

  if (error) {
    return backToFrontend({ oauth: 'error', message: error_description || error });
  }
  if (!code || !state) {
    return backToFrontend({ oauth: 'error', message: 'code/state is missing' });
  }

  const pending = sessions.takePending(state);
  if (!pending) {
    return backToFrontend({ oauth: 'error', message: 'state is invalid or expired' });
  }

  try {
    const token = await exchangeCode(pending.tokenUrl, {
      code,
      redirectUri: pending.redirectUri,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      verifier: pending.verifier,
    });
    sessions.setToken(pending.agentId, pending.userId, token);
    return backToFrontend({
      oauth: 'success',
      agentId: pending.agentId,
      userId: pending.userId,
    });
  } catch (e) {
    return backToFrontend({ oauth: 'error', message: e.message });
  }
});

// Check connection status (does not return the token itself)
oauthRouter.get('/status', (req, res) => {
  const { agentId, userId = 'default' } = req.query;
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });
  const tok = sessions.getToken(agentId, userId);
  res.json({
    connected: !!tok,
    expired: tok?.expiresAt ? Date.now() > tok.expiresAt : false,
    scope: tok?.scope || null,
    connectedUsers: sessions.connectedUsers(agentId),
  });
});

// Disconnect (discard the token)
oauthRouter.post('/disconnect', (req, res) => {
  const { agentId, userId = 'default' } = req.body || {};
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });
  sessions.deleteToken(agentId, userId);
  res.json({ ok: true });
});
