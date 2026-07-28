import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { $ } from './lib/dom.js';
import { store } from './state/store.js';
import { fmtDate } from './lib/format.js';
import { initSheet } from './ui/sheet.js';
import { initRouter } from './router.js';
import { toast } from './ui/toast.js';
import { USE_API } from './config.js';
import { openSettingsSheet } from './ui/settings.js';
import { SOURCES } from './data/sources.js';
import { api } from './api/client.js';
import { showAuthGate } from './ui/auth-gate.js';
import { loadSavedProfile, needsOnboarding, showOnboarding } from './ui/onboarding.js';

/** If we just returned from a care-team OAuth redirect, acknowledge + clean up. */
function handleOAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get('connected');
  if (!connected) return;
  toast(`${SOURCES[connected]?.name || connected} connected`);
  params.delete('connected');
  const query = params.toString();
  window.history.replaceState(
    {},
    '',
    window.location.pathname + (query ? `?${query}` : ''),
  );
}

/** Bootstrap the app: fill chrome, hydrate (if configured), start the router. */
async function main() {
  // Apply any saved clinical profile before drawing chrome or scoring.
  loadSavedProfile();
  const { user } = store.state;
  $('#navDate').textContent = fmtDate(new Date(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();
  $('#navAvatar').textContent = user.initials;
  // The avatar opens the Care teams / settings sheet.
  $('#navAvatar').addEventListener('click', openSettingsSheet);
  $('#navAvatar').style.cursor = 'pointer';

  initSheet();
  handleOAuthReturn();

  // When an API base is configured: gate on a passkey if the server requires
  // it, then replace the seed with live data. On any failure, keep the
  // already-loaded seed so the app still works offline.
  if (USE_API) {
    try {
      const auth = await api.authMe();
      if (auth.required && !auth.authenticated) {
        await showAuthGate({ hasCredentials: auth.hasCredentials });
      }
      await store.hydrate();
    } catch (err) {
      console.warn('API hydrate failed — using sample data', err);
      toast('Offline — showing sample data');
    }
  }

  // First run on this device: welcome, consent, and a quick clinical setup.
  if (needsOnboarding()) await showOnboarding();

  initRouter();
}

main();
