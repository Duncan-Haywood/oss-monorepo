import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  CITIES,
  DEFAULT_CITY_IDS,
  cityById,
  cityClock,
  daylightMinutes,
  formatDuration,
  formatEventTime,
  formatOffsetDelta,
  formatUtcOffset,
  parseCityIds,
  reachability,
  serializeCityIds,
  solarEvent,
  utcOffsetMinutes,
  zonedParts,
} from "./solar.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// Midday UTC on the given date. Matches the Swift tests' `utcDate` helper, so
// the reference values below are the same ones the Swift suite pins.
const utcDate = (year, month, day, hour = 12) =>
  new Date(Date.UTC(year, month - 1, day, hour));

const london = cityById("london");
const tokyo = cityById("tokyo");
const losAngeles = cityById("los-angeles");
const sydney = cityById("sydney");

// ---------------------------------------------------------------------------
// The ported algorithm, against the Swift suite's own reference values
// ---------------------------------------------------------------------------

test("sunrise precedes sunset for a temperate city", () => {
  const date = utcDate(2026, 6, 21);
  assert.ok(solarEvent("sunrise", london, date) < solarEvent("sunset", london, date));
});

test("a northern-hemisphere summer day is longer than its winter day", () => {
  assert.ok(
    daylightMinutes(london, utcDate(2026, 6, 21)) >
      daylightMinutes(london, utcDate(2026, 12, 21)),
  );
});

test("southern-hemisphere seasons are inverted", () => {
  // Winter in Sydney in June, summer in December — the opposite of London.
  assert.ok(
    daylightMinutes(sydney, utcDate(2026, 6, 21)) <
      daylightMinutes(sydney, utcDate(2026, 12, 21)),
  );
});

test("London's summer-solstice sunrise and sunset match the published times", () => {
  // Widely-cited reference: London's longest day (~21 June) has sunrise around
  // 04:43 BST (03:43 UTC) and sunset around 21:21 BST (20:21 UTC). The Almanac
  // algorithm is good to about a minute, so the tolerance here absorbs both its
  // approximation and the reference's own rounding.
  const date = utcDate(2026, 6, 21);
  const sunrise = solarEvent("sunrise", london, date);
  const sunset = solarEvent("sunset", london, date);

  const expectedSunrise = Date.UTC(2026, 5, 21, 3, 43);
  const expectedSunset = Date.UTC(2026, 5, 21, 20, 21);

  assert.ok(Math.abs(sunrise.getTime() - expectedSunrise) <= 20 * 60 * 1000);
  assert.ok(Math.abs(sunset.getTime() - expectedSunset) <= 20 * 60 * 1000);
});

test("sunrise lands on the requested local day far east of Greenwich", () => {
  // Tokyo's civil +09:00 diverges from its raw longitude/15 (~+9.31h) enough
  // that, without the day-anchoring nudge, the computed sunrise fell on 22 June
  // JST when 21 June was asked for.
  const sunrise = solarEvent("sunrise", tokyo, utcDate(2026, 6, 21));
  const p = zonedParts(sunrise, tokyo.timeZone);
  assert.deepEqual([p.year, p.month, p.day], [2026, 6, 21]);
});

test("sunset lands on the requested local day far west of Greenwich", () => {
  // Los Angeles at -07:00 civil vs ~-7.88h solar: sunset came back dated
  // 20 June PDT when 21 June was asked for.
  const sunset = solarEvent("sunset", losAngeles, utcDate(2026, 6, 21));
  const p = zonedParts(sunset, losAngeles.timeZone);
  assert.deepEqual([p.year, p.month, p.day], [2026, 6, 21]);
});

test("every catalogue city has a sunrise before its sunset at the equinox", () => {
  // The equinox is safe for every latitude in this catalogue, so this exercises
  // the day-anchoring fix rather than the algorithm's separate and documented
  // imprecision for very long days near the Arctic Circle (Reykjavík).
  const date = utcDate(2026, 3, 20);
  for (const city of CITIES) {
    const sunrise = solarEvent("sunrise", city, date);
    const sunset = solarEvent("sunset", city, date);
    assert.ok(sunrise, `${city.name} should have a sunrise near the equinox`);
    assert.ok(sunset, `${city.name} should have a sunset near the equinox`);
    assert.ok(sunrise < sunset, `${city.name}: sunrise should precede sunset`);
  }
});

