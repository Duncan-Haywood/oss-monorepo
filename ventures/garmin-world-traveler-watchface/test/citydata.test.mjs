// Differential test for source/CityData.mc.
//
// The watch face carries its own DST rules instead of a timezone database.
// Nothing ever ran them, so this port checks them against the IANA data that
// Node ships (Intl): for every city in the Monkey C catalogue, the effective
// UTC offset must equal the real one at every sampled hour of the test years.
//
// The city table is PARSED from CityData.mc (not copied), so a new or edited
// city is tested too, and a city without an IANA zone below fails the suite.
// The rule functions are a line-for-line JS port of the .mc functions; if you
// change those, change them here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../source/CityData.mc', import.meta.url)), 'utf8');

// --- parse the catalogue ---------------------------------------------------
const CITIES = [...src.matchAll(
  /:name => "([^"]+)",\s*:abbr => "([A-Z]{3})",\s*:offset => ([^,]+?),\s*:dst => :(\w+),\s*:ring => (\d)/g,
)].map(([, name, abbr, off, dst, ring]) => ({
  name, abbr, dst, ring: Number(ring),
  // offsets are simple integer arithmetic such as `5 * 3600 + 1800`
  offset: Function(`"use strict"; return (${off});`)(),
}));

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

// --- port of the .mc rule functions (all UTC calendar math) -----------------
const info = (ms) => {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), min: d.getUTCMinutes() };
};
const dow = (year, month, day) => new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 1; // 1 = Sunday
const keyOf = (mo, d, h, mi) => ((mo * 100 + d) * 100 + h) * 100 + mi;
const nthSundayOfMonth = (y, m, n) => 1 + ((1 - dow(y, m, 1) + 7) % 7) + (n - 1) * 7;
const lastSundayOfMonth = (y, m, dim) => dim - ((dow(y, m, dim) - 1) % 7);
const keyNow = (i) => keyOf(i.month, i.day, i.hour, i.min);

const isDstUs = (s) => { const k = keyNow(s);
  return k >= keyOf(3, nthSundayOfMonth(s.year, 3, 2), 2, 0) && k < keyOf(11, nthSundayOfMonth(s.year, 11, 1), 1, 0); };
const isDstEu = (u) => { const k = keyNow(u);
  return k >= keyOf(3, lastSundayOfMonth(u.year, 3, 31), 1, 0) && k < keyOf(10, lastSundayOfMonth(u.year, 10, 31), 1, 0); };
const isDstAu = (s) => { const k = keyNow(s);
  return k >= keyOf(10, nthSundayOfMonth(s.year, 10, 1), 2, 0) || k < keyOf(4, nthSundayOfMonth(s.year, 4, 1), 2, 0); };
const isDstNz = (s) => { const k = keyNow(s);
  return k >= keyOf(9, lastSundayOfMonth(s.year, 9, 30), 2, 0) || k < keyOf(4, nthSundayOfMonth(s.year, 4, 1), 2, 0); };

function effectiveOffsetSeconds(city, nowMs) {
  const std = city.offset;
  if (city.dst === 'none') return std;
  if (city.dst === 'eu') return isDstEu(info(nowMs)) ? std + 3600 : std;
  const stdLocal = info(nowMs + std * 1000);
  const on = { us: isDstUs, au: isDstAu, nz: isDstNz }[city.dst](stdLocal);
  return on ? std + 3600 : std;
}

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

test('catalogue parses to 42 cities with sane fields', () => {
  assert.equal(CITIES.length, 42);
  assert.equal(new Set(CITIES.map((c) => c.abbr)).size, 42, 'abbreviations are unique');
  for (const c of CITIES) {
    assert.ok(['none', 'us', 'eu', 'au', 'nz'].includes(c.dst), c.name);
    assert.ok(c.ring === 0 || c.ring === 1, c.name);
    assert.ok(IANA[c.name], `${c.name} needs an IANA zone in this test`);
  }
});

test('same-offset cities never share a label ring', () => {
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

test('effective offset equals the IANA offset at every hour of 2025-2027', () => {
  const summary = new Map();
  for (const c of CITIES) {
    if (KNOWN_DIVERGENT.has(c.name)) continue;
    const zone = IANA[c.name];
    for (let ms = Date.UTC(2025, 0, 1); ms < Date.UTC(2028, 0, 1); ms += 3600e3) {
      const want = realOffsetSeconds(zone, ms);
      const got = effectiveOffsetSeconds(c, ms);
      if (want !== got) {
        const s = summary.get(c.name) ?? { hours: 0, first: new Date(ms).toISOString(), watch: got / 3600, real: want / 3600 };
        s.hours++; summary.set(c.name, s);
      }
    }
  }
  const lines = [...summary].map(([n, s]) =>
    `${n}: ${s.hours} h wrong, first ${s.first} (watch UTC${s.watch >= 0 ? '+' : ''}${s.watch}, real UTC${s.real >= 0 ? '+' : ''}${s.real})`);
  assert.deepEqual(lines, []);
});
