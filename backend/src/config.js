import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// .env is expected to live at the repository root (one level above backend)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (v, def = false) =>
  v == null ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

export const config = {
  port: Number(process.env.PORT || 3000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret',

  // Default Glean connection (also used to auto-seed the Registry)
  glean: {
    instanceUrl: (process.env.GLEAN_INSTANCE_URL || '').replace(/\/$/, ''),
    agentCardUrl: process.env.GLEAN_AGENT_CARD_URL || '',
    // Model used by the orchestrator (5504) via the Glean LLM Gateway.
    // model = default selection, models = dropdown candidates (comma-separated).
    model: process.env.GLEAN_MODEL || 'claude-3-5-sonnet-v2@20241022',
    models: (process.env.GLEAN_MODELS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    oauth: {
      clientId: process.env.GLEAN_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.GLEAN_OAUTH_CLIENT_SECRET || '',
      redirectUri:
        process.env.GLEAN_OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
      scopes: process.env.GLEAN_OAUTH_SCOPES || 'openid offline_access CHAT AGENTS',
      // Explicit override when auto-resolution fails (optional)
      authorizeUrl: process.env.GLEAN_OAUTH_AUTHORIZE_URL || '',
      tokenUrl: process.env.GLEAN_OAUTH_TOKEN_URL || '',
    },
  },

  // Translation feature for localizing a card's "capabilities" text (optional)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
  },

  debug: bool(process.env.DEBUG, false),
};

/** Mask to make sure secrets are never written to logs */
export function redact(value) {
  if (value == null) return value;
  const s = String(value);
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-2)}`;
}
