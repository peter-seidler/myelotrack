/**
 * Seed data for the in-memory backend, shaped to match the MongoDB schema
 * (see docs/database-schema.md). Fake data only — no real PHI.
 */

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d;
};

const ANALYTE_META = {
  hemoglobin: { unit: 'g/dL', refLow: 13.5, refHigh: 17.5, loinc: '718-7' },
  platelets: { unit: 'K/µL', refLow: 150, refHigh: 400, loinc: '777-3' },
  wbc: { unit: 'K/µL', refLow: 4.0, refHigh: 11.0, loinc: '6690-2' },
  anc: { unit: 'K/µL', refLow: 1.8, refHigh: 7.7, loinc: '751-8' },
  blasts: { unit: '%', refLow: 0, refHigh: 0, loinc: '709-7' },
};

/** Clinical flag for a value against its analyte's reference range. */
export function computeFlag(analyte, value) {
  if (analyte === 'blasts') {
    if (value <= 0) return 'normal';
    return value >= 5 ? 'critical' : 'high';
  }
  const meta = ANALYTE_META[analyte];
  if (value < meta.refLow) return 'low';
  if (value > meta.refHigh) return 'high';
  return 'normal';
}

function labResult(analyte, daysBack, value, source, seq) {
  const meta = ANALYTE_META[analyte];
  const collectedAt = daysAgo(daysBack);
  return {
    _id: `lab_${analyte}_${seq}`,
    analyte,
    loinc: meta.loinc,
    value,
    unit: meta.unit,
    refLow: meta.refLow,
    refHigh: meta.refHigh,
    flag: computeFlag(analyte, value),
    collectedAt,
    reportedAt: collectedAt,
    source,
    provenance: {
      system: source === 'manual' ? 'manual-entry' : 'epic-fhir-r4',
      resourceType: 'Observation',
      externalId: `Observation/${analyte}-${seq}`,
    },
  };
}

const LAB_SERIES = {
  hemoglobin: [
    [64, 11.8, 'capital-health'],
    [50, 11.2, 'msk'],
    [37, 10.6, 'msk'],
    [28, 9.9, 'capital-health'],
    [15, 9.4, 'msk'],
    [3, 9.1, 'msk'],
  ],
  platelets: [
    [64, 118, 'capital-health'],
    [50, 104, 'msk'],
    [37, 96, 'msk'],
    [28, 88, 'capital-health'],
    [15, 79, 'msk'],
    [3, 72, 'msk'],
  ],
  wbc: [
    [64, 14.2, 'capital-health'],
    [50, 15.1, 'msk'],
    [37, 13.8, 'msk'],
    [28, 12.9, 'capital-health'],
    [15, 11.6, 'msk'],
    [3, 10.8, 'msk'],
  ],
  anc: [
    [50, 9.4, 'msk'],
    [37, 8.6, 'msk'],
    [28, 7.9, 'capital-health'],
    [15, 6.8, 'msk'],
    [3, 6.1, 'msk'],
  ],
  blasts: [
    [50, 1, 'msk'],
    [37, 2, 'msk'],
    [15, 3, 'msk'],
    [3, 4, 'msk'],
  ],
};

/** Build a fresh set of seed collections. */
export function buildSeed() {
  const labResults = [];
  for (const [analyte, rows] of Object.entries(LAB_SERIES)) {
    rows.forEach((row, i) =>
      labResults.push(labResult(analyte, row[0], row[1], row[2], i)),
    );
  }

  return {
    user: {
      _id: 'user_1',
      displayName: 'Peter Seidler',
      condition: { primary: 'myelofibrosis', icd10: ['D47.4'], notes: 'MDS overlap' },
      careTeams: [
        { key: 'msk', name: 'Memorial Sloan Kettering' },
        { key: 'capital-health', name: 'Capital Health' },
      ],
    },
    medications: [
      {
        _id: 'm1',
        name: 'Ruxolitinib',
        brand: 'Jakafi',
        dose: '20 mg',
        purpose: 'JAK1/2 inhibitor — spleen/symptom control',
        schedule: { times: ['08:00', '20:00'] },
        active: true,
      },
      {
        _id: 'm2',
        name: 'Folic acid',
        brand: '',
        dose: '1 mg',
        purpose: 'Supportive — hematopoiesis',
        schedule: { times: ['08:00'] },
        active: true,
      },
      {
        _id: 'm3',
        name: 'Allopurinol',
        brand: 'Zyloprim',
        dose: '300 mg',
        purpose: 'Uric acid control',
        schedule: { times: ['08:00'] },
        active: true,
      },
      {
        _id: 'm4',
        name: 'Pantoprazole',
        brand: 'Protonix',
        dose: '40 mg',
        purpose: 'GI protection',
        schedule: { times: ['08:00'] },
        active: true,
      },
    ],
    doseLogs: [],
    symptomEntries: [
      { _id: 's1', date: daysAgo(2), total: 38, items: {}, weightKg: 71.4 },
      { _id: 's2', date: daysAgo(1), total: 43, items: {}, weightKg: 71.2 },
    ],
    labResults,
    pallorPhotos: [
      { _id: 'p1', capturedAt: daysAgo(1), eye: 'right', pallorScore: 0.44 },
      { _id: 'p2', capturedAt: daysAgo(8), eye: 'right', pallorScore: 0.39 },
      { _id: 'p3', capturedAt: daysAgo(16), eye: 'right', pallorScore: 0.33 },
    ],
    integrationConnections: [
      {
        source: 'msk',
        system: 'epic-fhir-r4',
        status: 'connected',
        lastSyncAt: daysAgo(3),
      },
      {
        source: 'capital-health',
        system: 'epic-fhir-r4',
        status: 'connected',
        lastSyncAt: daysAgo(28),
      },
    ],
    auditLog: [],
  };
}
