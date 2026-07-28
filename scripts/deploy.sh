#!/usr/bin/env bash
#
# Deploy MyeloTrack to Cloud Run — first deploy and every manual one after.
# Builds the image from the repo Dockerfile via Cloud Build and rolls out a new
# revision. Run scripts/setup-gcp.sh first (APIs, bucket, secrets).
#
# Passkey auth (WebAuthn) binds credentials to an exact origin, so the service
# needs to know its own public host. This script figures that out for you:
#   • DOMAIN set        → use https://$DOMAIN
#   • else service URL  → reuse the existing *.run.app host
#   • else (very first) → bootstrap with AUTH_REQUIRED=false, then tells you to
#                          re-run once the URL exists to turn passkeys on.
#
# Usage:
#   PROJECT_ID=cognigenics-myelotrack REGION=us-east1 [DOMAIN=app.example.com] \
#     bash scripts/deploy.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-cognigenics-myelotrack}"
REGION="${REGION:-us-east1}"
SERVICE="${SERVICE:-myelotrack}"
DOMAIN="${DOMAIN:-}"

existing_url() {
  gcloud run services describe "$SERVICE" \
    --project="$PROJECT_ID" --region="$REGION" \
    --format='value(status.url)' 2>/dev/null || true
}

HOST=""
if [ -n "$DOMAIN" ]; then
  HOST="$DOMAIN"
else
  URL="$(existing_url)"
  HOST="${URL#https://}"
fi

if [ -n "$HOST" ]; then
  echo "▸ Deploying with passkey auth bound to: https://$HOST"
  ENV="DATA_BACKEND=mongo,AUTH_REQUIRED=true,RP_NAME=MyeloTrack"
  ENV="$ENV,RP_ID=$HOST,RP_ORIGIN=https://$HOST,APP_URL=https://$HOST,CORS_ORIGINS=https://$HOST"
else
  echo "▸ First deploy — no public host yet. Bootstrapping WITHOUT auth."
  echo "  Re-run this script after it prints the URL to enable passkeys."
  ENV="DATA_BACKEND=mongo,AUTH_REQUIRED=false,RP_NAME=MyeloTrack"
fi

gcloud run deploy "$SERVICE" \
  --source . \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --allow-unauthenticated \
  --set-env-vars="$ENV" \
  --set-secrets="MONGODB_URI=MONGODB_URI:latest,FIELD_ENCRYPTION_KEY=FIELD_ENCRYPTION_KEY:latest,SESSION_SECRET=SESSION_SECRET:latest" \
  --quiet

URL="$(existing_url)"
echo ""
echo "✓ Deployed: $URL"
if [ -z "$HOST" ]; then
  echo "  Now re-run to bind passkeys to this host:"
  echo "    PROJECT_ID=$PROJECT_ID REGION=$REGION bash scripts/deploy.sh"
fi
