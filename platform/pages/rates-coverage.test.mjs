// Does every page that *could* carry the shop rates have a decision recorded?
//
// WHY THIS EXISTS, AND WHY IT IS A SECOND FILE
//
// `rates.test.mjs` already guards this feature, thoroughly, and it still let
// eight live products sit outside it for the whole life of the catalogue. Its
// coverage test selects the population like this:
//
//     .filter((entry) => entry.isDirectory() && entry.name.endsWith('-bid-calculator'))
//
// That is a set defined by a *slug suffix*, and the quantities this feature
// carries — a crew wage, a payroll burden, overhead on direct cost, a target
// margin — are not the property of a naming convention. Measured 2026-09-11,
// nineteen ventures carried two or more of the four and were not in that set:
// `change-order-margin-calculator` asked for all four (its overhead label is
// *verbatim* the label in the field spec) and received nothing;
// `bounce-house-rental-calculator` was two canonical ids and one missing map
// entry away from working. A contractor who had just computed their real burden
// and overhead in `shop-rate-calculator` retyped them on every one of those
// pages, which is the single defect that venture exists to remove.
//
// Nothing was red. There was no question being asked. That is the exact shape
// `CLAUDE.md` records three times over — the checklist that names test
// directories literally instead of discovering them, the front-door mirror that
// restated `build.mjs`'s entry-point rule instead of importing it — and the
// lesson each time is the same: enumerate the ground, because an absence is
// never discovered by noticing it.
//
// So this file selects the population by *what a page contains* and asserts only
// that each member has been sorted into one of four buckets:
//
//   1. it takes the bar (all four canonical ids, or aliased and partial);
//   2. it is the rate *source* (`RATE_SOURCE_SLUGS`);
//   3. it is recorded in `REVIEWED_NOT_CARRIED` with the quantity that differs;
//   4. it is recorded in the sibling suite's `NO_SHARED_SHOP_RATES`.
//
// It deliberately does **not** assert that a page ought to take the bar. That
// judgement needs the page read — the labels and the arithmetic in its
// `calc.mjs` — because `medical-courier-route-margin` carries the *canonical*
// id `overheadRate` for a percentage of **revenue**, and prefilling a
// percentage of direct cost there would be a wrong number that looks
// considered. What this asserts is that somebody made the judgement and wrote
// it down. A new venture that walks into the population fails here, naming
// itself, instead of quietly joining the eight.

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REVIEWED_NOT_CARRIED,
  RATE_SOURCE_SLUGS,
  SHOP_RATE_ALIASES,
  PARTIAL_SHOP_RATE_PAGES,
  pageShopRateFields,
  pageTakesShopRates,
} from './rates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.join(HERE, '..', '..', 'ventures');

/**
 * What each of the four quantities looks like when a page spells it its own way.
 *
 * Intentionally broad. A false positive here costs one reading and one line in
 * a map; a false negative is a live product outside the feature for a year,
 * which is what actually happened. So this errs toward pulling a page in and
 * making somebody classify it.
 *
 * Matched against `<input>` ids only — an output `id` (`overheadOut`,
 * `outBurdenPerHour`) is a rendered result, not a field anything can prefill,
 * and treating one as a field would put pages in the population that have no
 * form at all.
 */
const CONCEPT_PATTERNS = {
  hourlyWage: /(wage|hourly|labou?rRate|labou?rRatePer|crewPay|payPerHour)/i,
  burdenRate: /burden/i,
  overheadRate: /overhead/i,
  targetMargin: /(targetMargin|marginPct|marginPercent|targetMarkup)/i,
};

/** The `id`s of real inputs on this page, in document order. */
const inputIds = (html) =>
  [...html.matchAll(/<input\b[^>]*\bid="([A-Za-z][A-Za-z0-9_-]*)"/gi)].map((m) => m[1]);

/** How many of the four this page appears to ask for, under any spelling. */
const conceptsPresent = (html) => {
  const ids = inputIds(html);
  return Object.entries(CONCEPT_PATTERNS)
    .filter(([, pattern]) => ids.some((id) => pattern.test(id)))
    .map(([field]) => field);
};

/**
 * The same floor `pageTakesShopRates` applies, restated in concept terms.
 *
 * One shared quantity is not "your shop rates", so a page asking only for a
 * target margin is not in the population and never was.
 */
const FLOOR = 2;

