import crypto from 'node:crypto';

// Utilities for Authorization Code + PKCE.

export function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function makePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge, method: 'S256' };
}

export function makeState() {
  return base64url(crypto.randomBytes(16));
}

/**
 * Resolve the authorize/token endpoints from the OAuth authorization server
 * metadata (/.well-known/oauth-authorization-server).
 */
export async function discoverAuthServer(instanceUrl) {
  if (!instanceUrl) return null;
  const bases = [
    `${instanceUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`,
    `${instanceUrl.replace(/\/$/, '')}/.well-known/openid-configuration`,
  ];
  for (const url of bases) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const meta = await res.json();
      if (meta.authorization_endpoint && meta.token_endpoint) {
        return {
          authorizationUrl: meta.authorization_endpoint,
          tokenUrl: meta.token_endpoint,
          source: url,
        };
      }
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/**
 * Resolve the authorize/token endpoints. Priority:
 * 1) Explicit values in .env
 * 2) The Agent Card's securityScheme (oauth2 authorizationCode)
 * 3) OAuth AS metadata discovery
 */
export async function resolveEndpoints({ envAuthorizeUrl, envTokenUrl, cardMeta, instanceUrl }) {
  if (envAuthorizeUrl && envTokenUrl) {
    return { authorizationUrl: envAuthorizeUrl, tokenUrl: envTokenUrl, source: '.env' };
  }

  const oauthScheme = cardMeta?.authSchemes?.find((s) => s.kind === 'oauth2' && s.oauth);
  if (oauthScheme?.oauth?.authorizationUrl && oauthScheme?.oauth?.tokenUrl) {
    return {
      authorizationUrl: oauthScheme.oauth.authorizationUrl,
      tokenUrl: oauthScheme.oauth.tokenUrl,
      source: 'agent-card',
    };
  }

  const discovered = await discoverAuthServer(instanceUrl);
  if (discovered) return discovered;

  // Return whatever is partially filled (the caller will surface the error)
  if (envAuthorizeUrl || envTokenUrl) {
    return { authorizationUrl: envAuthorizeUrl, tokenUrl: envTokenUrl, source: '.env(partial)' };
  }
  return null;
}

/** Build the authorize URL */
export function buildAuthorizeUrl(endpoint, { clientId, redirectUri, scope, state, challenge }) {
  const u = new URL(endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', scope);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

/** Exchange the authorization code for a token */
export async function exchangeCode(tokenUrl, { code, redirectUri, clientId, clientSecret, verifier }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  // If a client_secret is present, also allow Basic auth (confidential client)
  if (clientSecret) {
    // Most implementations accept either body / Basic, but put it in the body first
    body.set('client_secret', clientSecret);
  }
  const res = await fetch(tokenUrl, { method: 'POST', headers, body });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`The token endpoint did not return JSON (status ${res.status})`);
  }
  if (!res.ok || json.error) {
    const msg = json.error_description || json.error || `status ${res.status}`;
    const err = new Error(`Token exchange failed: ${msg}`);
    err.oauthError = json;
    throw err;
  }
  return json; // { access_token, refresh_token, expires_in, scope, token_type }
}

/** Refresh the access token using the refresh_token */
export async function refreshToken(tokenUrl, { refreshToken, clientId, clientSecret, scope }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  if (scope) body.set('scope', scope);
  if (clientSecret) body.set('client_secret', clientSecret);
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Token refresh failed: ${json.error_description || json.error || res.status}`);
  }
  return json;
}
