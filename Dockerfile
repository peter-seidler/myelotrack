# MyeloTrack — production container for Google Cloud Run.
#
# Single service: the Express API also serves the built PWA from the same
# origin, so there is no cross-origin CORS and the session cookie stays
# same-site. The web client is built with VITE_USE_API=true so it calls the
# API on relative /api/v1 paths.
#
# Local test:
#   docker build -t myelotrack:local .
#   docker run --rm -p 8080:8080 myelotrack:local
#   open http://localhost:8080          # PWA + API on one origin
#   curl localhost:8080/healthz
#
# Cloud Run deploys via:  gcloud run deploy myelotrack --source .

# ─── Web builder ──────────────────────────────────────────────────────
# Builds the Vite PWA into a static bundle. Isolated stage so a build failure
# stops the image rather than shipping a stale/missing client.
FROM node:20-slim AS web-builder
WORKDIR /app
# Install against the lockfile first for layer caching. All workspace manifests
# must be present for `npm ci` to resolve the workspace tree.
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY . .
# Same-origin production build → API on relative /api/v1 (see web/src/config.js).
ENV VITE_USE_API=true
RUN npm run build --workspace web

# ─── Runtime ──────────────────────────────────────────────────────────
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIR=/app/web/dist
WORKDIR /app

# Production dependencies only. web has no runtime deps (Vite is dev-only), so
# this resolves to the server's deps (express, multer, simplewebauthn) plus the
# optional mongoose driver.
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev && npm cache clean --force

# Server source + the built web bundle from the builder stage.
COPY server/ server/
COPY --from=web-builder /app/web/dist /app/web/dist

# Non-root user for defense in depth.
RUN useradd --create-home --uid 1001 myelotrack && chown -R myelotrack:myelotrack /app
USER myelotrack

EXPOSE 8080

# Cloud Run sets PORT; bind 0.0.0.0 via the server's config default.
CMD ["node", "server/src/index.js"]