const ventureSlugs = async () =>
  (await fs.readdir(VENTURES, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const readIndex = (slug) =>
  fs.readFile(path.join(VENTURES, slug, 'index.html'), 'utf8').catch(() => null);

/**
 * The sibling suite's exclusion map, read as source rather than imported.
 *
 * It is a `const` inside `rates.test.mjs`, not an export, and promoting it
 * would mean editing a suite another session may be changing. Reading the keys
 * is enough for what this asserts — that the slug has a decision recorded
 * *somewhere* — and it fails loudly below if the shape it depends on moves.
 */
async function noSharedShopRatesSlugs() {
  const source = await fs.readFile(path.join(HERE, 'rates.test.mjs'), 'utf8');
  const block = source.match(/const NO_SHARED_SHOP_RATES = \{([\s\S]*?)\n\};/);
  assert.ok(
    block,
    'rates.test.mjs no longer declares NO_SHARED_SHOP_RATES the way this guard reads it — ' +
      'update this helper rather than deleting the assertion it feeds',
  );
  const slugs = [...block[1].matchAll(/^\s*'([a-z0-9-]+)':/gm)].map((m) => m[1]);
  assert.ok(slugs.length >= 5, `expected the exclusion map to hold entries, saw ${slugs.length}`);
  return new Set(slugs);
}

test('every page that asks for two or more of the four rates has a recorded decision', async () => {
  const excluded = await noSharedShopRatesSlugs();
  const unclassified = [];
  let population = 0;

  for (const slug of await ventureSlugs()) {
    const html = await readIndex(slug);
    if (html === null) continue;
    const concepts = conceptsPresent(html);
    if (concepts.length < FLOOR) continue;
    population += 1;

    if (pageTakesShopRates(html, slug)) continue;
    if (RATE_SOURCE_SLUGS.has(slug)) continue;
    if (slug in REVIEWED_NOT_CARRIED) continue;
    if (excluded.has(slug)) continue;

    unclassified.push(`${slug} (asks for ${concepts.join(', ')})`);
  }

  // If this number collapses, the patterns above stopped matching and the
  // guard is passing because it is looking at nothing -- the failure mode this
  // whole file is written against.
  assert.ok(
    population >= 100,
    `expected the shop-rate population to be substantial, saw ${population}`,
  );

  assert.deepEqual(
    unclassified,
    [],
    'These pages ask for the shop rates under their own ids and no decision is recorded.\n' +
      'Read each one -- its labels AND the arithmetic in its calc.mjs -- then either:\n' +
      '  - add SHOP_RATE_ALIASES + PARTIAL_SHOP_RATE_PAGES entries so it carries what it shares, or\n' +
      '  - add a REVIEWED_NOT_CARRIED entry naming the quantity that differs.\n' +
      'Do not guess from the id: `medical-courier-route-margin` spells overhead with the\n' +
      'canonical id and means a percentage of revenue.\n' +
      `Unclassified: ${unclassified.join('; ')}`,
  );
});

test('a page recorded as not-carried really does get nothing', async () => {
  // Keeps `REVIEWED_NOT_CARRIED` from becoming somewhere to park a page that
  // has since been wired up. Once a page takes the bar, its entry is stale and
  // says the opposite of what is true.
  for (const [slug, reason] of Object.entries(REVIEWED_NOT_CARRIED)) {
    const html = await readIndex(slug);
    assert.ok(html !== null, `${slug} is recorded as not-carried but no longer exists — drop the entry`);
    assert.ok(
      !pageTakesShopRates(html, slug),
      `${slug} now takes the shop-rate bar, so its REVIEWED_NOT_CARRIED entry is wrong — drop it`,
    );
    assert.ok(
      reason.length > 30,
      `${slug} needs a reason naming the quantity that differs, not a placeholder`,
    );
  }
});

test('a not-carried page is never also aliased or documented as partial', async () => {
  // The four buckets have to be exclusive, or the record says two things. An
  // alias plus a partial note is how a page *joins* the feature; both are
  // meaningless on a page recorded as getting nothing, and their presence
  // would mean somebody edited one map and forgot the other.
  for (const slug of Object.keys(REVIEWED_NOT_CARRIED)) {
    assert.ok(
      !(slug in SHOP_RATE_ALIASES),
      `${slug} is recorded as not-carried but also aliased — pick one`,
    );
    assert.ok(
      !(slug in PARTIAL_SHOP_RATE_PAGES),
      `${slug} is recorded as not-carried but also has a partial note, which no visitor can ever see`,
    );
  }
});

test('every alias names an input the venture actually has', async () => {
  // The failure this prevents is silent: an alias pointing at an id the page
  // does not use drops that field from `pageShopRateFields`, and a page can
  // fall below the floor and lose its bar entirely without anything failing.
  // `rates.test.mjs` asserts this for the bid-calculator family; the eight
  // pages added on 2026-09-11 are outside that family, which is the whole
  // reason they were missed.
  for (const [slug, aliases] of Object.entries(SHOP_RATE_ALIASES)) {
    const html = await readIndex(slug);
    assert.ok(html !== null, `${slug} is aliased but has no index.html — drop the entry`);
    const ids = new Set(inputIds(html));
    for (const [field, inputId] of Object.entries(aliases)) {
      assert.ok(
        ids.has(inputId),
        `${slug} aliases ${field} to "${inputId}", which is not an input on that page`,
      );
    }
    // And the alias has to buy something: a page that ends up below the floor
    // carries no bar, so the alias silently did nothing.
    assert.ok(
      pageTakesShopRates(html, slug),
      `${slug} is aliased but still takes no bar — it needs a PARTIAL_SHOP_RATE_PAGES note, ` +
        'or the alias is not enough to clear the floor',
    );
  }
});

test('every partial note belongs to a page that carries some but not all four', async () => {
  for (const [slug, note] of Object.entries(PARTIAL_SHOP_RATE_PAGES)) {
    const html = await readIndex(slug);
    assert.ok(html !== null, `${slug} has a partial note but no index.html — drop the entry`);
    const carried = pageShopRateFields(html, slug).length;
    assert.ok(
      carried >= FLOOR,
      `${slug} has a partial note but carries only ${carried} field(s), below the floor`,
    );
    assert.ok(
      carried < 4,
      `${slug} carries all four, so its partial note explains a gap that does not exist`,
    );
    // The note is shown to a visitor, so it has to explain the gap in their
    // terms. An id in the text means it was written for a reader of this file.
    assert.ok(!/`|hourlyWage|burdenRate|overheadRate|targetMargin/.test(note),
      `${slug}'s note names an internal id; write it in the visitor's terms`);
    assert.ok(note.length > 40, `${slug} needs a real explanation, not a placeholder`);
  }
});
