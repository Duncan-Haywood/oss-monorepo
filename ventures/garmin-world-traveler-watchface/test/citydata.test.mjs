// Differential test for source/CityData.mc.
//
// The watch face carries its own DST rules instead of a timezone database.
// This test RUNS the shipped Monkey C: test/monkeyc.mjs translates
// source/CityData.mc to JS with a small, strict set of rewrites (it refuses
// anything it cannot translate faithfully) and emulates the few Toybox calls
// the file makes. There is no hand-copied port of the rules any more, so an
// edit to isDstUs/isDstEu/isDstAu/isDstNz, nthSundayOfMonth, keyOf or the
// city table is what gets tested.
//
// The reference is not ours: Node's Intl (IANA tzdata) gives each city's real
// UTC offset, compared at every hour of 2025-2027 and every minute around each
// transition.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCityData } from './monkeyc.mjs';

const MC = loadCityData();
const CITIES = MC.CITIES;

const IANA = {
  'Pago Pago': 'Pacific/Pago_Pago', Honolulu: 'Pacific/Honolulu',
  Papeete: 'Pacific/Tahiti', Anchorage: 'America/Anchorage',
  'Los Angeles': 'America/Los_Angeles', 'Las Vegas': 'America/Los_Angeles',
  Denver: 'America/Denver', 'Mexico City': 'America/Mexico_City',
  Chicago: 'America/Chicago', 'New York': 'America/New_York',
  Toronto: 'America/Toronto', Caracas: 'America/Caracas',
  'Sao Paulo': 'America/Sao_Paulo', 'Rio de Janeiro': 'America/Sao_Paulo',
  'Fernando de Noronha': 'America/Noronha', Praia: 'Atlantic/Cape_Verde',
  Azores: 'Atlantic/Azores', London: 'Europe/London',
  Reykjavik: 'Atlantic/Reykjavik', Paris: 'Europe/Paris', Lagos: 'Africa/Lagos',
  Johannesburg: 'Africa/Johannesburg', Athens: 'Europe/Athens', Moscow: 'Europe/Moscow',
  Istanbul: 'Europe/Istanbul', Dubai: 'Asia/Dubai', Karachi: 'Asia/Karachi',
  Delhi: 'Asia/Kolkata', Mumbai: 'Asia/Kolkata', Dhaka: 'Asia/Dhaka',
  Bangkok: 'Asia/Bangkok', Jakarta: 'Asia/Jakarta', Beijing: 'Asia/Shanghai',
  Singapore: 'Asia/Singapore', Tokyo: 'Asia/Tokyo', Seoul: 'Asia/Seoul',
  Sydney: 'Australia/Sydney', Melbourne: 'Australia/Melbourne',
  Honiara: 'Pacific/Guadalcanal', Noumea: 'Pacific/Noumea',
  Auckland: 'Pacific/Auckland', Fiji: 'Pacific/Fiji',
};

// --- reference offsets from the platform's tz database ----------------------
const fmts = new Map();
function realOffsetSeconds(zone, ms) {
  if (!fmts.has(zone)) fmts.set(zone, new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric',
    day: 'numeric', hour: 'numeric', minute: 'numeric' }));
  const p = Object.fromEntries(fmts.get(zone).formatToParts(ms).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 1000);
}

const fmtOff = (s) => `UTC${s >= 0 ? '+' : ''}${s / 3600}`;

test('catalogue loads from CityData.mc as 42 cities with sane fields', () => {
  assert.equal(CITIES.length, 42);
  assert.equal(MC.size(), 42, 'size() of the shipped module');
  assert.equal(new Set(CITIES.map((c) => c.abbr)).size, 42, 'abbreviations are unique');
  for (const c of CITIES) {
    assert.ok(['none', 'us', 'eu', 'au', 'nz'].includes(c.dst), c.name);
    assert.ok(c.ring === 0 || c.ring === 1, c.name);
    assert.ok(Number.isInteger(c.offset), c.name);
    assert.ok(IANA[c.name], `${c.name} needs an IANA zone in this test`);
  }
});

test('same STANDARD-offset cities never share a label ring', () => {
  // Only standard offsets: DST shifts do create same-ring collisions, see the
  // label-collision test below and the README's "Known gaps".
  const seen = new Set();
  for (const c of CITIES) {
    const k = `${c.offset}/${c.ring}`;
    assert.ok(!seen.has(k), `${c.name} overlaps another city at offset ${c.offset} ring ${c.ring}`);
    seen.add(k);
  }
});

// Cities where the catalogue knowingly differs from the tz database.
// Keep this list EMPTY unless the README says why; a listed city is skipped.
const KNOWN_DIVERGENT = new Set(process.env.CITYDATA_KNOWN_DIVERGENT?.split(',') ?? []);

