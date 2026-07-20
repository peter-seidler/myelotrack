import { asyncHandler, badRequest } from '../lib/async-handler.js';
import { config, isSourceConfigured } from '../config/index.js';
import { parseKey, encryptSecret, decryptSecret } from '../lib/crypto.js';
import {
  generatePkce,
  buildAuthorizeUrl,
  exchangeCode,
} from '../integrations/fhir/smart.js';
import { syncForConnection } from '../integrations/fhir/sync.js';

const repo = (req) => req.app.locals.repo;
const KNOWN_SOURCES = ['msk', 'capital-health', 'apple-health'];
const FHIR_SOURCES = ['msk', 'capital-health'];

/** GET /api/v1/integrations/status — connection health per source. */
export const status = asyncHandler(async (req, res) => {
  res.json({ data: await repo(req).integrationsStatus() });
});

/**
 * GET /api/v1/integrations/:source/connect — begin the SMART auth flow.
 * Generates PKCE + state, stashes them on the connection, and returns the
 * authorize URL for the client to open.
 */
export const connect = asyncHandler(async (req, res) => {
  const { source } = req.params;
  if (!FHIR_SOURCES.includes(source)) throw badRequest(`unknown FHIR source: ${source}`);
  if (!isSourceConfigured(source)) {
    throw badRequest(`source "${source}" is not configured (missing SMART env vars)`);
  }
  const sourceConfig = config.fhirSources[source];
  const { verifier, challenge } = generatePkce();
  const state = generatePkce().verifier; // reuse the CSPRNG for an opaque state

  await repo(req).updateConnection(source, {
    system: 'epic-fhir-r4',
    fhirBaseUrl: sourceConfig.fhirBaseUrl,
    status: 'disconnected',
    pendingAuth: { state, codeVerifier: verifier },
  });

  const authorizeUrl = buildAuthorizeUrl(sourceConfig, {
    state,
    codeChallenge: challenge,
  });
  res.json({ data: { authorizeUrl } });
});

/**
 * GET /api/v1/integrations/:source/callback?code=&state= — finish the flow.
 * Validates state, exchanges the code, and stores encrypted tokens.
 */
export const callback = asyncHandler(async (req, res) => {
  const { source } = req.params;
  const { code, state } = req.query;
  if (!FHIR_SOURCES.includes(source)) throw badRequest(`unknown FHIR source: ${source}`);
  if (!code || !state) throw badRequest('missing code/state');
  if (!config.fieldEncryptionKey) throw badRequest('FIELD_ENCRYPTION_KEY is not set');

  const conn = await repo(req).getConnection(source);
  if (!conn?.pendingAuth || conn.pendingAuth.state !== state) {
    throw badRequest('invalid or expired auth state');
  }

  const sourceConfig = config.fhirSources[source];
  const tokens = await exchangeCode(sourceConfig, {
    code,
    codeVerifier: conn.pendingAuth.codeVerifier,
  });

  const key = parseKey(config.fieldEncryptionKey);
  await repo(req).updateConnection(source, {
    status: 'connected',
    patient: tokens.patient,
    scopes: tokens.scope ? tokens.scope.split(' ') : sourceConfig.scopes,
    tokens: {
      accessTokenEnc: encryptSecret(tokens.accessToken, key),
      refreshTokenEnc: tokens.refreshToken
        ? encryptSecret(tokens.refreshToken, key)
        : null,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
    },
    pendingAuth: null,
  });
  res.json({ data: { source, status: 'connected' } });
});

/**
 * POST /api/v1/integrations/:source/sync — pull the latest data.
 * If the source is connected with stored tokens, runs a real FHIR sync (labs +
 * medications); otherwise just refreshes the connection timestamp (prototype).
 */
export const sync = asyncHandler(async (req, res) => {
  const { source } = req.params;
  if (!KNOWN_SOURCES.includes(source)) throw badRequest(`unknown source: ${source}`);

  const conn = await repo(req).getConnection(source);
  const accessTokenEnc = conn?.tokens?.accessTokenEnc;

  if (conn?.status === 'connected' && accessTokenEnc && config.fieldEncryptionKey) {
    const key = parseKey(config.fieldEncryptionKey);
    const result = await syncForConnection({
      repo: repo(req),
      source,
      fhirBaseUrl: conn.fhirBaseUrl || config.fhirSources[source]?.fhirBaseUrl,
      patientId: conn.patient,
      accessToken: decryptSecret(accessTokenEnc, key),
    });
    return res.json({ data: result });
  }

  const touched = await repo(req).touchIntegrationSync(source);
  if (!touched) throw badRequest(`no connection configured for: ${source}`);
  res.json({ data: touched });
});
