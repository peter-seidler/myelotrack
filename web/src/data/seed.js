import { daysAgo } from '../lib/format.js';
import { pallorSwatch } from '../lib/pallor-image.js';
import { buildLabs } from './labs.js';

// Optional local data override (git-ignored `local-seed.js`) — lets you run the
// app on your own real results without ever committing PHI. It's absent in CI
// and for anyone who hasn't created it, so `import.meta.glob` resolves to an
// empty object and the sample data below is used unchanged.
const localModules = import.meta.glob('./local-seed.js', { eager: true });
const localOverride = localModules['./local-seed.js']?.localState;

function withLocalOverride(state) {
  return typeof localOverride === 'function' ? localOverride(state) : state;
}

/**
 * Build the initial in-memory application state. Field names mirror the
 * backend API responses / MongoDB schema (see docs/), so swapping this seed
 * for real API calls is a data-source change, not a reshape.
 *
 * All data here is fake and lives only in memory — refresh resets it.
 */
export function buildInitialState() {
  const state = {
    user: {
      displayName: 'Peter Seidler',
      initials: 'PS',
      condition: 'Myelofibrosis · MDS overlap',
      // Clinical profile — semi-static facts that feed the prognostic scores.
      dob: '1963-06-20',
      mpnSubtype: 'PMF', // PMF → DIPSS · ET → IPSET-thrombosis · PV → PV risk
      jak2: 'positive', // positive | negative | unknown
      priorThrombosis: false,
      transfusionDependent: false,
    },

    // Today's working MPN-SAF TSS entry.
    todayItems: {
      fatigue: 5,
      earlySatiety: 3,
      abdominalDiscomfort: 2,
      inactivity: 4,
      concentration: 3,
      nightSweats: 6,
      itching: 4,
      bonePain: 5,
      fever: 0,
      weightLoss: 1,
    },
    todayWeight: 71.2,
    todaySubmitted: false,

    // Other daily diagnostics (Vitals + Notes sub-tabs).
    todayVitals: {
      temperature: 37.0, // °C
      heartRate: 74, // bpm
      bpSystolic: 122, // mmHg
      bpDiastolic: 78, // mmHg
      spo2: 97, // %
      spleenCm: 4, // cm palpable below the left costal margin
    },
    todayNote: '',
    todaySleepHours: 6.5,
    todayEnergy: 5, // 0–10

    // Recent daily totals (0–100), oldest→newest; today is appended on save.
    symptomHistory: [46, 52, 49, 41, 44, 38, 43],

    medications: [
      {
        id: 'm1',
        name: 'Ruxolitinib',
        brand: 'Jakafi',
        dose: '20 mg',
        purpose: 'JAK1/2 inhibitor — spleen/symptom control',
        times: ['08:00', '20:00'],
      },
      {
        id: 'm2',
        name: 'Folic acid',
        brand: '',
        dose: '1 mg',
        purpose: 'Supportive — hematopoiesis',
        times: ['08:00'],
      },
      {
        id: 'm3',
        name: 'Allopurinol',
        brand: 'Zyloprim',
        dose: '300 mg',
        purpose: 'Uric acid control',
        times: ['08:00'],
      },
      {
        id: 'm4',
        name: 'Pantoprazole',
        brand: 'Protonix',
        dose: '40 mg',
        purpose: 'GI protection',
        times: ['08:00'],
      },
    ],

    // Today's dose log, keyed `${medId}@${time}` -> 'taken' | 'skipped'.
    doseLog: {},
    // Rolling 30-day adherence (seeded).
    adherence30: 0.91,

    labs: buildLabs(),

    pallor: [
      {
        id: 'p1',
        capturedAt: daysAgo(1),
        eye: 'right',
        pallorScore: 0.44,
        img: pallorSwatch(0.44),
      },
      {
        id: 'p2',
        capturedAt: daysAgo(8),
        eye: 'right',
        pallorScore: 0.39,
        img: pallorSwatch(0.39),
      },
      {
        id: 'p3',
        capturedAt: daysAgo(16),
        eye: 'right',
        pallorScore: 0.33,
        img: pallorSwatch(0.33),
      },
    ],
  };
  return withLocalOverride(state);
}
