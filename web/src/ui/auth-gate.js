import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { el } from '../lib/dom.js';
import { api } from '../api/client.js';

/**
 * Full-screen passkey gate. Resolves once the user registers or signs in with
 * a passkey (WebAuthn). Shown only when the server requires auth and there's no
 * active session.
 *
 * @param {{ hasCredentials: boolean }} state
 * @returns {Promise<void>}
 */
export function showAuthGate({ hasCredentials }) {
  return new Promise((resolve) => {
    const err = el('div', { class: 'err' });
    const primaryLabel = hasCredentials ? 'Sign in with passkey' : 'Create a passkey';

    const primaryBtn = el('button', { class: 'btn' }, primaryLabel);
    // Let a returning user register another device, or a new user sign in.
    const altBtn = el(
      'button',
      { class: 'btn ghost' },
      hasCredentials ? 'Set up a new passkey' : 'I already have a passkey',
    );

    const panel = el('div', { class: 'panel' }, [
      el('div', {
        class: 'mark',
        html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2 6 4-14 2 8h6"/></svg>`,
      }),
      el('h1', {}, 'MyeloTrack'),
      el(
        'p',
        {},
        'Your health data is protected with a passkey — no password. Use your device fingerprint, face, or PIN.',
      ),
      primaryBtn,
      altBtn,
      err,
    ]);
    const overlay = el('div', { class: 'auth-gate' }, [panel]);
    document.body.append(overlay);

    let mode = hasCredentials ? 'signin' : 'register';

    const run = async () => {
      err.textContent = '';
      primaryBtn.disabled = true;
      try {
        if (mode === 'register') {
          const options = await api.registrationOptions();
          const attestation = await startRegistration({ optionsJSON: options });
          await api.registrationVerify(attestation);
        } else {
          const options = await api.authenticationOptions();
          const assertion = await startAuthentication({ optionsJSON: options });
          await api.authenticationVerify(assertion);
        }
        overlay.remove();
        resolve();
      } catch (e) {
        err.textContent =
          e?.name === 'NotAllowedError'
            ? 'Passkey prompt was dismissed. Try again.'
            : 'That didn’t work. Please try again.';
        primaryBtn.disabled = false;
      }
    };

    primaryBtn.addEventListener('click', run);
    altBtn.addEventListener('click', () => {
      mode = mode === 'register' ? 'signin' : 'register';
      primaryBtn.textContent =
        mode === 'register' ? 'Create a passkey' : 'Sign in with passkey';
      altBtn.textContent =
        mode === 'register' ? 'I already have a passkey' : 'Set up a new passkey';
      err.textContent = '';
    });
  });
}
