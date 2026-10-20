// Vehicles and backup, as pure functions (no platform imports).
//
// The standard mileage rate is claimed per vehicle and Schedule C Part IV asks
// for miles per vehicle, so every drive carries the vehicle it was made in.
// Trips live only on the phone, so a lost phone would lose the log the audit
// check relies on: the backup is the web app's own JSON export (calc.mjs
// exportJson) with the phone-only parts (places, vehicles) in `settings`.

import { exportJson, importJson, vehicleNames } from "../../calc.mjs";

export const cleanName = (s) => String(s || "").trim().replace(/\s+/g, " ").slice(0, 40);

// Adds a vehicle name to the list (case-insensitive de-dupe, keeps the first spelling).
export function addVehicle(list, name) {
  const n = cleanName(name);
  if (!n || list.some((v) => v.toLowerCase() === n.toLowerCase())) return list;
  return [...list, n];
}

// Vehicles known from the saved list plus any already on logged trips.
export function knownVehicles(saved, trips) {
  return vehicleNames(trips).reduce(addVehicle, saved.reduce(addVehicle, []));
}

// Stamps the chosen vehicle onto a log record built by places.logTripFor.
export const withVehicle = (log, vehicle) => ({ ...log, vehicle: cleanName(vehicle) });

// Backup text: web-app-compatible JSON plus the phone's places and vehicles.
export function makeBackup({ trips, places = [], vehicles = [], activeVehicle = "" }, now = new Date()) {
  const text = exportJson(trips, { places, vehicles, activeVehicle, source: "mileage-log-mobile" });
  return text.replace(/"exportedAt": "[^"]*"/, `"exportedAt": "${now.toISOString()}"`);
}

// Merges a backup (or a web-app export) into what is on the phone. Never drops
// anything already there: trips merge by id, places by id, vehicles by name.
export function restoreBackup(text, { trips, places = [], vehicles = [] }) {
  const r = importJson(text, trips);
  if (r.error) return { error: r.error, trips, places, vehicles, added: 0 };
  const s = r.settings || {};
  const have = new Set(places.map((p) => p.id));
  const mergedPlaces = [...places, ...(Array.isArray(s.places) ? s.places : []).filter((p) => p && p.id && !have.has(p.id) && Number.isFinite(p.lat) && Number.isFinite(p.lon))];
  const mergedVehicles = knownVehicles(
    (Array.isArray(s.vehicles) ? s.vehicles : []).reduce(addVehicle, vehicles),
    r.trips,
  );
  return { error: null, trips: r.trips, places: mergedPlaces, vehicles: mergedVehicles, added: r.added };
}
