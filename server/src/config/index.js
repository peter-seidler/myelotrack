/** Runtime configuration, resolved from the environment with safe defaults. */

/**
 * Per-source SMART on FHIR settings, read from env. Both MSK and Capital Health
 * run Epic, so this is the same shape pointed at different base URLs / clients.
 * Empty when unconfigured — the connect flow reports "not configured" rather
 * than throwing.
 */
function fhirSource(prefix) {
  return {
    fhirBaseUrl: process.env[`${prefix}_FHIR_BASE_URL`] || '',
    authorizeUrl: process.env[`${prefix}_AUTHORIZE_URL`] || '',
    tokenUrl: process.env[`${prefix}_TOKEN_URL`] || '',
    clientId: process.env[`${prefix}_CLIENT_ID`] || '',
    redirectUri: process.env[`${prefix}_REDIRECT_URI`] || '',
    scopes: (
      process.env[`${prefix}_SCOPES`] ||
      'openid fhirUser patient/Observation.read patient/MedicationRequest.read'
    )
      .split(/\s+/)
      .filter(Boolean),
  };
}

export const config = {
  port: Number(process.env.PORT) || 8787,
  dataBackend: process.env.DATA_BACKEND || 'memory',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/myelotrack',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // 32-byte base64 key for encrypting OAuth tokens at rest. Required before any
  // real integration connects; unset in the default seeded/dev setup.
  fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY || '',
  fhirSources: {
    msk: fhirSource('MSK'),
    'capital-health': fhirSource('CAPITAL_HEALTH'),
  },
};

/** True when a source has enough config to attempt the OAuth flow. */
export const isSourceConfigured = (source) => {
  const c = config.fhirSources[source];
  return Boolean(c && c.authorizeUrl && c.tokenUrl && c.clientId && c.redirectUri);
};