test("polar night returns null rather than throwing", () => {
  // Not in the shipped catalogue, but the math must degrade gracefully: north
  // of the Arctic Circle in December the sun never rises.
  const polar = {
    id: "test-polar",
    name: "Test Polar Station",
    country: "Test",
    timeZone: "UTC",
    latitude: 78,
    longitude: 15,
  };
  const midwinter = utcDate(2026, 12, 21);
  assert.equal(solarEvent("sunrise", polar, midwinter), null);
  assert.equal(solarEvent("sunset", polar, midwinter), null);
  assert.equal(daylightMinutes(polar, midwinter), null);
});

// ---------------------------------------------------------------------------
// The catalogue itself
// ---------------------------------------------------------------------------

test("the JS catalogue matches the Swift one it was ported from", () => {
  // The two catalogues are separate files by necessity — one ships in an iOS
  // binary, the other to a browser — so nothing but a test can keep them in
  // step. Reading the Swift source rather than restating its contents is the
  // same import-don't-restate rule CLAUDE.md records against the front-door
  // mirror: a copied list cannot notice that its original moved.
  const swift = readFileSync(
    resolve(here, "../Sources/WorldClockCore/CityCatalog.swift"),
    "utf8",
  );
  const swiftIds = [...swift.matchAll(/City\(id:\s*"([^"]+)"/g)].map((m) => m[1]);

  assert.ok(swiftIds.length > 0, "failed to parse any city id out of CityCatalog.swift");
  assert.deepEqual(
    [...CITIES.map((c) => c.id)].sort(),
    [...swiftIds].sort(),
    "the browser catalogue and the Swift catalogue name different cities",
  );
});

test("city ids are unique", () => {
  assert.equal(new Set(CITIES.map((c) => c.id)).size, CITIES.length);
});

test("every city carries a time zone the runtime actually knows", () => {
  for (const city of CITIES) {
    assert.doesNotThrow(
      () => new Intl.DateTimeFormat("en-US", { timeZone: city.timeZone }),
      `${city.name} has an unknown time zone: ${city.timeZone}`,
    );
  }
});

test("every city has plausible coordinates", () => {
  for (const city of CITIES) {
    assert.ok(city.latitude >= -90 && city.latitude <= 90, `${city.name} latitude`);
    assert.ok(city.longitude >= -180 && city.longitude <= 180, `${city.name} longitude`);
  }
});

test("every default city id resolves", () => {
  for (const id of DEFAULT_CITY_IDS) {
    assert.ok(cityById(id), `default city ${id} is not in the catalogue`);
  }
  assert.equal(new Set(DEFAULT_CITY_IDS).size, DEFAULT_CITY_IDS.length);
});

// ---------------------------------------------------------------------------
// Time-zone primitives
// ---------------------------------------------------------------------------

test("utcOffsetMinutes reports known civil offsets", () => {
  // Mid-January and mid-July, so each zone is read on both sides of its own
  // DST transition where it has one.
  const january = new Date(Date.UTC(2026, 0, 15, 12));
  const july = new Date(Date.UTC(2026, 6, 15, 12));

  assert.equal(utcOffsetMinutes(january, "UTC"), 0);
  assert.equal(utcOffsetMinutes(january, "Asia/Tokyo"), 9 * 60); // no DST
  assert.equal(utcOffsetMinutes(july, "Asia/Tokyo"), 9 * 60);
  assert.equal(utcOffsetMinutes(january, "Asia/Kolkata"), 5 * 60 + 30); // half-hour zone
  assert.equal(utcOffsetMinutes(january, "Europe/London"), 0); // GMT
  assert.equal(utcOffsetMinutes(july, "Europe/London"), 60); // BST
  assert.equal(utcOffsetMinutes(january, "America/New_York"), -5 * 60); // EST
  assert.equal(utcOffsetMinutes(july, "America/New_York"), -4 * 60); // EDT
});

test("zonedParts reads the wall clock in the target zone", () => {
  // 2026-06-21T00:30:00Z is still 20 June in New York and already 21 June,
  // mid-morning, in Tokyo.
  const instant = new Date(Date.UTC(2026, 5, 21, 0, 30));

  const ny = zonedParts(instant, "America/New_York");
  assert.deepEqual([ny.year, ny.month, ny.day, ny.hour, ny.minute], [2026, 6, 20, 20, 30]);

  const tk = zonedParts(instant, "Asia/Tokyo");
  assert.deepEqual([tk.year, tk.month, tk.day, tk.hour, tk.minute], [2026, 6, 21, 9, 30]);
});

test("zonedParts uses a 24-hour clock, including midnight", () => {
  // hourCycle h23 rather than h24: the difference shows only at midnight, where
  // h24 reports hour 24 and would render as "24:15".
  const p = zonedParts(new Date(Date.UTC(2026, 5, 21, 0, 15)), "UTC");
  assert.equal(p.hour, 0);
});

// ---------------------------------------------------------------------------
// Reachability bands
// ---------------------------------------------------------------------------

test("reachability classifies the civil bands", () => {
  assert.equal(reachability(3).id, "asleep");
  assert.equal(reachability(8).id, "early");
  assert.equal(reachability(9).id, "working");
  assert.equal(reachability(16).id, "working");
  assert.equal(reachability(17).id, "evening");
  assert.equal(reachability(23).id, "asleep-late");
});

test("reachability bands tile the whole day with no gap", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    assert.ok(reachability(hour), `hour ${hour} has no band`);
  }
  // Both ends of the day read as asleep, under different band ids.
  assert.equal(reachability(0).label, "Asleep");
  assert.equal(reachability(23).label, "Asleep");
});

