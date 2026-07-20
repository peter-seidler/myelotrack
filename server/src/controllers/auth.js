import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { asyncHandler, badRequest } from '../lib/async-handler.js';
import { config } from '../config/index.js';
import { issueSession, verifySession } from '../lib/session.js';
import {
  setSessionCookie,
  clearSessionCookie,
  readSessionToken,
} from '../middleware/auth.js';

const repo = (req) => req.app.locals.repo;

// Single-tenant subject for this personal app.
const USER_ID = 'user_1';
const USER_NAME = 'patient@myelotrack.local';

const b64 = (u8) => Buffer.from(u8).toString('base64url');
const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64url'));

/** GET /api/v1/auth/me — auth state for the client to decide what UI to show. */
export const me = asyncHandler(async (req, res) => {
  const authenticated = Boolean(
    verifySession(readSessionToken(req), config.auth.sessionSecret),
  );
  const credentials = await repo(req).listCredentials();
  res.json({
    data: {
      authenticated,
      required: config.auth.required,
      hasCredentials: credentials.length > 0,
    },
  });
});

/** POST /api/v1/auth/logout */
export const logout = asyncHandler(async (req, res) => {
  clearSessionCookie(res);
  res.json({ data: { ok: true } });
});

/** GET /api/v1/auth/registration/options — begin passkey registration. */
export const registrationOptions = asyncHandler(async (req, res) => {
  const existing = await repo(req).listCredentials();
  const options = await generateRegistrationOptions({
    rpName: config.auth.rpName,
    rpID: config.auth.rpId,
    userID: new TextEncoder().encode(USER_ID),
    userName: USER_NAME,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  await repo(req).setAuthChallenge(options.challenge);
  res.json({ data: options });
});

/** POST /api/v1/auth/registration/verify — finish passkey registration. */
export const registrationVerify = asyncHandler(async (req, res) => {
  const expectedChallenge = await repo(req).getAuthChallenge();
  if (!expectedChallenge) throw badRequest('no registration in progress');

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: config.auth.origin,
      expectedRPID: config.auth.rpId,
    });
  } catch (err) {
    throw badRequest(`registration failed: ${err.message}`);
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw badRequest('registration could not be verified');
  }

  const { credential } = verification.registrationInfo;
  await repo(req).addCredential({
    id: credential.id,
    publicKey: b64(credential.publicKey),
    counter: credential.counter,
    transports: req.body.response?.transports || [],
  });
  await repo(req).setAuthChallenge(null);

  setSessionCookie(res, issueSession(USER_ID, config.auth.sessionSecret));
  res.status(201).json({ data: { verified: true } });
});

/** GET /api/v1/auth/authentication/options — begin passkey sign-in. */
export const authenticationOptions = asyncHandler(async (req, res) => {
  const creds = await repo(req).listCredentials();
  const options = await generateAuthenticationOptions({
    rpID: config.auth.rpId,
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
    userVerification: 'preferred',
  });
  await repo(req).setAuthChallenge(options.challenge);
  res.json({ data: options });
});

/** POST /api/v1/auth/authentication/verify — finish passkey sign-in. */
export const authenticationVerify = asyncHandler(async (req, res) => {
  const expectedChallenge = await repo(req).getAuthChallenge();
  if (!expectedChallenge) throw badRequest('no sign-in in progress');

  const stored = await repo(req).getCredential(req.body?.id);
  if (!stored) throw badRequest('unknown credential');

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: config.auth.origin,
      expectedRPID: config.auth.rpId,
      credential: {
        id: stored.id,
        publicKey: fromB64(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports,
      },
    });
  } catch (err) {
    throw badRequest(`sign-in failed: ${err.message}`);
  }
  if (!verification.verified) throw badRequest('sign-in could not be verified');

  await repo(req).updateCredentialCounter(
    stored.id,
    verification.authenticationInfo.newCounter,
  );
  await repo(req).setAuthChallenge(null);

  setSessionCookie(res, issueSession(USER_ID, config.auth.sessionSecret));
  res.json({ data: { verified: true } });
});
