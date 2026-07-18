/**
 * MPN-SAF TSS — the ten validated Myeloproliferative Neoplasm Symptom
 * Assessment Form items. Each is scored 0 (absent) to 10 (worst imaginable);
 * the daily total (0–100) is the headline trend on the Today tab.
 */
export const SYMPTOM_ITEMS = [
  { key: 'fatigue', label: 'Fatigue' },
  { key: 'earlySatiety', label: 'Early satiety' },
  { key: 'abdominalDiscomfort', label: 'Abdominal discomfort' },
  { key: 'inactivity', label: 'Inactivity' },
  { key: 'concentration', label: 'Concentration' },
  { key: 'nightSweats', label: 'Night sweats' },
  { key: 'itching', label: 'Itching' },
  { key: 'bonePain', label: 'Bone pain' },
  { key: 'fever', label: 'Fever' },
  { key: 'weightLoss', label: 'Weight loss' },
];

/** Sum of the ten MPN-SAF items for a given `items` map (0–100). */
export const totalSymptomScore = (items) =>
  SYMPTOM_ITEMS.reduce((sum, item) => sum + (items[item.key] || 0), 0);

/** Severity band for a total symptom score. */
export function symptomBand(total) {
  if (total < 20) return { label: 'Mild', color: 'var(--green)' };
  if (total < 40) return { label: 'Moderate', color: 'var(--yellow)' };
  if (total < 60) return { label: 'High', color: 'var(--orange)' };
  return { label: 'Severe', color: 'var(--red)' };
}
