# MyeloTrack — Architecture

MyeloTrack is a personal health-tracking app for a single patient managing a
myeloproliferative neoplasm (MPN) — here, myelofibrosis with an MDS overlap.
The clinical reality that drives the architecture: **care is split across
multiple institutions**, each with its own patient portal and its own copy of
the labs. Bloodwork gets drawn at Memorial Sloan Kettering (MSK) for the
MPN/transplant workstream and at Capital Health for local/routine draws, and
neither portal shows the other's results. MyeloTrack's job is to be the one
place where the whole picture lives.

```
┌──────────────────────────────────────────────────────────────┐
│  Client (prototype/index.html today → PWA / native later)      │
│  Today · Meds · Labs · Pallor                                  │
└───────────────┬────────────────────────────────────────────────┘
                │  HTTPS (JSON, bearer token)
        ┌───────▼────────┐
        │  Express API    │  Node 20 + Express 4
        │  /api/v1/*      │
        └───┬───────┬─────┘
            │       │
   ┌────────▼──┐  ┌─▼──────────────────────────────────────────┐
   │ MongoDB    │  │ Integration workers (scheduled + on-demand) │
   │ (Atlas,    │  │  • MSK        → Epic FHIR R4 (SMART/OAuth)  │
   │  encrypted)│  │  • Capital H. → Epic FHIR R4 (SMART/OAuth)  │
   └────────────┘  │  • Apple Health → HealthKit export (client) │
                   └─────────────────────────────────────────────┘
```

## Components

### 1. Client (`web/`)

The client is a framework-free **Vite + vanilla JS** app under `web/`,
decomposed into modules (`web/src/{data,state,lib,ui,views}`) with a central
observable store and a hash router. State is in-memory and seeded on load; no
network calls yet. It is deliberately framework-free so it stays small and
portable. When it graduates to a real app, the intended path is a PWA
(installable, offline-capable via a service worker + IndexedDB cache) before
any native wrapper. Native only becomes necessary for deeper HealthKit access
and reliable background sync.

The store's field names deliberately mirror the `server/` API responses and the
MongoDB schema, so swapping the seeded in-memory store for real API calls is a
data-source change, not a reshape.

Four tabs:

- **Today** — daily symptom check-in built on the **MPN-SAF TSS** (Myelo­proliferative
  Neoplasm Symptom Assessment Form Total Symptom Score): ten items (fatigue,
  early satiety, abdominal discomfort, inactivity, concentration, night sweats,
  itching, bone pain, fever, unintentional weight loss), each 0–10. The daily
  total (0–100) is the headline trend. Plus today's due medications and a
  weight entry.
- **Meds** — the regimen (e.g. ruxolitinib, folic acid, allopurinol, plus
  supportive meds) with per-dose logging and a rolling adherence percentage.
- **Labs** — CBC-centric lab aggregation _across care teams_. Hemoglobin,
  platelets, WBC, ANC, and peripheral blasts trended over time with the source
  institution tagged on every value. This is the core differentiator.
- **Pallor** — periodic eye (palpebral conjunctiva) photos as a rough,
  at-home proxy for anemia progression between draws. Capture, store, and
  eyeball the trend; never a diagnostic, always "flag it for the next call."

### 2. Backend API (Express)

Stateless JSON API. Everything is scoped to the authenticated patient — this is
a single-tenant-per-user app, not a clinic system.

```
POST   /api/v1/auth/login              # passwordless / passkey preferred
GET    /api/v1/symptoms?from=&to=      # daily MPN-SAF entries
POST   /api/v1/symptoms                # create/replace today's entry
GET    /api/v1/medications             # regimen
POST   /api/v1/medications/:id/doses   # log a dose (taken / skipped / late)
GET    /api/v1/labs?analyte=&source=   # aggregated results, filterable
GET    /api/v1/labs/analytes           # distinct analytes seen
GET    /api/v1/pallor                  # photo entries (metadata + signed URLs)
POST   /api/v1/pallor                  # upload a new photo (multipart → object store)
POST   /api/v1/integrations/:source/sync   # trigger an on-demand pull
GET    /api/v1/integrations/status     # last-sync + connection health per source
```

Conventions: bearer token in `Authorization`, ISO-8601 timestamps in UTC,
cursor pagination on list endpoints, and every lab/observation carries a
`source` and a `provenance` block (see schema) so aggregated data never loses
track of where it came from.

