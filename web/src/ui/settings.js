import { el, clear } from '../lib/dom.js';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { api } from '../api/client.js';
import { USE_API } from '../config.js';
import { store } from '../state/store.js';
import { SOURCES } from '../data/sources.js';
import { fmtDate } from '../lib/format.js';

const FHIR_SOURCES = ['msk', 'capital-health'];

/** Open the "Care teams" settings sheet: connection status + connect/sync. */
export function openSettingsSheet() {
  openSheet((sheet) => {
    sheet.append(
      el('h2', {}, 'Care teams'),
      el(
        'p',
        { class: 'lede' },
        'Connect your patient portals to sync labs and medications into one timeline.',
      ),
    );

    if (!USE_API) {
      sheet.append(
        el(
          'div',
          { class: 'empty' },
          'Connecting a care team needs the backend API. Set VITE_API_BASE_URL to enable it.',
        ),
      );
      return;
    }

    const card = el('div', { class: 'card tight' });
    card.append(el('div', { class: 'row' }, [el('div', { class: 'grow' }, 'Loading…')]));
    sheet.append(card);

    renderRows(card);
  });
}

async function renderRows(card) {
  let statuses = [];
  try {
    statuses = await api.getIntegrationsStatus();
  } catch {
    clear(card);
    card.append(
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, 'Status unavailable')]),
    );
    return;
  }
  const bySource = Object.fromEntries(statuses.map((s) => [s.source, s]));
  clear(card);

  for (const source of FHIR_SOURCES) {
    const st = bySource[source];
    const connected = st?.status === 'connected';
    const sub = connected
      ? st.lastSyncAt
        ? `Last synced ${fmtDate(new Date(st.lastSyncAt), { month: 'short', day: 'numeric' })}`
        : 'Connected'
      : 'Not connected';

    const actions = el('div', { class: 'trail' });
    actions.append(
      el(
        'button',
        { class: 'btn small ghost', onclick: () => connectCareTeam(source) },
        connected ? 'Reconnect' : 'Connect',
      ),
    );
    if (connected) {
      actions.append(
        el(
          'button',
          { class: 'btn small secondary', onclick: (e) => syncCareTeam(source, e) },
          'Sync',
        ),
      );
    }

    card.append(
      el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'title' }, SOURCES[source]?.name || source),
          el('div', { class: 'sub' }, sub),
        ]),
        actions,
      ]),
    );
  }
}

async function connectCareTeam(source) {
  try {
    const { authorizeUrl } = await api.connectSource(source);
    window.location.assign(authorizeUrl); // hand off to the portal's OAuth
  } catch {
    toast(`${SOURCES[source]?.name || source} isn't configured yet`);
  }
}

async function syncCareTeam(source, event) {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  try {
    const result = await api.syncSource(source);
    const labs = result?.labs?.upserted ?? 0;
    const meds = result?.medications?.upserted ?? 0;
    await store.hydrate();
    toast(`Synced ${labs} labs, ${meds} meds`);
  } catch {
    toast('Sync failed');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sync';
  }
}
