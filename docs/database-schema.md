# MyeloTrack — Database Schema (MongoDB)

MongoDB (Atlas) is the store. It's a natural fit here: the shapes are
document-y (a symptom entry is a nested object, a lab result carries a
free-form provenance block), the write patterns are append-heavy, and the read
patterns are time-range scans per patient. Everything below is scoped to a
single patient via `userId`; this is a personal app, so there is exactly one
"real" user per deployment, but the field keeps the data model honest and makes
a future multi-user version a non-rewrite.

Conventions:

- `_id`: Mongo ObjectId unless noted.
- Timestamps are `Date` (BSON), stored UTC.
- Every collection has `userId` (ObjectId, indexed) and `createdAt`/`updatedAt`.
- Money-free, but clinically precise: numeric lab values keep their `unit`.

---

## `users`

One document per person. (Realistically one per deployment.)

```js
{
  _id: ObjectId,
  email: "patient@example.com",     // login / passkey identity
  displayName: "…",
  dob: ISODate("…"),
  condition: {
    primary: "myelofibrosis",        // free text + optional ICD-10
    icd10: ["D47.4"],
    notes: "MDS overlap"
  },
  careTeams: [                       // the institutions we aggregate across
    { key: "msk",           name: "Memorial Sloan Kettering", mrn: "…" },
    { key: "capital-health", name: "Capital Health",           mrn: "…" }
  ],
  createdAt: ISODate, updatedAt: ISODate
}
```

Index: `{ email: 1 }` unique.

---

## `symptomEntries`

One document per day — the MPN-SAF TSS check-in. Ten items, each 0–10; `total`
(0–100) is denormalized on write for cheap trending.

```js
{
  _id: ObjectId,
  userId: ObjectId,
  date: ISODate("2026-07-18"),      // date-only semantics (local midnight → UTC)
  items: {
    fatigue: 6,
    earlySatiety: 4,
    abdominalDiscomfort: 3,
    inactivity: 5,
    concentration: 4,
    nightSweats: 7,
    itching: 5,
    bonePain: 6,
    fever: 1,
    weightLoss: 2
  },
  total: 43,                         // sum of items, 0–100
  weightKg: 71.2,                    // optional daily weight
  note: "rough night, sweats worse",
  createdAt: ISODate, updatedAt: ISODate
}
```

Indexes: `{ userId: 1, date: -1 }` unique (one entry per day; upsert replaces).

---

## `medications`

The regimen. Static-ish reference docs; dose events live in `doseLogs`.

```js
{
  _id: ObjectId,
  userId: ObjectId,
  name: "Ruxolitinib",
  brand: "Jakafi",
  dose: "20 mg",
  form: "tablet",
  schedule: {
    timesPerDay: 2,
    times: ["08:00", "20:00"],       // local reminder times
    daysOfWeek: [0,1,2,3,4,5,6]      // 0 = Sunday
  },
  purpose: "JAK1/2 inhibitor — spleen/symptom control",
  prescriber: { careTeam: "msk", name: "Dr. …" },
  active: true,
  startedAt: ISODate, stoppedAt: null,
  createdAt: ISODate, updatedAt: ISODate
}
```

Index: `{ userId: 1, active: 1 }`.

---

## `doseLogs`

One document per scheduled dose occurrence. Adherence % is computed by
aggregating these over a window (taken / (taken + skipped + missed)).

```js
{
  _id: ObjectId,
  userId: ObjectId,
  medicationId: ObjectId,
  scheduledFor: ISODate("2026-07-18T08:00:00Z"),
  status: "taken",                   // "taken" | "skipped" | "missed" | "late"
  takenAt: ISODate("2026-07-18T08:12:00Z") || null,
  note: "",
  createdAt: ISODate, updatedAt: ISODate
}
```

Indexes: `{ userId: 1, scheduledFor: -1 }`, `{ userId: 1, medicationId: 1, scheduledFor: -1 }`.

---

## `labResults`

The heart of the app: CBC-centric results **aggregated across care teams**.
One document per analyte-per-draw. `source` + `provenance` guarantee we always
know which institution a value came from, and a stable `externalId` makes
re-syncs idempotent.