### 3. Integration workers

Each external source is an independent worker with its own OAuth token store and
its own sync cadence. A pull normalizes the upstream payload into MyeloTrack's
canonical `labResults` / `observations` shape and upserts by a stable
source-scoped identifier so re-syncs are idempotent (no duplicate rows).

#### MSK — Epic FHIR R4 (SMART on FHIR)

MSK runs Epic. Patient-facing access is via **SMART on FHIR** using the
`patient/*.read` scopes over the standard R4 endpoints:

- `Patient` — demographics / MRN reconciliation
- `Observation?category=laboratory` — CBC and chemistry results
- `DiagnosticReport` — grouped panels + any narrative
- `MedicationRequest` — the prescribed regimen (reconcile against manual entries)
- `Observation?category=vital-signs` — weight, etc.

Auth is the SMART standalone-launch OAuth2 flow (PKCE), refresh-token backed.
LOINC codes drive analyte mapping (e.g. Hemoglobin `718-7`, Platelets `777-3`,
Leukocytes `6690-2`, Neutrophils absolute `751-8`, Blasts/100 leukocytes
`709-7`). We store the raw LOINC alongside our internal analyte key.

#### Capital Health — Epic FHIR R4

Capital Health also runs Epic, so it's the _same_ SMART-on-FHIR integration
class pointed at a different base URL and registered as a separate OAuth client.
The two configs differ only in endpoints, client IDs, and token stores — the
normalization layer is shared. This is why "aggregate labs across care teams"
is tractable: both speak R4, so once each is connected the merge is just
dedup-by-provenance on a common schema.

#### Apple Health — HealthKit

Weight, and where available lab values the user has synced into Health, come
from **HealthKit** on the client. HealthKit has no server API, so this is a
client-side export: the app requests read permission for the relevant
`HKQuantityType`s, reads samples, and posts them to `/api/v1/labs` (or a
dedicated `/observations`) tagged `source: "apple-health"`. In the web
prototype this is stubbed; it requires the native/PWA-with-native-bridge build.

### Getting API access

FHIR access is not open — each health system vets app registrations. The path:

1. Register in the vendor's developer program (Epic: **fhir.epic.com** →
   "App Orchard" / the current developer portal). Create a patient-facing
   SMART app, declare the R4 scopes above, get sandbox credentials first.
2. Ask each institution's Health Information Management / patient-portal team
   to enable the app for the patient's own record. As the patient (or their
   authorized representative), you have a right to your data — lead with that.

Outreach email template:

> **Subject:** Patient API (FHIR) access request — my own medical records
>
> Hello,
>
> I'm a patient at [MSK / Capital Health] (MRN [____]) managing a
> myeloproliferative condition, and I'm consolidating my own lab results and
> medication list across the care teams I see. I'd like to connect a personal
> application to my record using your patient-facing SMART on FHIR API
> (FHIR R4, `patient/*.read` scopes only — read-only, my data only).
>
> Could you point me to the right team or developer-portal process to register a
> patient app and enable it for my record? Happy to complete any verification you
> require. Thank you for helping me keep an accurate, unified picture of my care.
>
> [Name] · [DOB] · [portal login email] · [phone]

## Data sensitivity & compliance

This is PHI. Non-negotiables before any real backend serves real data:

- **Encryption at rest** — MongoDB Atlas with encryption enabled; field-level
  encryption for the most sensitive fields; photos in an encrypted object store
  (S3 SSE-KMS or equivalent), never in the DB.
- **Encryption in transit** — TLS everywhere; HSTS; no mixed content.
- **Audit logging** — append-only log of every read/write to PHI (who, what,
  when, from where), retained per policy and never mutated in place.
- **Access control** — passwordless/passkey auth, short-lived access tokens,
  refresh rotation. OAuth refresh tokens for the FHIR sources stored encrypted
  and never returned to the client.
- **HIPAA-compliant hosting** — a provider that will sign a **BAA**
  (AWS/GCP/Azure all do; MongoDB Atlas offers a BAA). Even for a single-patient
  personal app, treat it as covered and design to the standard.
- **Data minimization** — pull only the analytes and resources the app uses;
  don't hoard the whole record.

None of the above is implemented in the prototype. The prototype holds only
seeded, fake data in memory and talks to no network.
