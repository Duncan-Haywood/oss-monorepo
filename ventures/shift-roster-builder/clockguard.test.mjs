import { test } from "node:test";
import assert from "node:assert/strict";
import { setPin, checkPin, hasPin, validPin, distanceM, readGeofence, placeOf, placeFlag, PIN_FAILS } from "./clockguard.mjs";
import { timesheet, timesheetCsv } from "./timeclock.mjs";
import { handler, emptyState } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

const at = (iso) => Date.parse(iso);
const sl = (day, s, e) => ({ day, startMin: s * 60, endMin: e * 60, label: "", role: "" });
const WEEK = { weekStart: "2026-11-16", people: [{ name: "Ana", hours: 8 }, { name: "Ben", hours: 8 }], assignments: [{ person: "Ana", slot: sl(0, 9, 17) }, { person: "Ben", slot: sl(0, 12, 20) }] };
// A site in Chicago's Loop; 0.001 degree of latitude is about 111 m.
const SITE = { lat: 41.8789, lon: -87.6359 };

test("PINs: stored hashed, checked, and locked after five wrong tries in 15 minutes", async () => {
  assert.ok(validPin("1234") && validPin("12345678"));
  assert.ok(!validPin("123") && !validPin("123456789") && !validPin("12a4") && !validPin(""));
  const s = {};
  assert.match((await setPin(s, "Ana", "12", 0)).error, /4 to 8 digits/);
  assert.ok((await setPin(s, "Ana", "4821", 0)).ok);
  assert.ok(hasPin(s, "Ana") && !hasPin(s, "Ben"));
  assert.doesNotMatch(JSON.stringify(s), /4821/); // never in the clear
  assert.equal(s.pins.Ana.hash.length, 64);
  // Two people with the same PIN get different hashes (salted).
  await setPin(s, "Ben", "4821", 0);
  assert.notEqual(s.pins.Ana.hash, s.pins.Ben.hash);
  await setPin(s, "Ben", "", 0);
  assert.ok(!hasPin(s, "Ben"));
  // No PIN: allowed unless required.
  assert.ok((await checkPin(s, "Ben", "", 0)).ok);
  assert.match((await checkPin(s, "Ben", "", 0, { required: true })).error, /no clock PIN/);
  assert.ok((await checkPin(s, "Ana", "4821", 0)).ok);
  const t0 = at("2026-11-16T09:00:00Z");
  for (let i = 1; i < PIN_FAILS; i++) { const r = await checkPin(s, "Ana", "0000", t0 + i * 1000); assert.match(r.error, /Wrong PIN/); assert.ok(!r.locked); }
  const fifth = await checkPin(s, "Ana", "0000", t0 + 5000);
  assert.ok(fifth.locked);
  // Locked: even the right PIN is refused, and the wrong ones do not extend the count past five.
  const locked = await checkPin(s, "Ana", "4821", t0 + 60000);
  assert.ok(locked.locked);
  assert.match(locked.error, /Try again in 15 min/);
  // Fifteen minutes after the first wrong try, one slot frees and the right PIN works and clears the count.
  assert.ok((await checkPin(s, "Ana", "4821", t0 + 15 * 60000 + 1500)).ok);
  assert.equal(s.pinFails.Ana, undefined);
  // Setting a new PIN clears a lock.
  for (let i = 0; i < PIN_FAILS; i++) await checkPin(s, "Ana", "0000", t0 + 20 * 60000);
  assert.ok((await checkPin(s, "Ana", "4821", t0 + 20 * 60000)).locked);
  await setPin(s, "Ana", "7777", t0);
  assert.ok((await checkPin(s, "Ana", "7777", t0 + 20 * 60000)).ok);
});

