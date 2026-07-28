/**
 * Client configuration.
 *
 * Two ways to point the client at the Express API:
 *
 * - `VITE_API_BASE_URL` — an absolute origin, for cross-origin dev (the web
 *   dev server on :5173 talking to the API on :8787).
 *
 *       VITE_API_BASE_URL=http://localhost:8787 npm run dev
 *
 * - `VITE_USE_API=true` — enable the API with *relative* URLs, for the
 *   single-origin production build where Express serves this bundle and the
 *   API from the same host (see the Dockerfile / docs/deploy.md).
 *
 * When neither is set, the app runs fully offline on seeded in-memory data —
 * the default, so a plain `npm run dev`/`build` needs no backend.
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
export const USE_API = import.meta.env.VITE_USE_API === 'true' || Boolean(API_BASE);
