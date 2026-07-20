# MyeloTrack

Personal health-tracking app for monitoring a myeloproliferative condition
(myelofibrosis/MDS) — daily symptoms, medication adherence, lab-result
aggregation across care teams, and eye-photo pallor tracking.

> Handles personal health data. Nothing here is a live PHI backend yet — the
> app runs on seeded, in-memory sample data and talks to no external service.
> See **Data sensitivity** before that changes.

## Layout

```
myelotrack/
├─ web/       Vite + vanilla-JS client (no framework)
├─ server/    Express API (in-memory backend by default; MongoDB optional)
├─ docs/      architecture.md · database-schema.md
└─ .github/   CI (lint · format · build · test)
```

npm workspaces tie `web` and `server` together; install once at the root.

## Quick start

```bash
npm install            # installs both workspaces

npm run dev            # web (Vite, :5173) + API (:8787) together
# or run them separately:
npm run dev:web
npm run dev:server

npm run build          # production build of the web client → web/dist
npm test               # server tests (node:test)
npm run lint           # ESLint across both workspaces
npm run format         # Prettier
```

By default the client runs fully offline on seeded in-memory data — refresh to
reset. To point it at the live API instead, set `VITE_API_BASE_URL`:

```bash
# terminal 1 — API
npm run dev:server
# terminal 2 — client wired to it
VITE_API_BASE_URL=http://localhost:8787 npm run dev:web
```

The client then hydrates its reads from the API and writes check-ins, doses,
and pallor readings back to it; if the API is unreachable it falls back to the
seed so the UI still loads. Camera-based pallor capture needs a secure context,
so use the Vite dev server (or any HTTPS host) rather than opening the file over
`file://`.

## Architecture in one paragraph

The **client** (`web/`) is framework-free vanilla JS behind a Vite build:
design tokens + component CSS, a tiny observable `store`, a hash-free tab
router, and one module per view (`today`, `meds`, `labs`, `pallor`). The
**server** (`server/`) is an Express API whose data access hides behind a
repository interface — an in-memory implementation (default, zero
dependencies, seeded) and a Mongoose/MongoDB implementation selected by
`DATA_BACKEND`. The store's fields, the API responses, and the Mongo schema
all share the same shape, so moving the client from seed data to the live API
is a data-source swap, not a rewrite. Full detail in
[`docs/architecture.md`](docs/architecture.md) and
[`docs/database-schema.md`](docs/database-schema.md).

## Design system

- **Fonts:** Inter Tight (headlines), Inter (body) — via Google Fonts.
- **Theme:** dark, iOS-native (system colors, blur nav bar, safe-area insets).
- **No UI framework** — plain DOM helpers and CSS.

## Features

- **Today** — MPN-SAF TSS daily check-in (10 validated items → 0–100 score
  dial), weight, and today's due meds.
- **Meds** — per-dose logging (taken/skipped) and rolling adherence.
- **Labs** — CBC trends (Hgb, platelets, WBC, ANC, blasts) **aggregated across
  MSK and Capital Health**, every value tagged with its source institution.
- **Pallor** — conjunctiva eye-photo tracking with camera capture + fallback.

## Data sensitivity

Before any real backend serves real data: encryption at rest, encryption in
transit, append-only audit logging, passwordless/passkey auth, and
HIPAA-compliant hosting under a signed BAA. The audit middleware and schema are
scaffolded for this; the hosting and encryption are not implemented here. See
`docs/architecture.md` → "Data sensitivity & compliance".

## License

MIT — see [LICENSE](LICENSE).
