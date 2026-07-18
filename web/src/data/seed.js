import { daysAgo } from '../lib/format.js';
import { pallorSwatch } from '../lib/pallor-image.js';
import { buildLabs } from './labs.js';

/**
 * Build the initial in-memory application state. Field names mirror the
 * backend API responses / MongoDB schema (see docs/), so swapping this seed
 * for real API calls is a data-source change, not a reshape.
 *
 * All data here is fake and lives only in memory — refresh resets it.
 */
export function buildInitialState() {
  return {
    user: {
      displayName: 'Peter Seidler',
      initials: 'PS',
      condition: 'Myelofibrosis · MDS overlap',
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
}
