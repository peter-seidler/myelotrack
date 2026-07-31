#!/usr/bin/env bash
#
# One-time GCP provisioning for MyeloTrack — the scriptable half of
# docs/deploy.md → "Phase 1". Run this AFTER you have:
#   1. Created the GCP project and linked a billing account.
#   2. Created a MongoDB Atlas cluster and SIGNED THE BAA.
#
# It is safe to re-run: every step checks for existence first and never
# deletes or overwrites anything. It does NOT store your Atlas connection
# string (that's the one secret only you can supply) — it prints the command
# to do so at the end.
#
# Usage:
#   PROJECT_ID=cognigenics-myelotrack REGION=us-east1 bash scripts/setup-gcp.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-cognigenics-myelotrack}"
REGION="${REGION:-us-east1}"
BUCKET="${BUCKET:-${PROJECT_ID}-pallor}"

echo "▸ Project: $PROJECT_ID  ·  Region: $REGION  ·  Pallor bucket: $BUCKET"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "▸ Enabling APIs…"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com

echo "▸ Encrypted pallor bucket…"
if gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  echo "  exists — leaving as-is"
else
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" \
    --uniform-bucket-level-access
  echo "  created (Google-managed encryption; upgrade to CMEK/KMS if policy requires)"
fi

echo "▸ Granting the Cloud Run runtime service account access to the bucket…"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/storage.objectAdmin" >/dev/null
echo "  ${RUNTIME_SA} → objectAdmin on gs://$BUCKET"

echo "▸ Secrets…"
for S in MONGODB_URI FIELD_ENCRYPTION_KEY SESSION_SECRET; do
  if gcloud secrets describe "$S" >/dev/null 2>&1; then
    echo "  $S exists"
  else
    gcloud secrets create "$S" --replication-policy=automatic
    echo "  $S created (empty)"
  fi
done

# Generate the 32-byte field-encryption + session keys once, if not already set.
gen_key_if_missing() {
  local secret="$1"
  if gcloud secrets versions access latest --secret="$secret" >/dev/null 2>&1; then
    echo "  $secret already has a value — keeping it"
  else
    echo "  generating $secret"
    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" \
      | gcloud secrets versions add "$secret" --data-file=-
  fi
}
gen_key_if_missing FIELD_ENCRYPTION_KEY
gen_key_if_missing SESSION_SECRET

cat <<EOF

✓ GCP is provisioned. One secret is still yours to supply — the Atlas
  connection string (from your BAA-covered cluster):

    printf '%s' 'mongodb+srv://USER:PASS@cluster/myelotrack?retryWrites=true&w=majority' \\
      | gcloud secrets versions add MONGODB_URI --data-file=-

  Then deploy:

    PROJECT_ID=$PROJECT_ID REGION=$REGION bash scripts/deploy.sh
EOF
