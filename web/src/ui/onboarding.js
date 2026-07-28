import { el } from '../lib/dom.js';
import { store } from '../state/store.js';
import { MPN_SUBTYPES } from '../data/risk.js';

const KEY = 'mt_profile';
const MARK = `<svg viewBox="0 0 40 44" fill="none" stroke="currentColor" stroke-width="2.3"
  stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2.5" width="32" height="39" rx="13"/>
  <path d="M13 18 L20 10.5 L27 18"/><path d="M20 10.5 V32"/><path d="M15 22 H25"/>
  <path d="M13.5 26.5 H26.5"/><path d="M12 31 H28"/></svg>`;

function readProfile() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

/** Merge any saved profile into state (call once at boot, before rendering). */
export function loadSavedProfile() {
  const saved = readProfile();
  if (saved) Object.assign(store.state.user, saved);
  return saved;
}

/** True until onboarding has been completed on this device. */
export function needsOnboarding() {
  return !readProfile();
}

/**
 * First-run flow: welcome → consent → clinical setup. Resolves once complete,
 * persisting the chosen profile so it doesn't show again on this device.
 * @returns {Promise<void>}
 */
export function showOnboarding() {
  return new Promise((resolve) => {
    const u = store.state.user;
    const draft = { mpnSubtype: u.mpnSubtype || 'PMF', dob: u.dob || '' };
    let step = 0;

    const overlay = el('div', { class: 'auth-gate onb' });
    document.body.append(overlay);

    const dots = () =>
      el(
        'div',
        { class: 'onb-dots' },
        [0, 1, 2].map((i) =>
          el('span', { class: 'onb-dot' + (i === step ? ' on' : '') }),
        ),
      );

    const go = (n) => {
      step = n;
      render();
    };

    const finish = () => {
      const profile = {
        mpnSubtype: draft.mpnSubtype,
        dob: draft.dob,
        consentedAt: new Date().toISOString(),
      };
      store.commit((s) => Object.assign(s.user, profile));
      try {
        localStorage.setItem(KEY, JSON.stringify(profile));
      } catch {
        // storage unavailable — the flow still completes for this session
      }
      overlay.remove();
      resolve();
    };

    function welcome() {
      return el('div', { class: 'panel' }, [
        el('div', { class: 'mark', html: MARK }),
        el('h1', {}, 'Welcome to MyeloTrack'),
        el(
          'p',
          {},
          'A daily companion for living with a myeloproliferative neoplasm — track symptoms, labs, medications, and your risk score in one place.',
        ),
        el('button', { class: 'btn', onclick: () => go(1) }, 'Get started'),
        dots(),
      ]);
    }

    function consent() {
      const check = el('input', { type: 'checkbox' });
      const cont = el(
        'button',
        { class: 'btn', onclick: () => check.checked && go(2) },
        'I agree — continue',
      );
      cont.disabled = true;
      check.addEventListener('change', () => {
        cont.disabled = !check.checked;
      });
      return el('div', { class: 'panel' }, [
        el('h1', {}, 'Your data & consent'),
        el('div', { class: 'onb-consent' }, [
          el(
            'p',
            {},
            'MyeloTrack stores what you enter — symptoms, vitals, medications, lab results, and eye photos — to help you track your condition and share it with your care team.',
          ),
          el('ul', {}, [
            el('li', {}, 'It’s a tracking tool, not a diagnosis or medical advice.'),
            el('li', {}, 'Your data is encrypted and never sold.'),
            el('li', {}, 'You can export or delete it at any time.'),
          ]),
        ]),
        el('label', { class: 'onb-agree' }, [
          check,
          el('span', {}, 'I understand and agree.'),
        ]),
        cont,
        el('button', { class: 'btn ghost', onclick: () => go(0) }, 'Back'),
        dots(),
      ]);
    }

    function setup() {
      const subtype = el(
        'select',
        { class: 'onb-control', onchange: (e) => (draft.mpnSubtype = e.target.value) },
        MPN_SUBTYPES.map((t) => el('option', { value: t.id }, t.label)),
      );
      subtype.value = draft.mpnSubtype;
      const dob = el('input', {
        type: 'date',
        class: 'onb-control',
        value: draft.dob,
        onchange: (e) => (draft.dob = e.target.value),
      });
      return el('div', { class: 'panel' }, [
        el('h1', {}, 'A few details'),
        el(
          'p',
          {},
          'These power your personalized risk score. You can change them anytime in Settings.',
        ),
        el('div', { class: 'onb-field' }, [el('label', {}, 'MPN subtype'), subtype]),
        el('div', { class: 'onb-field' }, [el('label', {}, 'Date of birth'), dob]),
        el('button', { class: 'btn', onclick: finish }, 'Start tracking'),
        el('button', { class: 'btn ghost', onclick: () => go(1) }, 'Back'),
        dots(),
      ]);
    }

    function render() {
      overlay.replaceChildren([welcome, consent, setup][step]());
    }
    render();
  });
}
