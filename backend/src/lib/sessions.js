// Holds tokens per user. Never exposed to the browser.
// Structured so tokens can be switched per (agentId, userId).
//
// To improve local demo DX, tokens are persisted to backend/data/tokens.json
// (keeps the connection across backend restarts = node --watch reloads or ./dev.sh restarts).
// Note: for local development only. It stores OAuth tokens in plaintext on disk, so do not use in production.
// This file is excluded from commits by .gitignore (backend/data/*.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/tokens.json');

/** key: `${agentId}::${userId}` -> token record */
const tokenStore = new Map();

/** In-progress OAuth authorizations (state -> pending) */
const pendingAuth = new Map();

const key = (agentId, userId) => `${agentId}::${userId}`;

// Restore from disk on startup
try {
  const raw = fs.readFileSync(TOKENS_FILE, 'utf8');
  for (const [k, v] of Object.entries(JSON.parse(raw))) tokenStore.set(k, v);
} catch {
  /* ignore if not yet created */
}

function persistTokens() {
  try {
    fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(Object.fromEntries(tokenStore)), 'utf8');
  } catch {
    /* a persistence failure is not fatal (still works in memory) */
  }
}

export const sessions = {
  // ── Tokens ────────────────────────────────────────────────
  setToken(agentId, userId, token) {
    const rec = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      // Glean requires the Authorization header type to be capitalized "Bearer" (lowercase "bearer" returns 401).
      // The refresh response sometimes returns token_type="bearer", so normalize it.
      tokenType: token.token_type ? token.token_type[0].toUpperCase() + token.token_type.slice(1).toLowerCase() : 'Bearer',
      scope: token.scope || null,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
      obtainedAt: Date.now(),
    };
    tokenStore.set(key(agentId, userId), rec);
    persistTokens();
    return rec;
  },

  getToken(agentId, userId) {
    return tokenStore.get(key(agentId, userId)) || null;
  },

  hasToken(agentId, userId) {
    return tokenStore.has(key(agentId, userId));
  },

  deleteToken(agentId, userId) {
    const ok = tokenStore.delete(key(agentId, userId));
    persistTokens();
    return ok;
  },

  /** List of connected users tied to an agent (does not return the token itself) */
  connectedUsers(agentId) {
    const users = [];
    for (const [k, rec] of tokenStore.entries()) {
      const [aid, uid] = k.split('::');
      if (aid === agentId) {
        users.push({
          userId: uid,
          scope: rec.scope,
          expiresAt: rec.expiresAt,
          expired: rec.expiresAt ? Date.now() > rec.expiresAt : false,
        });
      }
    }
    return users;
  },

  // ── In-progress authorizations (PKCE verifier, etc.) ─────────────────────────
  putPending(state, data) {
    pendingAuth.set(state, { ...data, createdAt: Date.now() });
    // Clean up pending entries older than 10 minutes
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [s, d] of pendingAuth.entries()) {
      if (d.createdAt < cutoff) pendingAuth.delete(s);
    }
  },

  takePending(state) {
    const d = pendingAuth.get(state);
    if (d) pendingAuth.delete(state);
    return d || null;
  },
};
