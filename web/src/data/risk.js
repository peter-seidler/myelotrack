/**
 * MPN prognostic scores — one engine, several validated models, picked by the
 * patient's disease subtype:
 *
 *   PMF → DIPSS               (Passamonti et al., Blood 2010)
 *   ET  → revised IPSET-thrombosis (Barbui et al., Blood 2012; revised 2015)
 *   PV  → conventional thrombosis risk (age / prior thrombosis)
 *
 * Every model returns the same shape (see `scoreForState`) so the Score view
 * renders them uniformly. Inputs come straight from app state — the daily
 * check-in, the latest labs, and the editable clinical profile.
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
  const before =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (before) age -= 1;
  return age;
}

export const MPN_SUBTYPES = [
  { id: 'PMF', label: 'Primary myelofibrosis' },
  { id: 'ET', label: 'Essential thrombocythemia' },
  { id: 'PV', label: 'Polycythemia vera' },
];

// ---------------------------------------------------------------------------
// DIPSS (PMF) — points-based, hemoglobin weighted double.
// ---------------------------------------------------------------------------

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

const DIPSS_BANDS = [
  { label: 'Low', short: 'Low', min: 0, max: 0, tone: 'green', index: 0 },
  { label: 'Intermediate-1', short: 'Int-1', min: 1, max: 2, tone: 'yellow', index: 1 },
  { label: 'Intermediate-2', short: 'Int-2', min: 3, max: 4, tone: 'orange', index: 2 },
  { label: 'High', short: 'High', min: 5, max: 6, tone: 'red', index: 3 },
];

function dipssBand(points) {
  return DIPSS_BANDS.find((b) => points >= b.min && points <= b.max) || DIPSS_BANDS[3];
}

/** DIPSS-Plus factors the app can see (Gangat et al., JCO 2011). */
function dipssPlusExtras(state) {
  const plt = latestLab(state.labs, 'platelets');
  const transfused = !!state.user?.transfusionDependent;
  return [
    {
      key: 'platelets',
      label: 'Platelets under 100 K/µL',
      known: plt != null,
      present: plt != null && plt < 100,
      detail: plt == null ? 'no result' : `${plt} K/µL`,
    },
    {
      key: 'transfusion',
      label: 'Red-cell transfusion need',
      known: true,
      present: transfused,
      detail: transfused ? 'transfusion-dependent' : 'no',
    },
    {
      key: 'karyotype',
      label: 'Unfavorable karyotype',
      known: false,
      present: false,
      detail: 'not tracked yet',
    },
  ];
}

function dipss(state) {
  const factors = DIPSS_FACTORS.map((f) => {
    const r = f.evaluate(state);
    return { ...f, ...r, points: r.present ? f.weight : 0, evaluate: undefined };
  });
  const points = factors.reduce((sum, f) => sum + f.points, 0);
  const maxPoints = DIPSS_FACTORS.reduce((sum, f) => sum + f.weight, 0);
  const anyUnknown = factors.some((f) => !f.known);
  return {
    id: 'dipss',
    title: 'DIPSS',
    what: 'Prognostic risk · myelofibrosis',
    band: dipssBand(points),
    bands: DIPSS_BANDS,
    points,
    maxPoints,
    factors,
    extras: dipssPlusExtras(state),
    anyUnknown,
    footnote: anyUnknown
      ? 'Some inputs are missing, so this is a partial score. DIPSS (Passamonti et al., Blood 2010) is a prognostic reference, not a diagnosis — confirm with your care team.'
      : 'DIPSS (Passamonti et al., Blood 2010) is a prognostic reference, not a diagnosis — review trends with your care team. DIPSS-Plus (Gangat et al., JCO 2011) adds platelets, transfusion, and karyotype.',
  };
}

// ---------------------------------------------------------------------------
// Revised IPSET-thrombosis (ET) — categorical from age / thrombosis / JAK2.
// ---------------------------------------------------------------------------

