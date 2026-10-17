// Work-hours rule: the cold-start answer for drives the history model has never
// seen. "Weekdays 8-18 are usually business" is how MileIQ-style apps get a new
// user to a one-tap review on day one. It is only ever a *suggestion*: it never
// sets `auto`, so "Confirm N drives I recognise" does not file it, and a
// business trip still needs the user's purpose and a named destination.
// Pure functions. Nothing leaves the device.

export const DEFAULT_SCHEDULE = { enabled: false, days: [1, 2, 3, 4, 5], startHour: 8, endHour: 18, category: "business" };

export function normalizeSchedule(s = {}) {
  const d = DEFAULT_SCHEDULE;
  const days = Array.isArray(s.days) ? [...new Set(s.days.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : d.days;
  const hour = (v, fb) => (v !== "" && v !== null && v !== undefined && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 24 ? Number(v) : fb);
  let startHour = hour(s.startHour, d.startHour), endHour = hour(s.endHour, d.endHour);
  if (endHour <= startHour) { startHour = d.startHour; endHour = d.endHour; }
  const category = ["business", "medical", "charity", "commute", "personal"].includes(s.category) ? s.category : d.category;
  return { enabled: s.enabled === true, days, startHour, endHour, category };
}

export function toggleDay(schedule, day) {
  const s = normalizeSchedule(schedule);
  const days = s.days.includes(day) ? s.days.filter((x) => x !== day) : [...s.days, day].sort();
  return { ...s, days };
}

// trip: { startedAt }. Returns the same shape as classify.suggestCategory, or null.
export function scheduleSuggestion(schedule, trip, { utcOffsetMin = 0 } = {}) {
  const s = normalizeSchedule(schedule);
  if (!s.enabled || s.days.length === 0 || !trip) return null;
  const local = new Date(trip.startedAt + utcOffsetMin * 60e3);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  if (!s.days.includes(local.getUTCDay()) || hour < s.startHour || hour >= s.endHour) return null;
  return {
    category: s.category,
    confidence: 0.5,
    reason: `inside your work hours (${s.startHour}:00-${s.endHour}:00); a guess, not a pattern from your history.`,
    auto: false,
    source: "schedule",
  };
}

// History first (it knows the place); the schedule only fills the gap.
export function suggestWithSchedule(historySuggestion, schedule, trip, opts) {
  return historySuggestion || scheduleSuggestion(schedule, trip, opts);
}
