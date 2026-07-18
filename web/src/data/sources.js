/**
 * Data sources MyeloTrack aggregates across. The `key` matches
 * `labResults.source` in the backend schema; `color` is a CSS custom property
 * used for pills and chart points.
 */
export const SOURCES = {
  msk: { name: 'Memorial Sloan Kettering', color: 'var(--blue)' },
  'capital-health': { name: 'Capital Health', color: 'var(--green)' },
  'apple-health': { name: 'Apple Health', color: 'var(--label-2)' },
  manual: { name: 'Entered manually', color: 'var(--purple)' },
};