// ---------------------------------------------------------------------------
// cityClock, the shape the table renders
// ---------------------------------------------------------------------------

test("cityClock reports daylight at local noon and darkness at local midnight", () => {
  // 2026-06-21T03:00:00Z is midday in Tokyo (UTC+9) and the small hours in
  // London, so one city must read as daylight and the other as night on the
  // same instant.
  const instant = new Date(Date.UTC(2026, 5, 21, 3));
  assert.equal(cityClock(tokyo, instant).daylight, true);
  assert.equal(cityClock(london, instant).daylight, false);
});

test("cityClock carries the offset, the band and a daylight length", () => {
  const instant = new Date(Date.UTC(2026, 5, 21, 3));
  const clock = cityClock(tokyo, instant);
  assert.equal(clock.offsetMinutes, 9 * 60);
  assert.equal(clock.parts.hour, 12);
  assert.equal(clock.band.id, "working");
  assert.ok(clock.daylightMinutes > 0 && clock.daylightMinutes < 24 * 60);
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

test("formatDuration renders hours and zero-padded minutes", () => {
  assert.equal(formatDuration(0), "0h 00m");
  assert.equal(formatDuration(65), "1h 05m");
  assert.equal(formatDuration(16 * 60 + 38), "16h 38m");
  assert.equal(formatDuration(null), "—");
});

test("formatOffsetDelta signs the difference and names the zero case", () => {
  assert.equal(formatOffsetDelta(0), "same time");
  assert.equal(formatOffsetDelta(9 * 60), "+9h");
  assert.equal(formatOffsetDelta(-5 * 60), "-5h");
  assert.equal(formatOffsetDelta(5 * 60 + 30), "+5h30m");
  assert.equal(formatOffsetDelta(-(3 * 60 + 45)), "-3h45m");
});

test("formatUtcOffset zero-pads both halves and keeps the sign", () => {
  assert.equal(formatUtcOffset(0), "UTC+00:00");
  assert.equal(formatUtcOffset(9 * 60), "UTC+09:00");
  assert.equal(formatUtcOffset(-(5 * 60)), "UTC-05:00");
  assert.equal(formatUtcOffset(5 * 60 + 30), "UTC+05:30");
  assert.equal(formatUtcOffset(-(3 * 60 + 30)), "UTC-03:30");
});

test("formatEventTime renders in the city's own zone and handles no-event", () => {
  const sunrise = solarEvent("sunrise", tokyo, utcDate(2026, 6, 21));
  assert.match(formatEventTime(sunrise, tokyo.timeZone), /^\d{2}:\d{2}$/);
  assert.equal(formatEventTime(null, tokyo.timeZone), "—");
});

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

test("parseCityIds keeps known ids in order and drops the rest", () => {
  assert.deepEqual(parseCityIds("tokyo,london"), ["tokyo", "london"]);
  assert.deepEqual(parseCityIds("london,tokyo"), ["london", "tokyo"]);
  assert.deepEqual(parseCityIds("tokyo,atlantis,london"), ["tokyo", "london"]);
  assert.deepEqual(parseCityIds(" TOKYO , london "), ["tokyo", "london"]);
});

test("parseCityIds de-duplicates and tolerates empty input", () => {
  assert.deepEqual(parseCityIds("tokyo,tokyo,london"), ["tokyo", "london"]);
  assert.deepEqual(parseCityIds(""), []);
  assert.deepEqual(parseCityIds(null), []);
  assert.deepEqual(parseCityIds(undefined), []);
});

test("a serialized selection round-trips", () => {
  const ids = ["tokyo", "london", "sao-paulo"];
  assert.deepEqual(parseCityIds(serializeCityIds(ids)), ids);
});

test("a share link naming only unknown cities yields an empty selection", () => {
  // The page falls back to the defaults rather than rendering an empty table —
  // asserted in page.test.mjs; here we only pin that parsing says "nothing".
  assert.deepEqual(parseCityIds("atlantis,el-dorado"), []);
});
