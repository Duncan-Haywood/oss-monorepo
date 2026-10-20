import test from "node:test";
import assert from "node:assert/strict";
import { placeAt, addPlace, removePlace, describeDrive, logTripFor, remember, readyToConfirm } from "./src/places.mjs";
import { normalizeTrip, validateTrip } from "../calc.mjs";

const HOME = { lat: 40, lon: -75 };
const SHOP = { lat: 40.05, lon: -75.05 };
const drive = (from, to, t = Date.UTC(2026, 6, 14, 13)) => ({ from, to, miles: 6.2, startedAt: t, endedAt: t + 900e3 });

test("a point within ~160 m matches the place, beyond it does not", () => {
  const ps = addPlace([], { name: "Home", ...HOME });
  assert.equal(placeAt(ps, { lat: 40.0005, lon: -75 }).name, "Home"); // ~55 m
  assert.equal(placeAt(ps, { lat: 40.003, lon: -75 }), null); // ~330 m
  assert.equal(placeAt(ps, null), null);
});

test("naming the same spot again renames instead of duplicating; blank names are ignored", () => {
  let ps = addPlace([], { name: "Home", ...HOME });
  ps = addPlace(ps, { name: "  Apartment ", lat: 40.0002, lon: -75 });
  assert.equal(ps.length, 1);
  assert.equal(ps[0].name, "Apartment");
  assert.equal(addPlace(ps, { name: "  ", lat: 1, lon: 1 }), ps);
  assert.deepEqual(removePlace(ps, ps[0].id), []);
});

test("describeDrive names known ends and lists the unnamed ones", () => {
  const ps = addPlace([], { name: "Home", ...HOME });
  const d = describeDrive(ps, drive(HOME, SHOP));
  assert.equal(d.from, "Home");
  assert.equal(d.to, "");
  assert.deepEqual(d.unnamed, ["to"]);
});

test("a business drive teaches its destination a purpose; the next drive there is pre-filled", () => {
  let ps = addPlace(addPlace([], { name: "Home", ...HOME }), { name: "Smith site", ...SHOP });
  ps = remember(ps, drive(HOME, SHOP), "business", { purpose: "Install visit", client: "Smith" });
  const d = describeDrive(ps, drive(HOME, SHOP));
  assert.equal(d.purpose, "Install visit");
  const log = logTripFor(ps, drive(HOME, SHOP), "business", { utcOffsetMin: 0 });
  assert.equal(log.to, "Smith site");
  assert.equal(log.from, "Home");
  assert.equal(log.purpose, "Install visit");
  assert.equal(log.client, "Smith");
});

test("only business drives with a purpose are remembered", () => {
  const ps = addPlace([], { name: "Smith site", ...SHOP });
  assert.equal(remember(ps, drive(HOME, SHOP), "personal", { purpose: "x" }), ps);
  assert.equal(remember(ps, drive(HOME, SHOP), "business", { purpose: " " }), ps);
});

test("typed purpose beats the remembered one, and a named log trip passes the web app's validation", () => {
  let ps = addPlace(addPlace([], { name: "Home", ...HOME }), { name: "Smith site", ...SHOP });
  ps = remember(ps, drive(HOME, SHOP), "business", { purpose: "Install visit" });
  const log = normalizeTrip(logTripFor(ps, drive(HOME, SHOP), "business", { purpose: "Warranty call" }));
  assert.equal(log.purpose, "Warranty call");
  assert.equal(validateTrip(log).ok, true);
});

test("without a named destination a business trip fails the web app's validation (the old mobile behaviour)", () => {
  const log = normalizeTrip(logTripFor([], drive(HOME, SHOP), "business", { purpose: "Install visit" }));
  assert.equal(validateTrip(log).ok, false);
});

test("readyToConfirm needs a sure model, a named destination and, for business, a known purpose", () => {
  let ps = addPlace([], { name: "Smith site", ...SHOP });
  const d1 = drive(HOME, SHOP);
  const sure = () => ({ category: "business", auto: true });
  assert.equal(readyToConfirm([d1], sure, ps).length, 0); // no purpose yet
  ps = remember(ps, d1, "business", { purpose: "Install visit" });
  const r = readyToConfirm([d1], sure, ps);
  assert.equal(r.length, 1);
  assert.equal(r[0].purpose, "Install visit");
  assert.equal(readyToConfirm([d1], () => ({ category: "business", auto: false }), ps).length, 0);
  assert.equal(readyToConfirm([drive(HOME, { lat: 41, lon: -75 })], sure, ps).length, 0); // unnamed destination
  assert.equal(readyToConfirm([d1], () => null, ps).length, 0);
});

test("a sure commute needs no purpose", () => {
  const ps = addPlace([], { name: "Office", ...SHOP });
  assert.equal(readyToConfirm([drive(HOME, SHOP)], () => ({ category: "commute", auto: true }), ps).length, 1);
});
