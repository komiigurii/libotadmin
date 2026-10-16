// Where a traveler is on the warning ladder, in words: "Warning 2",
// "Warning 3 · Suspension 1" (QA 2026-10-16: show warning 1, 2, 3).
// `warnings` counts every warning ever given; the backend's warningCount
// restarts once two warnings turn into a suspension, so it can't say this.
// Empty when there's nothing on record.
export function standingLabel({ warnings = 0, suspensions = 0 } = {}) {
  const parts = [];
  if (warnings > 0) parts.push(`Warning ${warnings}`);
  if (suspensions > 0) parts.push(`Suspension ${suspensions}`);
  return parts.join(' · ');
}
