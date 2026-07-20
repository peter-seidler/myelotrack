import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  generatePkce,
  buildAuthorizeUrl,
  exchangeCode,
  refreshTokens,
} from '../src/integrations/fhir/smart.js';

const sourceConfig = {
  authorizeUrl: 'https://fhir.example.org/oauth2/authorize',
  tokenUrl: 'https://fhir.example.org/oauth2/token',
  fhirBaseUrl: 'https://fhir.example.org/api/FHIR/R4',
  clientId: 'client-123',
  redirectUri: 'https://app.myelotrack.local/callback',
  scopes: ['openid', 'patient/Observation.read'],
};

const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('generatePkce yields an S256 challenge derived from the verifier', () => {
  const { verifier, challenge } = generatePkce();
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.equal(challenge, b64url(createHash('sha256').update(verifier).digest()));
});

test('buildAuthorizeUrl includes required SMART params', () => {
  const url = new URL(
    buildAuthorizeUrl(sourceConfig, { state: 'st8', codeChallenge: 'chal' }),
  );
  const q = url.searchParams;
  assert.equal(url.origin + url.pathname, sourceConfig.authorizeUrl);
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('client_id'), 'client-123');
  assert.equal(q.get('redirect_uri'), sourceConfig.redirectUri);
  assert.equal(q.get('scope'), 'openid patient/Observation.read');
  assert.equal(q.get('state'), 'st8');
  assert.equal(q.get('code_challenge'), 'chal');
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('aud'), sourceConfig.fhirBaseUrl);
});

test('exchangeCode posts the auth-code grant and maps the response', async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, body: opts.body };
    return {
      ok: true,
      json: async () => ({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: 'patient/Observation.read',
        patient: 'Patient/42',
      }),
    };
  };
  const tokens = await exchangeCode(
    sourceConfig,
    { code: 'authcode', codeVerifier: 'ver' },
    fakeFetch,
  );
  assert.equal(captured.url, sourceConfig.tokenUrl);
  const body = new URLSearchParams(captured.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'authcode');
  assert.equal(body.get('code_verifier'), 'ver');
  assert.equal(body.get('client_id'), 'client-123');
  assert.deepEqual(tokens, {
    accessToken: 'at',
    refreshToken: 'rt',
    expiresIn: 3600,
    scope: 'patient/Observation.read',
    patient: 'Patient/42',
  });
});

test('refreshTokens posts the refresh grant', async () => {
  let body;
  const fakeFetch = async (_url, opts) => {
    body = new URLSearchParams(opts.body);
    return { ok: true, json: async () => ({ access_token: 'at2' }) };
  };
  const tokens = await refreshTokens(sourceConfig, 'the-refresh', fakeFetch);
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'the-refresh');
  assert.equal(tokens.accessToken, 'at2');
  assert.equal(tokens.refreshToken, null);
});

test('a non-2xx token response throws', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 400,
    text: async () => 'invalid_grant',
  });
  await assert.rejects(
    () => exchangeCode(sourceConfig, { code: 'x', codeVerifier: 'y' }, fakeFetch),
    /token endpoint 400/,
  );
});
