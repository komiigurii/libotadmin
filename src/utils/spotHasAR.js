// Which spots get AR at all — the same rule as the backend's
// utils/spotHasAR.js and the app's spotHasAR. AR is for buildings: a festival
// is an event and a river has nothing to anchor a model to, so Nature and
// Festivals spots get no AR View button, no AR mission and no AR settings.
export const NO_AR_CATEGORIES = ['nature', 'festivals'];

export function spotHasAR(categories) {
  const list = (Array.isArray(categories) ? categories : categories ? [categories] : [])
    .map((c) => String(c).toLowerCase());
  return !list.some((c) => NO_AR_CATEGORIES.includes(c));
}