```js
{
  _id: ObjectId,
  userId: ObjectId,
  analyte: "hemoglobin",             // internal canonical key
  loinc: "718-7",                    // source code, when known
  value: 9.4,
  unit: "g/dL",
  refLow: 13.5, refHigh: 17.5,       // source-provided reference range
  flag: "low",                       // "low" | "high" | "critical" | "normal" | null
  collectedAt: ISODate("2026-07-15T13:20:00Z"),
  reportedAt:  ISODate("2026-07-15T18:02:00Z"),
  source: "msk",                     // "msk" | "capital-health" | "apple-health" | "manual"
  provenance: {
    system: "epic-fhir-r4",
    resourceType: "Observation",
    externalId: "Observation/abc123",// upstream FHIR id → dedup key
    diagnosticReportId: "DiagnosticReport/xyz",
    fetchedAt: ISODate
  },
  createdAt: ISODate, updatedAt: ISODate
}
```

Canonical `analyte` keys used by the CBC views: `hemoglobin`, `hematocrit`,
`platelets`, `wbc`, `anc` (absolute neutrophils), `blasts` (peripheral, %),
plus room to grow (`ldh`, `ferritin`, …).

Indexes:

- `{ userId: 1, analyte: 1, collectedAt: -1 }` — trend queries.
- `{ userId: 1, "provenance.externalId": 1 }` unique-sparse — idempotent upsert.
- `{ userId: 1, source: 1, collectedAt: -1 }` — per-source filtering.

> **Cross-team dedup note:** the same physical draw is _not_ expected to appear
> from two institutions, but if a value is entered `manual` and later arrives
> via FHIR, reconciliation prefers the FHIR-sourced record (richer provenance)
> and marks the manual one superseded rather than deleting it.

---

## `pallorPhotos`

Eye-photo (palpebral conjunctiva) entries — a rough at-home anemia proxy
between draws. The **image bytes never go in Mongo**; they live in an encrypted
object store and the document holds a key + signed-URL metadata.

```js
{
  _id: ObjectId,
  userId: ObjectId,
  capturedAt: ISODate,
  storage: {
    bucket: "myelotrack-pallor",
    key: "u/<userId>/2026/07/18/uuid.jpg",   // object-store key, not a public URL
    sha256: "…",                              // integrity
    contentType: "image/jpeg",
    bytes: 184320
  },
  eye: "right",                      // "left" | "right"
  // optional, computed later — never diagnostic:
  pallorScore: 0.42,                 // 0–1 heuristic from mean redness of ROI
  linkedHemoglobinId: ObjectId || null, // nearest-in-time lab, for context
  note: "morning, natural light",
  createdAt: ISODate, updatedAt: ISODate
}
```

Index: `{ userId: 1, capturedAt: -1 }`.

---

## `integrationConnections`

Per-source OAuth/connection state for the FHIR pulls. Tokens are **encrypted at
the field level** and never returned to the client.

```js
{
  _id: ObjectId,
  userId: ObjectId,
  source: "msk",                     // matches labResults.source
  system: "epic-fhir-r4",
  fhirBaseUrl: "https://…/api/FHIR/R4",
  status: "connected",               // "connected" | "expired" | "error" | "disconnected"
  scopes: ["patient/Observation.read", "patient/MedicationRequest.read", "…"],
  tokens: {                          // 🔒 field-level encrypted
    accessTokenEnc: "…",
    refreshTokenEnc: "…",
    expiresAt: ISODate
  },
  lastSyncAt: ISODate,
  lastSyncError: null,
  createdAt: ISODate, updatedAt: ISODate
}
```

Index: `{ userId: 1, source: 1 }` unique.

---

## `auditLog`

Append-only PHI access trail. Written on every read/write of a PHI-bearing
collection. Never updated or deleted in place; retention handled by a TTL-free
archival job, not by mutation.

```js
{
  _id: ObjectId,
  userId: ObjectId,
  actor: "user" | "integration-worker" | "system",
  action: "read" | "create" | "update" | "delete",
  collection: "labResults",
  documentId: ObjectId || null,
  meta: { source: "msk", route: "GET /api/v1/labs", ip: "…", ua: "…" },
  at: ISODate
}
```

Index: `{ userId: 1, at: -1 }`, `{ collection: 1, at: -1 }`.

---

## Relationships at a glance

```
users ─┬─< symptomEntries
       ├─< medications ─< doseLogs
       ├─< labResults >── (linkedHemoglobinId) ──< pallorPhotos
       ├─< integrationConnections   (source ⇄ labResults.source)
       └─< auditLog
```

The prototype models `symptomEntries`, `medications`/`doseLogs`, `labResults`,
and `pallorPhotos` in memory with the same field names, so wiring a real
backend is mostly "point fetch at these endpoints" rather than a reshape.
