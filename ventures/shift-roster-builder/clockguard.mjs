// Who is punching, and from where (2026-11-16). The time clock in timeclock.mjs was an honour system: anyone with the
// team link could clock in for anyone, from anywhere. This adds two optional checks, both off until the manager turns
// them on, and both runnable on the Node server and the Cloudflare Worker alike (Web Crypto, no Node built-ins):
//
// - Clock PINs. The manager sets a 4-8 digit PIN per person on /admin/timesheet and tells them. A person with a PIN
//   must type it to punch; with CLOCK_PIN=required, a person without one cannot punch from the team page at all.
//   PINs are stored salted and hashed (PBKDF2-SHA256, 10,000 rounds), never in the clear. Five wrong PINs for one person
//   in 15 minutes lock that person's punches for 15 minutes, so the team link cannot be used to try all 10,000
//   four-digit PINs. A PIN stops a colleague punching for an absent friend; it is not a password to anything else.
//
// - A site geofence. CLOCK_GEOFENCE="lat,lon,radius_m" asks the phone for its location when someone presses Clock in
//   or Clock out, and the server works out how far that is from the site. Only the distance (whole metres) and the
//   phone's stated accuracy are kept with the punch, never the coordinates. CLOCK_GEOFENCE_MODE=flag (default) records
//   every punch and flags the far ones and the ones sent with no location on the timesheet; =block refuses them.
//   A phone's location can be faked by someone determined; this catches the casual "clocked in from the bus" case and
//   leaves the manager the decision. Staff must be told their location is checked when they punch.

const enc = new TextEncoder();
const subtle = () => globalThis.crypto && globalThis.crypto.subtle;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const PIN_ROUNDS = 10000;
export const PIN_FAILS = 5, PIN_LOCK_MS = 15 * 60000;

export function validPin(pin) { return /^\d{4,8}$/.test(String(pin ?? "")); }

// PBKDF2-SHA256: one native Web Crypto call, so it fits a Worker's CPU budget. A 4-digit PIN cannot be made strong by
// hashing (there are only 10,000); the hash keeps PINs out of the state file in the clear, and the lockout below is
// what stops guessing through the team link.
async function digest(salt, pin, rounds) {
  const key = await subtle().importKey("raw", enc.encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  return hex(await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: rounds }, key, 256));
}

export function randomSalt() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return hex(b);
}

// Set (or with an empty pin, clear) a person's PIN. state.pins: name -> { salt, hash, rounds, set }.
export async function setPin(state, person, pin, nowMs) {
  const name = String(person || "");
  if (!name) return { error: "Pick a person." };
  state.pins = state.pins || {};
  if (pin === "" || pin == null) { const had = Object.hasOwn(state.pins, name); delete state.pins[name]; return { ok: true, cleared: had }; }
  if (!validPin(pin)) return { error: "A PIN is 4 to 8 digits." };
  const salt = randomSalt();
  state.pins[name] = { salt, hash: await digest(salt, String(pin), PIN_ROUNDS), rounds: PIN_ROUNDS, set: nowMs };
  if (state.pinFails) delete state.pinFails[name];
  return { ok: true };
}

export const hasPin = (state, person) => !!(state.pins && Object.hasOwn(state.pins, String(person)));

// Check a typed PIN for a punch. Returns { ok } or { error, locked? }. `required` refuses people with no PIN.
export async function checkPin(state, person, pin, nowMs, { required = false } = {}) {
  const name = String(person || "");
  const rec = state.pins && Object.hasOwn(state.pins, name) ? state.pins[name] : null;
  if (!rec) return required ? { error: `${name} has no clock PIN yet. Ask your manager to set one.` } : { ok: true, none: true };
  state.pinFails = state.pinFails || {};
  const recent = (state.pinFails[name] || []).filter((t) => nowMs - t < PIN_LOCK_MS);
  if (recent.length >= PIN_FAILS) {
    const mins = Math.ceil((PIN_LOCK_MS - (nowMs - Math.min(...recent.slice(-PIN_FAILS)))) / 60000);
    return { error: `Too many wrong PINs for ${name}. Try again in ${mins} min or ask your manager.`, locked: true };
  }
  const got = await digest(rec.salt, String(pin ?? ""), rec.rounds || PIN_ROUNDS);
  let d = got.length ^ rec.hash.length;
  for (let i = 0; i < Math.min(got.length, rec.hash.length); i++) d |= got.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  if (d === 0) { delete state.pinFails[name]; return { ok: true }; }
  state.pinFails[name] = [...recent, nowMs].slice(-PIN_FAILS);
  const left = PIN_FAILS - state.pinFails[name].length;
  return { error: left > 0 ? `Wrong PIN for ${name}.` : `Wrong PIN for ${name}. Punches for ${name} are locked for 15 min.`, locked: left <= 0 };
}