test("geofence: distance, accuracy allowance, and only the distance kept", () => {
  // London (Westminster) to Paris (Eiffel Tower): about 340 km.
  assert.ok(Math.abs(distanceM(51.5007, -0.1246, 48.8584, 2.2945) - 340500) < 1500);
  assert.equal(readGeofence({}), null);
  assert.match(readGeofence({ CLOCK_GEOFENCE: "41.8,-87.6,5" }).error, /25 to 5000/);
  assert.match(readGeofence({ CLOCK_GEOFENCE: "nonsense" }).error, /lat,lon,radius_m/);
  const f = readGeofence({ CLOCK_GEOFENCE: `${SITE.lat}, ${SITE.lon}, 100` });
  assert.deepEqual(f, { ...SITE, radius: 100, mode: "flag" });
  assert.equal(readGeofence({ CLOCK_GEOFENCE: "41.8,-87.6,100", CLOCK_GEOFENCE_MODE: "BLOCK" }).mode, "block");
  const fm = (o) => new URLSearchParams(o);
  // About 56 m north: inside.
  const near = placeOf(f, fm({ lat: SITE.lat + 0.0005, lon: SITE.lon, acc: 20 }));
  assert.equal(near.away, false);
  assert.ok(near.m > 50 && near.m < 60);
  assert.deepEqual(Object.keys(near).sort(), ["acc", "away", "m"]); // no coordinates
  // About 178 m, phone says +-90 m: given the benefit of the doubt.
  assert.equal(placeOf(f, fm({ lat: SITE.lat + 0.0016, lon: SITE.lon, acc: 90 })).away, false);
  // About 445 m, phone says +-300 m: the allowance is capped at 100 m, so it is away.
  const far = placeOf(f, fm({ lat: SITE.lat + 0.004, lon: SITE.lon, acc: 300 }));
  assert.equal(far.away, true);
  assert.match(placeFlag({ where: far }, "clock-in"), /^clock-in 44\d m from site \(phone accuracy 300 m\)$/);
  assert.match(placeFlag({ where: { m: 2400, acc: 10, away: true } }, "clock-out"), /2\.4 km from site/);
  const none = placeOf(f, fm({ geoerr: "location refused" }));
  assert.deepEqual(none, { none: true, why: "location refused" });
  assert.equal(placeFlag({ where: none }, "clock-in"), "clock-in with no location (location refused)");
  assert.equal(placeOf(f, fm({ geoerr: "<b>x</b>" })).why, "bxb"); // staff-sent text is stripped to plain words
  assert.equal(placeFlag({ where: near }, "clock-in"), "");
  assert.equal(placeFlag({}, "clock-in"), "");
});

test("timesheet and CSV carry the place flags", () => {
  const punches = [
    { id: 1, person: "Ana", kind: "in", at: at("2026-11-16T09:00:00Z"), by: "staff", where: { m: 850, acc: 15, away: true } },
    { id: 2, person: "Ana", kind: "out", at: at("2026-11-16T17:00:00Z"), by: "staff", where: { none: true, why: "location refused" } },
    { id: 3, person: "Ben", kind: "in", at: at("2026-11-16T12:00:00Z"), by: "staff", where: { m: 30, acc: 10, away: false } },
    { id: 4, person: "Ben", kind: "out", at: at("2026-11-16T20:00:00Z"), by: "staff" },
  ];
  const ts = timesheet(punches, WEEK, { tz: "UTC", nowMs: at("2026-11-22T00:00:00Z") });
  assert.deepEqual(ts.people.find((p) => p.name === "Ana").rows[0].flags, ["clock-in 850 m from site (phone accuracy 15 m)", "clock-out with no location (location refused)"]);
  assert.deepEqual(ts.people.find((p) => p.name === "Ben").rows[0].flags, []);
  assert.match(timesheetCsv(ts), /Ana,2026-11-16,09:00,17:00,8\.00,Mon 09:00-17:00,clock-in 850 m from site \(phone accuracy 15 m\); clock-out with no location/);
});

