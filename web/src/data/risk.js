/**
 * DIPSS — Dynamic International Prognostic Scoring System for myelofibrosis.
 *
 * Five inputs already tracked in the app feed one prognostic risk score
 * (Passamonti et al., Blood 2010). Hemoglobin is weighted double; the rest
 * score one point each — so `weight` is per-category on purpose, and the whole
 * table is data-driven, ready to be tuned or made more granular later.
 *
 * DIPSS-Plus (Gangat et al., JCO 2011) adds platelets, transfusion need, and
 * karyotype; see `dipssPlusExtras` for the ones the app can already see.
 */

/** Latest numeric value for a lab analyte, or null when there's no result. */
function latestLab(labs, key) {
  const series = labs?.[key]?.series;
  if (!series || !series.length) return null;
  return series[series.length - 1].value;
}

/** Whole years from an ISO date-of-birth, or null if absent/unparseable. */
export function ageFromDob(dob) {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthsBefore =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (monthsBefore) age -= 1;
  return age;
}

// Each factor knows its own weight and how to read itself from app state.
export const DIPSS_FACTORS = [
  {
    key: 'age',
    label: 'Age over 65',
    weight: 1,
    evaluate: (state) => {
      const age = ageFromDob(state.user?.dob);
      return {
        known: age != null,
        present: age != null && age > 65,
        detail: age == null ? 'add date of birth' : `${age} yrs`,
      };
    },
  },
  {
    key: 'constitutional',
    label: 'Constitutional symptoms',
    weight: 1,
    evaluate: (state) => {
      const it = state.todayItems || {};
      const worst = Math.max(it.fever ?? 0, it.nightSweats ?? 0, it.weightLoss ?? 0);
      return {
        known: true,
        present: worst >= 3,
        detail: worst >= 3 ? 'fever / sweats / weight loss' : 'minimal',
      };
    },
  },
  {
    key: 'hemoglobin',
    label: 'Hemoglobin under 10 g/dL',
    weight: 2,
    evaluate: (state) => {
      const v = latestLab(state.labs, 'hemoglobin');
      return {
        known: v != null,
        present: v != null && v < 10,
        detail: v == null ? 'no result' : `${v} g/dL`,
      };
    },
  },
  {
    key: 'wbc',
    label: 'White cells over 25 K/µL',
    weight: 1,
    evaluate: (state) => {
      const v = latestLab(state.labs, 'wbc');
      return {
        known: v != null,
        present: v != null && v > 25,
        detail: v == null ? 'no result' : `${v} K/µL`,
      };
    },
  },
  {
    key: 'blasts',
    label: 'Circulating blasts ≥ 1%',
    weight: 1,
    evaluate: (state) => {
      const v = latestLab(state.labs, 'blasts');
      return {
        known: v != null,
        present: v != null && v >= 1,
        detail: v == null ? 'no result' : `${v}%`,
      };
    },
  },
];

// Risk bands by total points (0–6). `index` gives the 0–3 position on the meter.
export const DIPSS_BANDS = [
  { label: 'Low', min: 0, max: 0, tone: 'green', index: 0 },
  { label: 'Intermediate-1', min: 1, max: 2, tone: 'yellow', index: 1 },
  { label: 'Intermediate-2', min: 3, max: 4, tone: 'orange', index: 2 },
  { label: 'High', min: 5, max: 6, tone: 'red', index: 3 },
];

export function dipssBand(points) {
  return DIPSS_BANDS.find((b) => points >= b.min && points <= b.max) || DIPSS_BANDS[3];
}

/** Compute the DIPSS score + a per-factor breakdown from app state. */
export function dipssScore(state) {
  const factors = DIPSS_FACTORS.map((f) => {
    const r = f.evaluate(state);
    return {
      key: f.key,
      label: f.label,
      weight: f.weight,
      known: r.known,
      present: r.present,
      detail: r.detail,
      points: r.present ? f.weight : 0,
    };
  });
  const points = factors.reduce((sum, f) => sum + f.points, 0);
  const maxPoints = DIPSS_FACTORS.reduce((sum, f) => sum + f.weight, 0);
  return {
    points,
    maxPoints,
    band: dipssBand(points),
    bands: DIPSS_BANDS,
    factors,
    anyUnknown: factors.some((f) => !f.known),
  };
}

/** DIPSS-Plus factors the app can (partly) see — the path to a finer score. */
export function dipssPlusExtras(state) {
  const plt = latestLab(state.labs, 'platelets');
  return [
    {
      key: 'platelets',
      label: 'Platelets under 100 K/µL',
      weight: 1,
      known: plt != null,
      present: plt != null && plt < 100,
      detail: plt == null ? 'no result' : `${plt} K/µL`,
    },
    {
      key: 'transfusion',
      label: 'Red-cell transfusion need',
      weight: 1,
      known: false,
      present: false,
      detail: 'not tracked yet',
    },
    {
      key: 'karyotype',
      label: 'Unfavorable karyotype',
      weight: 1,
      known: false,
      present: false,
      detail: 'not tracked yet',
    },
  ];
}