// Great-circle distance in metres (haversine, mean Earth radius 6,371,008.8 m).
export function distanceM(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, R = 6371008.8;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// CLOCK_GEOFENCE="lat,lon,radius_m" (radius 25 m to 5 km), CLOCK_GEOFENCE_MODE=flag|block. Null when unset or unreadable.
export function readGeofence(env) {
  const raw = String(env.CLOCK_GEOFENCE || "").trim();
  if (!raw) return null;
  const [lat, lon, rad] = raw.split(",").map((x) => Number(x.trim()));
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180) || !(rad >= 25 && rad <= 5000)) return { error: "CLOCK_GEOFENCE should be lat,lon,radius_m with a radius from 25 to 5000 m; the geofence is off." };
  return { lat, lon, radius: rad, mode: String(env.CLOCK_GEOFENCE_MODE || "flag").toLowerCase() === "block" ? "block" : "flag" };
}

// The phone's reading, as posted by the team page (lat, lon, acc in metres), checked against the fence.
// The phone's own accuracy is allowed for, up to 100 m: a reading of 180 m +- 90 m on a 100 m fence passes,
// one of 400 m +- 300 m does not. Returns what is stored with the punch: { m, acc, away } or { none: true, why }.
export function placeOf(fence, form) {
  const lat = Number(form.get("lat")), lon = Number(form.get("lon")), acc = Number(form.get("acc"));
  if (form.get("lat") == null || form.get("lat") === "" || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
    const why = String(form.get("geoerr") || "").slice(0, 60).replace(/[^\w .,-]/g, "");
    return { none: true, why: why || "no location sent" };
  }
  const m = Math.round(distanceM(fence.lat, fence.lon, lat, lon));
  const a = Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null;
  const slack = Math.min(100, a ?? 0);
  return { m, acc: a, away: m - slack > fence.radius };
}

// The timesheet text for a punch's place: "" when inside the fence or no fence was on.
export function placeFlag(p, label) {
  const w = p && p.where;
  if (!w) return "";
  if (w.none) return `${label} with no location (${w.why || "not sent"})`;
  if (w.away) return `${label} ${w.m >= 1000 ? (w.m / 1000).toFixed(1) + " km" : w.m + " m"} from site${w.acc != null ? ` (phone accuracy ${w.acc} m)` : ""}`;
  return "";
}

// The script the team page runs when a clock button is pressed: fill lat/lon/acc from the phone, then submit.
// It waits up to 10 s; a refusal or timeout still submits, with the reason, so the server can flag or refuse it.
export const GEO_SCRIPT = `<script>document.querySelectorAll("form[data-geo]").forEach(function(f){var go=false;f.addEventListener("submit",function(e){if(go)return;e.preventDefault();var b=e.submitter,k=f.querySelector("input[name=kind]");if(b&&k)k.value=b.value;var s=function(){go=true;f.submit()};var n=f.querySelector("[data-geo-note]");if(n)n.textContent="Getting your location...";if(!navigator.geolocation){f.geoerr.value="no location on this phone";return s()}navigator.geolocation.getCurrentPosition(function(p){f.lat.value=p.coords.latitude;f.lon.value=p.coords.longitude;f.acc.value=Math.round(p.coords.accuracy);s()},function(x){f.geoerr.value=x&&x.code===1?"location refused":"location unavailable";s()},{enableHighAccuracy:true,timeout:10000,maximumAge:60000})})})</script>`;
