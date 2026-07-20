import { createHash, randomBytes } from 'node:crypto';

/**
 * SMART on FHIR (Epic R4) authorization helpers — the standalone-launch
 * authorization-code flow with PKCE. Pure/injectable: token calls take a
 * `fetchImpl` so they're unit-tested without network.
 *
 * A `sourceConfig` looks like:
 *   { authorizeUrl, tokenUrl, clientId, redirectUri, scopes: [...] }
 */

const base64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Generate a PKCE verifier + S256 challenge. */
export function generatePkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/** Build the authorization URL the user is redirected to. */
export function buildAuthorizeUrl(sourceConfig, { state, codeChallenge, aud }) {
  const url = new URL(sourceConfig.authorizeUrl);
  const params = {
    response_type: 'code',
    client_id: sourceConfig.clientId,
    redirect_uri: sourceConfig.redirectUri,
    scope: (sourceConfig.scopes || []).join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // Epic requires `aud` = the FHIR base URL being requested.
    aud: aud || sourceConfig.fhirBaseUrl || '',
  };
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(
  sourceConfig,
  { code, codeVerifier },
  fetchImpl = fetch,
) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: sourceConfig.redirectUri,
    client_id: sourceConfig.clientId,
    code_verifier: codeVerifier,
  });
  return postToken(sourceConfig.tokenUrl, body, fetchImpl);
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshTokens(sourceConfig, refreshToken, fetchImpl = fetch) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: sourceConfig.clientId,
  });
  return postToken(sourceConfig.tokenUrl, body, fetchImpl);
}

async function postToken(tokenUrl, body, fetchImpl) {
  const res = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`token endpoint ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresIn: json.expires_in ?? null,
    scope: json.scope || '',
    patient: json.patient || null,
  };
}
