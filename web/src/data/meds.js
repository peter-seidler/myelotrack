/** Medication/dose helpers derived from state. */

/**
 * Expand the regimen into individual scheduled doses for today, sorted by time.
 * Each dose has a stable `key` (`${medId}@${time}`) used in the dose log.
 */
export function todaysDoses(state) {
  const doses = [];
  for (const med of state.medications) {
    for (const time of med.times) {
      doses.push({ key: `${med.id}@${time}`, med, time });
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time));
}

/** Count of doses taken vs. total scheduled for today. */
export function todaysAdherence(state) {
  const doses = todaysDoses(state);
  const taken = doses.filter((d) => state.doseLog[d.key] === 'taken').length;
  return { taken, total: doses.length };
}

/**
 * Cycle a dose's status: unset → taken → skipped → unset.
 * @returns {string|null} the new status
 */
export function nextDoseStatus(current) {
  if (current == null) return 'taken';
  if (current === 'taken') return 'skipped';
  return null;
}