function hubWith(env, clockNow) {
  const state = emptyState();
  state.weekStart = "2026-11-16";
  state.published = { ...structuredClone(WEEK), at: "2026-11-15T12:00:00.000Z", unfilled: 0 };
  let saves = 0;
  const hub = handler(state, () => { saves++; }, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm", TIMEZONE: "UTC", ...env }, () => clockNow.t, null);
  const call = (path, init) => serve(hub, new Request("https://hub.example" + path, init));
  const post = (path, body) => call(path, { method: "POST", body: new URLSearchParams(body) });
  return { state, call, post, saves: () => saves };
}

test("the hub: the manager sets PINs, staff with a PIN must type it, and CLOCK_PIN=required covers everyone", async () => {
  const now = { t: at("2026-11-16T08:58:00Z") };
  const h = hubWith({}, now);
  let page = await (await h.call("/team?t=tm")).text();
  assert.doesNotMatch(page, /clock PIN/); // nobody has a PIN: the form is as before
  let sheet = await (await h.call("/admin/timesheet?key=adm")).text();
  assert.match(sheet, /Clock PINs/);
  assert.match(sheet, /Where punches come from<\/h2><p class="note">Off\./);
  const bad = await h.post("/admin/pin?key=adm", { name: "Ana", pin: "12", act: "set", week: "2026-11-16" });
  assert.match(decodeURIComponent(bad.headers.get("location")), /Not set: a PIN is 4 to 8 digits/);
  const set = await h.post("/admin/pin?key=adm", { name: "Ana", pin: "4821", act: "set", week: "2026-11-16" });
  assert.equal(set.status, 303);
  assert.match(decodeURIComponent(set.headers.get("location")), /PIN set for Ana/);
  assert.equal((await h.post("/admin/pin?key=nope", { name: "Ana", pin: "1111", act: "set" })).status, 401);
  sheet = await (await h.call("/admin/timesheet?key=adm")).text();
  assert.match(sheet, /<td>Ana<\/td><td>set<\/td>/);
  assert.doesNotMatch(sheet, /4821/);
  page = await (await h.call("/team?t=tm")).text();
  assert.match(page, /Your clock PIN \(if your manager gave you one\)<input type="password" name="pin"/);
  // Ana without and with a wrong PIN: refused, nothing recorded.
  assert.equal((await h.post("/team/punch?t=tm", { name: "Ana", kind: "in" })).status, 403);
  assert.equal((await h.post("/team/punch?t=tm", { name: "Ana", kind: "in", pin: "1111" })).status, 403);
  assert.equal(h.state.punches.length, 0);
  assert.equal((await h.post("/team/punch?t=tm", { name: "Ana", kind: "in", pin: "4821" })).status, 200);
  // Ben has no PIN and none is required.
  assert.equal((await h.post("/team/punch?t=tm", { name: "Ben", kind: "in" })).status, 200);
  assert.equal(h.state.punches.length, 2);
  // The right PIN cleared the count; five wrong tries lock Ana out, and the next answer is 429 even with the right PIN.
  for (let i = 0; i < 5; i++) await h.post("/team/punch?t=tm", { name: "Ana", kind: "out", pin: "0000" });
  const lockedRes = await h.post("/team/punch?t=tm", { name: "Ana", kind: "out", pin: "4821" });
  assert.equal(lockedRes.status, 429);
  assert.match(await lockedRes.text(), /Too many wrong PINs for Ana/);
  // Removing the PIN.
  const clr = await h.post("/admin/pin?key=adm", { name: "Ana", act: "clear", week: "2026-11-16" });
  assert.match(decodeURIComponent(clr.headers.get("location")), /Removed Ana's PIN/);
  assert.equal((await h.post("/team/punch?t=tm", { name: "Ana", kind: "out" })).status, 200);

  const r = hubWith({ CLOCK_PIN: "required" }, now);
  page = await (await r.call("/team?t=tm")).text();
  assert.match(page, /Your clock PIN<input type="password" name="pin"[^>]* required>/);
  const noPin = await r.post("/team/punch?t=tm", { name: "Ben", kind: "in" });
  assert.equal(noPin.status, 403);
  assert.match(await noPin.text(), /Ben has no clock PIN yet/);
  assert.match(await (await r.call("/admin/timesheet?key=adm")).text(), /<td>Ben<\/td><td><span class="err">none \(cannot punch\)<\/span>/);
});

test("the hub: the geofence flags or refuses far punches and keeps only the distance", async () => {
  const now = { t: at("2026-11-16T08:58:00Z") };
  const fence = `${SITE.lat},${SITE.lon},100`;
  const h = hubWith({ CLOCK_GEOFENCE: fence }, now);
  const page = await (await h.call("/team?t=tm")).text();
  assert.match(page, /<form method="post" action="\/team\/punch\?t=tm" data-geo><input type="hidden" name="kind" value="">/);
  assert.match(page, /only how far you are from the site is kept/);
  assert.match(page, /navigator\.geolocation\.getCurrentPosition/);
  // The JS path posts the hidden kind first ("in") and no button value.
  assert.equal((await h.post("/team/punch?t=tm", { kind: "in", name: "Ana", lat: String(SITE.lat + 0.008), lon: String(SITE.lon), acc: "12" })).status, 200);
  // A browser with scripts off posts the empty hidden kind and the button's value.
  const body = new URLSearchParams([["kind", ""], ["name", "Ben"], ["kind", "in"]]);
  assert.equal((await h.call("/team/punch?t=tm", { method: "POST", body })).status, 200);
  assert.equal(h.state.punches[0].where.away, true);
  assert.ok(h.state.punches[0].where.m > 880 && h.state.punches[0].where.m < 900);
  assert.equal(h.state.punches[0].lat, undefined);
  assert.doesNotMatch(JSON.stringify(h.state.punches), /41\.88|87\.63/); // no coordinates stored
  assert.deepEqual(h.state.punches[1].where, { none: true, why: "no location sent" });
  now.t = at("2026-11-16T17:00:00Z");
  await h.post("/team/punch?t=tm", { kind: "out", name: "Ana", lat: String(SITE.lat), lon: String(SITE.lon), acc: "8" });
  const sheet = await (await h.call("/admin/timesheet?key=adm")).text();
  assert.match(sheet, /clock-in 8\d\d m from site \(phone accuracy 12 m\)/);
  assert.match(sheet, /On: 100 m around 41\.8789, -87\.6359, far punches and punches with no location are flagged above/);
  const csv = await (await h.call("/admin/timesheet.csv?key=adm&week=2026-11-16")).text();
  assert.match(csv, /Ana,2026-11-16,08:58,17:00,8\.03,Mon 09:00-17:00,clock-in 8\d\d m from site \(phone accuracy 12 m\)\n/);

  const b = hubWith({ CLOCK_GEOFENCE: fence, CLOCK_GEOFENCE_MODE: "block" }, now);
  const far = await b.post("/team/punch?t=tm", { kind: "in", name: "Ana", lat: String(SITE.lat + 0.008), lon: String(SITE.lon), acc: "12" });
  assert.equal(far.status, 403);
  assert.match(await far.text(), /more than the 100 m allowed/);
  const off = await b.post("/team/punch?t=tm", { kind: "in", name: "Ana", geoerr: "location refused" });
  assert.equal(off.status, 403);
  assert.match(await off.text(), /none came through \(location refused\)/);
  assert.equal(b.state.punches.length, 0);
  assert.equal((await b.post("/team/punch?t=tm", { kind: "in", name: "Ana", lat: String(SITE.lat), lon: String(SITE.lon), acc: "8" })).status, 200);

  // A misconfigured fence is reported to the manager and left off, not half-applied.
  const m = hubWith({ CLOCK_GEOFENCE: "41.8,-87.6" }, now);
  assert.doesNotMatch(await (await m.call("/team?t=tm")).text(), /data-geo/);
  assert.match(await (await m.call("/admin/timesheet?key=adm")).text(), /CLOCK_GEOFENCE should be lat,lon,radius_m/);
  assert.equal((await m.post("/team/punch?t=tm", { kind: "in", name: "Ana" })).status, 200);
  assert.equal(m.state.punches[0].where, undefined);
});
