/**
 * Client configuration.
 *
 * `VITE_API_BASE_URL` (set at build/dev time) points the client at the Express
 * API. When it's unset, the app runs fully offline on seeded in-memory data —
 * the default, so `npm run dev`/`build` need no backend.
 *
 *   VITE_API_BASE_URL=http://localhost:8787 npm run dev
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
export const USE_API = Boolean(API_BASE);