test('effective offset (shipped .mc) equals the IANA offset at every hour of 2025-2027', () => {
  const summary = new Map();
  for (const c of CITIES) {
    if (KNOWN_DIVERGENT.has(c.name)) continue;
    const zone = IANA[c.name];
    for (let ms = Date.UTC(2025, 0, 1); ms < Date.UTC(2028, 0, 1); ms += 3600e3) {
      const want = realOffsetSeconds(zone, ms);
      const got = MC.offsetAt(c, ms);
      if (want !== got) {
        const s = summary.get(c.name) ?? { hours: 0, first: new Date(ms).toISOString(), watch: got, real: want };
        s.hours++; summary.set(c.name, s);
      }
    }
  }
  const lines = [...summary].map(([n, s]) =>
    `${n}: ${s.hours} h wrong, first ${s.first} (watch ${fmtOff(s.watch)}, real ${fmtOff(s.real)})`);
  assert.deepEqual(lines, []);
});

test('every DST transition instant 2025-2027 matches IANA to the minute', () => {
  // Find each real transition hour, then check every minute of the two hours
  // around it, so an off-by-one-hour key (e.g. 01:00 vs 02:00) cannot hide.
  const bad = [];
  let transitions = 0;
  for (const c of CITIES.filter((x) => x.dst !== 'none')) {
    const zone = IANA[c.name];
    let prev = realOffsetSeconds(zone, Date.UTC(2025, 0, 1));
    for (let ms = Date.UTC(2025, 0, 1, 1); ms < Date.UTC(2028, 0, 1); ms += 3600e3) {
      const cur = realOffsetSeconds(zone, ms);
      if (cur !== prev) {
        transitions++;
        for (let t = ms - 2 * 3600e3; t < ms + 3600e3; t += 60e3) {
          const want = realOffsetSeconds(zone, t);
          const got = MC.offsetAt(c, t);
          if (want !== got) { bad.push(`${c.name} ${new Date(t).toISOString()}: watch ${fmtOff(got)}, real ${fmtOff(want)}`); break; }
        }
      }
      prev = cur;
    }
  }
  assert.ok(transitions >= 13 * 6, `expected two transitions a year per DST city, saw ${transitions}`);
  assert.deepEqual(bad, []);
});

test('localInfoAt() (shipped .mc) gives the IANA wall clock', () => {
  const ms = Date.UTC(2026, 6, 15, 13, 37);
  CITIES.forEach((c, i) => {
    const info = MC.localInfoAtMs(i, ms);
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: IANA[c.name], hourCycle: 'h23',
      day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(ms).map((x) => [x.type, +x.value]));
    assert.deepEqual([info.day, info.hour, info.min], [p.day, p.hour, p.minute], c.name);
  });
});

// --- label collisions ---------------------------------------------------------
// drawCityRing() puts each label at angle = its local hour on a 24 h circle,
// on radius ringAt(i). Two same-ring cities with equal offsets mod 24 h draw
// on top of each other; 30 min apart (7.5 degrees) they still overlap at the
// label size used. This recomputes, from the shipped table and rules, which
// same-ring pairs do that on how many days of 2026 (a day counts if they
// coincide at any whole UTC hour of it), and checks the README states exactly
// these numbers, so the "Known gaps" text cannot drift from the code.
function collisionDays(year) {
  const exact = new Map(); const near = new Map();
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 864e5;
  for (let d = 0; d < days; d++) {
    const ex = new Set(); const nr = new Set();
    for (let h = 0; h < 24; h++) {
      const ms = Date.UTC(year, 0, 1 + d, h);
      const off = CITIES.map((c) => MC.offsetAt(c, ms));
      for (let i = 0; i < CITIES.length; i++) {
        for (let j = i + 1; j < CITIES.length; j++) {
          if (CITIES[i].ring !== CITIES[j].ring) continue;
          let diff = Math.abs(off[i] - off[j]) % 86400;
          diff = Math.min(diff, 86400 - diff);
          const k = `${CITIES[i].abbr}/${CITIES[j].abbr}`;
          if (diff === 0) ex.add(k); else if (diff <= 1800) nr.add(k);
        }
      }
    }
    for (const k of ex) exact.set(k, (exact.get(k) ?? 0) + 1);
    for (const k of nr) near.set(k, (near.get(k) ?? 0) + 1);
  }
  return { exact, near };
}

test('README "Known gaps" states the computed 2026 label collisions exactly', () => {
  const { exact, near } = collisionDays(2026);
  const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');
  const gap = readme.split(/^## /m).find((s) => s.startsWith('Known gaps'));
  assert.ok(gap, 'README needs a "## Known gaps" section');
  const stated = (label) => {
    const line = gap.split('\n').find((l) => l.includes(label));
    assert.ok(line, `README Known gaps needs a "${label}" line`);
    return new Map([...line.matchAll(/([A-Z]{3}\/[A-Z]{3}) \((\d+)\)/g)].map(([, k, n]) => [k, +n]));
  };
  const sort = (m) => [...m].sort();
  assert.deepEqual(sort(stated('Same angle, same ring')), sort(exact));
  assert.deepEqual(sort(stated('30 minutes apart, same ring')), sort(near));
});
