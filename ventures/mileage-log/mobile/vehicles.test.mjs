import test from "node:test";
import assert from "node:assert/strict";
import { addVehicle, knownVehicles, withVehicle, makeBackup, restoreBackup } from "./src/vehicles.mjs";
import { toLogTrip } from "./src/classify.mjs";
import { summarizeByVehicle, normalizeTrip } from "../calc.mjs";

const drive = { startedAt: Date.UTC(2026, 2, 3, 15), endedAt: Date.UTC(2026, 2, 3, 15, 20), miles: 12.4, from: { lat: 1, lon: 1 }, to: { lat: 2, lon: 2 } };
const trip = (id, vehicle, miles = 10) => normalizeTrip({ id, date: "2026-03-03", category: "business", miles, purpose: "x", to: "y", from: "z", vehicle });

test("vehicle names de-dupe case-insensitively and trim", () => {
  let l = addVehicle([], "  Ford  Transit ");
  assert.deepEqual(l, ["Ford Transit"]);
  assert.equal(addVehicle(l, "ford transit"), l);
  assert.equal(addVehicle(l, "   "), l);
});

test("known vehicles combine saved ones with those already on trips", () => {
  assert.deepEqual(knownVehicles(["Van"], [trip("a", "Truck"), trip("b", "van")]), ["Van", "Truck"]);
});

test("a drive logged with a vehicle is split per vehicle in the web summary", () => {
  const a = normalizeTrip(withVehicle(toLogTrip(drive, "business", { purpose: "p", to: "A", from: "B" }), "Van"));
  const b = normalizeTrip(withVehicle(toLogTrip(drive, "business", { purpose: "p", to: "A", from: "B" }), "Truck"));
  const rows = summarizeByVehicle([{ ...a, id: "1" }, { ...b, id: "2" }], { year: 2026 });
  assert.deepEqual(rows.map((r) => r.vehicle).sort(), ["Truck", "Van"]);
});

test("backup then restore on an empty phone brings back trips, places and vehicles", () => {
  const places = [{ id: "p1", name: "Home", lat: 40, lon: -75 }];
  const text = makeBackup({ trips: [trip("a", "Van"), trip("b", "Truck")], places, vehicles: ["Van", "Truck"] });
  const r = restoreBackup(text, { trips: [], places: [], vehicles: [] });
  assert.equal(r.error, null);
  assert.equal(r.trips.length, 2);
  assert.equal(r.added, 2);
  assert.deepEqual(r.places, places);
  assert.deepEqual(r.vehicles.sort(), ["Truck", "Van"]);
});

test("restore never drops what is on the phone and does not duplicate", () => {
  const text = makeBackup({ trips: [trip("a", "Van")], places: [{ id: "p1", name: "Home", lat: 1, lon: 2 }], vehicles: ["Van"] });
  const have = { trips: [trip("a", "Van"), trip("local", "")], places: [{ id: "p9", name: "Shop", lat: 3, lon: 4 }], vehicles: ["Bike"] };
  const r = restoreBackup(text, have);
  assert.equal(r.trips.length, 2);
  assert.equal(r.added, 0);
  assert.deepEqual(r.places.map((p) => p.id).sort(), ["p1", "p9"]);
  assert.deepEqual(r.vehicles.sort(), ["Bike", "Van"]);
});

test("restore rejects junk without changing anything, and ignores malformed places", () => {
  const have = { trips: [trip("a", "")], places: [], vehicles: [] };
  assert.match(restoreBackup("not json", have).error, /not valid JSON/);
  const text = JSON.stringify({ trips: [], settings: { places: [{ id: "x", name: "Bad", lat: "NaN", lon: 1 }, null] } });
  assert.deepEqual(restoreBackup(text, have).places, []);
});

test("restore reads the web app's own export (no phone settings)", () => {
  const web = JSON.stringify({ app: "mileage-log", version: 1, trips: [{ date: "2026-01-05", category: "business", miles: 5, purpose: "p", to: "t", from: "f" }] });
  const r = restoreBackup(web, { trips: [], places: [], vehicles: [] });
  assert.equal(r.trips.length, 1);
});
