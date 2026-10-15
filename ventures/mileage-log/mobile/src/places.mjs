// Named places: the fix for a log that says "40.01,-75.02 -> 40.05,-75.10".
// Name a place once ("Home", "Smith job site") and every later drive to or from
// it is labelled, and a business destination remembers its usual purpose and
// client, so the daily review becomes a confirmation instead of typing.
// Pure functions over plain data. Nothing leaves the device, and no reverse
// geocoding service is called (that would send coordinates to a third party).

import { haversineMiles } from "../../calc.mjs";
import { toLogTrip } from "./classify.mjs";

export const PLACE_RADIUS_MILES = 0.1; // ~160 m: same place as classify.mjs

// places: [{ id, name, lat, lon, purpose?, client?, category? }]
export function placeAt(places, point, radius = PLACE_RADIUS_MILES) {
  if (!point) return null;
  let best = null, bestD = Infinity;
  for (const p of places) {
    const d = haversineMiles(p, point);
    if (d <= radius && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

// Adds a place, or renames the existing one when the point is already named.
export function addPlace(places, { name, lat, lon }) {
  const label = String(name || "").trim();
  if (!label) return places;
  const hit = placeAt(places, { lat, lon });
  if (hit) return places.map((p) => (p.id === hit.id ? { ...p, name: label } : p));
  return [...places, { id: "p" + Math.round(lat * 1e5) + "_" + Math.round(lon * 1e5), name: label, lat, lon }];
}

export function removePlace(places, id) {
  return places.filter((p) => p.id !== id);
}

// What the review card shows for a detected drive.
// drive: { from: {lat, lon}, to: {lat, lon}, ... }
export function describeDrive(places, drive) {
  const a = placeAt(places, drive.from), b = placeAt(places, drive.to);
  return {
    from: a ? a.name : "", to: b ? b.name : "",
    fromPlace: a, toPlace: b,
    // Unnamed ends the user may want to name; a trip with no destination name
    // is one of the gaps the audit check flags.
    unnamed: [!a && "from", !b && "to"].filter(Boolean),
    purpose: b?.purpose || "", client: b?.client || "",
  };
}

// Builds the log record for a classified drive, labelled with place names.
export function logTripFor(places, drive, category, { utcOffsetMin = 0, purpose = "", client = "" } = {}) {
  const d = describeDrive(places, drive);
  return toLogTrip(drive, category, {
    utcOffsetMin, from: d.from, to: d.to,
    purpose: purpose.trim() || d.purpose, client: client.trim() || d.client,
  });
}

// After a business drive is classified, its destination remembers the purpose
// and client, so the next drive there needs no typing. Other categories leave
// the memory alone (a drive to the office on a weekend is not a new purpose).
export function remember(places, drive, category, { purpose = "", client = "" } = {}) {
  const b = placeAt(places, drive.to);
  if (!b || category !== "business" || !purpose.trim()) return places;
  return places.map((p) => (p.id === b.id ? { ...p, purpose: purpose.trim(), client: client.trim() || p.client || "" } : p));
}

// Drives the user can confirm in one tap: the category model is sure (auto)
// and, for business, a purpose is known. Returns [{ drive, category, purpose, client }].
export function readyToConfirm(pending, suggestFor, places) {
  const out = [];
  for (const drive of pending) {
    const s = suggestFor(drive);
    if (!s || !s.auto) continue;
    const d = describeDrive(places, drive);
    if (!d.to) continue; // an unnamed destination still needs the user
    if (s.category === "business" && !d.purpose) continue;
    out.push({ drive, category: s.category, purpose: d.purpose, client: d.client });
  }
  return out;
}