const IPSET_BANDS = [
  { label: 'Very low', short: 'V.low', tone: 'green', index: 0 },
  { label: 'Low', short: 'Low', tone: 'yellow', index: 1 },
  { label: 'Intermediate', short: 'Int', tone: 'orange', index: 2 },
  { label: 'High', short: 'High', tone: 'red', index: 3 },
];

function thrombosisFactors(state, { over60, ageKnown, age, jak2 } = {}) {
  const priorThrombosis = !!state.user?.priorThrombosis;
  const factors = [
    {
      key: 'age',
      label: 'Age over 60',
      known: ageKnown,
      present: over60,
      detail: age == null ? 'add date of birth' : `${age} yrs`,
    },
    {
      key: 'thrombosis',
      label: 'Prior thrombosis',
      known: true,
      present: priorThrombosis,
      detail: priorThrombosis ? 'yes' : 'no',
    },
  ];
  if (jak2 !== undefined) {
    const jak2Known = jak2 === 'positive' || jak2 === 'negative';
    factors.push({
      key: 'jak2',
      label: 'JAK2 V617F mutation',
      known: jak2Known,
      present: jak2 === 'positive',
      detail: jak2Known ? jak2 : 'unknown',
    });
  }
  return factors;
}

function ipsetThrombosis(state) {
  const age = ageFromDob(state.user?.dob);
  const ageKnown = age != null;
  const over60 = age != null && age > 60;
  const jak2 = state.user?.jak2 || 'unknown';
  const jak2Pos = jak2 === 'positive';
  const jak2Known = jak2 === 'positive' || jak2 === 'negative';
  const priorThrombosis = !!state.user?.priorThrombosis;

  let band = null;
  if (priorThrombosis || (over60 && jak2Pos)) band = IPSET_BANDS[3];
  else if (over60 && jak2Known && !jak2Pos) band = IPSET_BANDS[2];
  else if (ageKnown && !over60 && jak2Pos) band = IPSET_BANDS[1];
  else if (ageKnown && !over60 && jak2Known) band = IPSET_BANDS[0];

  const anyUnknown = band === null;
  return {
    id: 'ipset',
    title: 'IPSET-thrombosis',
    what: 'Thrombosis risk · essential thrombocythemia',
    band: band || { label: 'Add details', short: '—', tone: 'neutral', index: -1 },
    bands: IPSET_BANDS,
    points: null,
    maxPoints: null,
    factors: thrombosisFactors(state, { over60, ageKnown, age, jak2 }),
    extras: null,
    anyUnknown,
    footnote:
      'Revised IPSET-thrombosis for essential thrombocythemia (Barbui et al., Blood 2012; revised 2015). A thrombosis-risk reference, not a diagnosis — confirm with your care team.',
  };
}

// ---------------------------------------------------------------------------
// Conventional PV thrombosis risk — high if age > 60 or a prior thrombosis.
// ---------------------------------------------------------------------------

const PV_BANDS = [
  { label: 'Low', short: 'Low', tone: 'green', index: 0 },
  { label: 'High', short: 'High', tone: 'red', index: 1 },
];

function pvThrombosis(state) {
  const age = ageFromDob(state.user?.dob);
  const over60 = age != null && age > 60;
  const priorThrombosis = !!state.user?.priorThrombosis;
  const high = priorThrombosis || over60;
  return {
    id: 'pv',
    title: 'PV thrombosis risk',
    what: 'Thrombosis risk · polycythemia vera',
    band: high ? PV_BANDS[1] : PV_BANDS[0],
    bands: PV_BANDS,
    points: null,
    maxPoints: null,
    factors: thrombosisFactors(state, { over60, ageKnown: age != null, age }),
    extras: null,
    anyUnknown: age == null,
    footnote:
      'Conventional polycythemia vera thrombosis risk: high with age over 60 or a prior thrombosis. A reference, not a diagnosis — confirm with your care team.',
  };
}

/** Pick and compute the right score for the patient's MPN subtype. */
export function scoreForState(state) {
  const subtype = state.user?.mpnSubtype || 'PMF';
  if (subtype === 'ET') return ipsetThrombosis(state);
  if (subtype === 'PV') return pvThrombosis(state);
  return dipss(state);
}
