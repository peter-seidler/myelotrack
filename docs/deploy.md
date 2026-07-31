# Deploying MyeloTrack to Google Cloud Run

This is the runbook for taking MyeloTrack from local-only to a live,
HIPAA-ready web app on GCP. It is a **separate** GCP project, repo, and domain
from any other Cognigenics project — nothing here is shared.

**Topology.** One Cloud Run service runs the Express API, which also serves the
built PWA from the same origin. Same origin means no cross-origin CORS and a
same-site session cookie. The container is defined by the repo `Dockerfile`.

```
            ┌───────────────────────── Cloud Run: "myelotrack" ─────────────┐
  Browser ──┤  Express (Node 20)                                             │
  / iOS     │   ├─ GET  /                → PWA (web/dist, static + SPA)       │
  (Capacitor)│   └─ /api/v1/*            → JSON API (audited, passkey-gated)  │
            └───────┬───────────────────────────────────┬───────────────────┘
                    │                                     │
          MongoDB Atlas (BAA)                    GCS bucket (SSE) — pallor photos
          field-encrypted PHI                    + Secret Manager for keys
```

**End state.** MyeloTrack runs at `https://<your-domain>` (or the default
`*.run.app` URL). Patients sign in with a passkey; each sees only their own
record. Labs/meds/symptoms/pallor persist in Atlas; pallor images live in an
encrypted GCS bucket.

**Rough cost.** Cloud Run scales to zero when idle (~$0 when unused); Atlas
shared/serverless tier is a few dollars a month at this data volume.

---

## Phase 0 — what's already done (in this repo)

- `Dockerfile` — multi-stage build (Vite PWA → static bundle; Node server with
  prod deps only; non-root; binds `$PORT`).
- The API serves the PWA at `/` and the API at `/api/v1` from one origin
  (`WEB_DIR` env, set to `/app/web/dist` in the image).
- The web client is built with `VITE_USE_API=true` so it calls the API on
  relative paths.
- Baseline security headers + `trust proxy` for correct HTTPS/WebAuthn behind
  Cloud Run.
- `.github/workflows/deploy.yml` — auto-deploy on merge to `main`, **dormant**
  until you set `DEPLOY_ENABLED=true` (see the last section).

You can build and run the exact production image locally right now:

```bash
docker build -t myelotrack:local .
docker run --rm -p 8080:8080 myelotrack:local
open http://localhost:8080        # PWA + API, one origin
curl localhost:8080/healthz       # {"status":"ok","backend":"memory"}
```

With no DB configured it runs on in-memory sample data — a faithful preview of
the deployed app before any PHI is involved.

---

## Phase 1 — provision the infrastructure (one-time, needs your accounts)

> **Shortcut.** Two things are yours alone: create the GCP project + link
> billing (step 1 below) and create the Atlas cluster + **sign the BAA**
> (step 2). After those, the rest is scripted:
>
> ```bash
> PROJECT_ID=cognigenics-myelotrack REGION=us-east1 bash scripts/setup-gcp.sh
> # add your Atlas URI to Secret Manager (the script prints the exact command)
> PROJECT_ID=cognigenics-myelotrack REGION=us-east1 bash scripts/deploy.sh
> ```
>
> The manual steps below are what those scripts run, for reference.

### 1. GCP project + APIs

```bash
gcloud auth login
PROJECT_ID=cognigenics-myelotrack           # globally unique
gcloud projects create $PROJECT_ID --name="MyeloTrack"
gcloud config set project $PROJECT_ID
gcloud billing projects link $PROJECT_ID --billing-account=XXXXXX-XXXXXX-XXXXXX
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com
```

### 2. MongoDB Atlas (with a BAA)

1. Create an Atlas project + cluster (M0/serverless is fine to start).
2. **Sign the BAA** — Atlas offers one; this is non-negotiable for PHI.
3. Enable encryption at rest (default on paid tiers) and TLS (default).
4. Create a DB user; allow-list Cloud Run's egress (or use serverless + private
   endpoint later). Grab the `mongodb+srv://…` connection string.

### 3. Encrypted object store for pallor photos

```bash
gsutil mb -l us-east1 -b on gs://$PROJECT_ID-pallor
# Bucket is encrypted at rest by default (Google-managed keys; upgrade to
# CMEK/KMS if policy requires). A GCS storage backend for the API is Phase 1
# code — until then images fall back to the encrypted local/Atlas path.
```

### 4. Secrets

Generate the field-encryption key and store every secret in Secret Manager —
never in the image or env files:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # FIELD_ENCRYPTION_KEY
for S in MONGODB_URI FIELD_ENCRYPTION_KEY SESSION_SECRET; do
  gcloud secrets create $S --replication-policy=automatic
done
# then: printf '%s' "<value>" | gcloud secrets versions add MONGODB_URI --data-file=-
```

### 5. First deploy (establishes the service config)

```bash
gcloud run deploy myelotrack \
  --source . \
  --region us-east1 \
  --allow-unauthenticated \
  --set-env-vars=DATA_BACKEND=mongo,AUTH_REQUIRED=true,RP_ID=<your-domain>,RP_NAME=MyeloTrack,RP_ORIGIN=https://<your-domain>,APP_URL=https://<your-domain>,CORS_ORIGINS=https://<your-domain> \
  --set-secrets=MONGODB_URI=MONGODB_URI:latest,FIELD_ENCRYPTION_KEY=FIELD_ENCRYPTION_KEY:latest,SESSION_SECRET=SESSION_SECRET:latest
```

`--allow-unauthenticated` lets the public reach the site; the app's own passkey
auth (`AUTH_REQUIRED=true`) is what actually gates PHI.

### 6. Domain + TLS

Map your domain in Cloud Run (`gcloud run domain-mappings create`) or front it
with a load balancer. TLS certs are managed for you. Set `RP_ID` / `RP_ORIGIN`
to that domain **before** anyone registers a passkey (WebAuthn binds
credentials to the origin).

---

## Turn on auto-deploy (optional)

Once the service exists and the first manual deploy has set its config:

1. Create a deploy service account with `run.admin`, `cloudbuild.builds.editor`,
   `storage.admin`, `iam.serviceAccountUser`; download its JSON key.
2. In the GitHub repo settings:
   - Secrets: `GCP_SA_KEY` (the JSON) and `GCP_PROJECT_ID`.
   - Variables: `DEPLOY_ENABLED=true` (and optionally `GCP_REGION`).
3. Every merge to `main` now rebuilds and deploys a new revision. Until then the
   workflow is skipped, so it never shows as a failing check.

---

## Still ahead (later phases)

- **Real FHIR sources** — register Epic sandbox apps for MSK + Capital Health,
  then flip to live (the SMART-on-FHIR sync code already exists and is tested).
- **iOS** — Capacitor wrapper around the same web build → App Store.
- **Ops** — durable audit-log sink + retention, automated Atlas backups,
  uptime/error monitoring.

Done since the first draft: the export/delete-PHI endpoints, and the **GCS
storage backend** for pallor images — `deploy.sh` sets `STORAGE_BACKEND=gcs`
and `setup-gcp.sh` grants the runtime service account access to the bucket.
