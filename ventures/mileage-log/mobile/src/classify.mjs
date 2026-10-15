// Suggests a category for a detected drive from how the user classified earlier
// drives, so the daily review is a one-swipe confirmation. A small, explainable
// model (place votes with a time-of-week prior), not a black box: it can say why.
// Pure functions. Nothing leaves the device.

import { haversineMiles } from "../../calc.mjs";

export const CATEGORIES = ["business", "medical", "charity", "commute", "personal"];
const NEAR_MILES = 0.1; // ~160 m: same place

// history: [{ to: {lat, lon}, from?: {lat, lon}, category, startedAt }]
// trip:    { to, from?, startedAt }
export function suggestCategory(history, trip, { utcOffsetMin = 0, minVotes = 2 } = {}) {
  const votes = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  let matches = 0;
  for (const h of history) {
    if (!CATEGORIES.includes(h.category)) continue;
    const dest = haversineMiles(h.to, trip.to);
    if (dest > NEAR_MILES) continue;
    let w = 1;
    // Same origin as well as destination is a stronger match (a route, not a place).
    if (h.from && trip.from && haversineMiles(h.from, trip.from) <= NEAR_MILES) w += 1;
    // Same weekday-type and time-of-day band: an 8am weekday drive to the office is a commute.
    if (sameSlot(h.startedAt, trip.startedAt, utcOffsetMin)) w += 0.5;
    votes[h.category] += w;
    matches++;
  }
  if (matches < minVotes) return null;
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  const [category, top] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  const confidence = Math.round((top / total) * 100) / 100;
  return {
    category,
    confidence,
    reason: `${matches} earlier drive${matches === 1 ? "" : "s"} to this place; ${Math.round(confidence * 100)}% were ${category}.`,
    auto: confidence >= 0.9 && matches >= 3, // safe to pre-select; still shown for review
  };
}

function slot(t, off) {
  const d = new Date(t + off * 60e3);
  const dow = d.getUTCDay();
  return { weekend: dow === 0 || dow === 6, band: Math.floor(d.getUTCHours() / 3) };
}
function sameSlot(a, b, off) {
  const x = slot(a, off), y = slot(b, off);
  return x.weekend === y.weekend && x.band === y.band;
}

// Converts a detected drive plus the user's category into a trip record in the
// web app's format (calc.mjs normalizeTrip), so exports and the audit check are shared.
export function toLogTrip(drive, category, { utcOffsetMin = 0, purpose = "", to = "", from = "", client = "" } = {}) {
  const date = new Date(drive.startedAt + utcOffsetMin * 60e3).toISOString().slice(0, 10);
  return {
    date, category, from, to, purpose, client,
    odoStart: "", odoEnd: "", miles: drive.miles, tolls: 0, parking: 0,
    enteredAt: new Date(drive.endedAt).toISOString(), // logged at the drive, which the audit check rewards
    gps: true,
  };
}
