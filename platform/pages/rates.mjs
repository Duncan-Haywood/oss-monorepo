// Carries a contractor's own cost structure across every trade bid calculator
// on the site.
//
// Why this exists
// ---------------
// Thirty-six trade bid calculators here ask the same four questions before they
// can price anything: crew hourly wage, payroll burden, overhead on direct
// cost, and target net margin. Those four are not facts about the *job* — they
// are facts about the *business*, and they do not change between a door job and
// a crown-molding job. Every calculator nonetheless opens on a stranger's
// ballpark ($42/h, 32%, 15%, 20%), so the second tool a contractor opens makes
// them look up and retype the same four numbers they entered ten minutes ago,
// on a page that meanwhile shows a price computed from someone else's shop.
//
// That is the worst possible failure for this site's actual growth story. The
// hub exists so a visitor who lands on one calculator from search finds the
// other fifty-eight; `portfolio/DIRECTION.md` counts return usage and
// time-to-first-value as the signals worth moving. A visitor who crosses to a
// second tool and is met with a four-field re-entry has been given a reason to
// leave, right at the moment they were about to become a returning user.
//
// So: save those four once, and every trade bid calculator on this origin opens
// with them. Nothing leaves the browser — one `localStorage` key on the site's
// own origin, which is the same device-local convention the hub's usage counter
// already uses.
//
// Injected at build time, not written into each venture, for the same two
// reasons the navigation chrome is (see `injectChrome`): a calculator lands on
// `main` most days and the injection covers each new one for free, and venture
// pages are edited concurrently by other sessions, so the same four-line edit
// committed into thirty-six product files would conflict with nearly every open
// branch.

/**
 * The fields carried between tools.
 *
 * All four are present, with these exact ids and these exact meanings, in every
 * `ventures/*-bid-calculator/index.html` on `main` — they are the shared spine
 * of the family rather than a coincidence of naming. `burdenRate`,
 * `overheadRate` and `targetMargin` are percentages in every one of them, and
 * `overheadRate` is specifically overhead *on direct cost*, not a day rate.
 *
 * Deliberately not carried: anything job-shaped (square feet, corners, trips)
 * and anything trade-shaped (hours per unit, material invoices). Those differ
 * per bid and per tool, and prefilling them from another trade would be worse
 * than a blank field — it would be a wrong number that looks considered.
 *
 * `max` is the ceiling the calculators themselves accept, so a restored value
 * can never prefill a field the tool would then reject. A margin of 100% has no
 * arithmetic meaning here (price divided by zero), which is why the forms cap
 * it below 100 and this does too.
 */
import { stripForInjection } from './jobs.mjs';

export const SHOP_RATE_FIELDS = [
  { id: 'hourlyWage', label: 'Crew hourly wage', prefix: '$', suffix: '/h', max: 100000 },
  { id: 'burdenRate', label: 'Payroll burden', suffix: '%', max: 500 },
  { id: 'overheadRate', label: 'Overhead on direct cost', suffix: '%', max: 500 },
  { id: 'targetMargin', label: 'Target net margin', suffix: '%', max: 99.9 },
];

/** The one `localStorage` key. Site-wide on purpose: that is the whole feature. */
export const SHOP_RATES_KEY = 'portfolio-shop-rates';

const SHOP_RATES_MARKER = 'pf-rates';

/**
 * The one thing the shared script cannot know until it is on a page: which of
 * the four fields this tool carries and what each is called here, as
 * `fieldId:inputId` pairs. See `RATES_SCRIPT`.
 */
const RATES_FIELDS_ATTR = 'data-pf-rates-fields';

/**
 * Escaped, not interpolated. The field pairs and the two asset paths are
 * attribute values now, so the character that would break out of one is the
 * quote rather than the backslash a JSON string literal had to guard against.
 */
const attr = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Pages that spell a carried field with a different input id.
 *
 * Only a *verified* rename belongs here: the label on that page has to name the
 * same quantity the field spec above does. `snow-removal-bid-calculator` asks
 * "Operator hourly wage" ($22) — one person's hourly pay, exactly what
 * `hourlyWage` ("Crew hourly wage", $28-42 elsewhere) means. Nothing else about
 * that page differs, so it was outside the shared bar purely because of a name.
 *
 * An alias rather than a rename in the venture. Renaming `operatorWage` would
 * reach `calc.mjs`'s input contract, its tests, and any bid link already shared
 * with that key in the fragment; aliasing changes nothing a visitor has saved
 * and nothing another session is editing. Same reasoning as injecting the bar
 * at build time instead of committing it into thirty-six product files.
 *
 * A page whose comparable field means something *else* is not aliased and must
 * not be: see `PARTIAL_SHOP_RATE_PAGES` for what happens to those instead.
 */
export const SHOP_RATE_ALIASES = {
  'snow-removal-bid-calculator': { hourlyWage: 'operatorWage' },
  // Same shape as the snow-removal case. `mobile-detailing-bid-calculator`
  // asks "Hourly wage before burden" and "Payroll burden (%)", which are
  // `hourlyWage` and `burdenRate` under different ids. It grew both when it
  // started costing the whole stop (#1172); the exclusion recorded against it
  // predates that and still said it had "no wage input at all".
  'mobile-detailing-bid-calculator': { hourlyWage: 'wage', burdenRate: 'burdenPercent' },
  // Same shape again: "Hourly wage before burden" and "Payroll burden (%)"
  // are `wage` and `burdenPercent` here too. `targetMargin` already matches
  // the canonical id directly, so only these two need the alias.
  'pet-grooming-bid-calculator': { hourlyWage: 'wage', burdenRate: 'burdenPercent' },
  // `ice-dam-removal-bid-calculator` asks for "Crew pay ($/hr per tech)" —
  // the same raw, un-burdened per-person wage as `hourlyWage` — under the id
  // `crewHourlyRate`. Its overhead and target margin already match the
  // canonical ids directly, so only this one alias is needed; it has no
  // separate payroll-burden field, so `burdenRate` is not carried at all: see
  // PARTIAL_SHOP_RATE_PAGES.
  'ice-dam-removal-bid-calculator': { hourlyWage: 'crewHourlyRate' },
  // `home-staging-bid-calculator` asks for "Crew pay ($/hr)" — the same raw,
  // un-burdened per-person wage as `hourlyWage` — under the id
  // `crewHourlyRate`. Its overhead and target margin already match the
  // canonical ids directly, so only this one alias is needed; it has no
  // separate payroll-burden field, so `burdenRate` is not carried at all: see
  // PARTIAL_SHOP_RATE_PAGES.
  'home-staging-bid-calculator': { hourlyWage: 'crewHourlyRate' },
  // --- read 2026-09-11, by enumerating rather than recalling -----------------
  //
  // The eight entries below (and the notes in `PARTIAL_SHOP_RATE_PAGES`) come
  // from asking the question this file's own `pageTakesShopRates` comment says
  // is the one that matters: *which pages carry these quantities and get no bar
  // because nobody has read them yet?* Nineteen pages carried two or more of
  // the four under non-canonical ids. Each was read — label, and the arithmetic
  // in its `calc.mjs` — and sorted into an alias here, a note below, or
  // `REVIEWED_NOT_CARRIED` with the reason it must stay excluded.
  //
  // `change-order-margin-calculator` is the sharpest of them: it asks "Hourly
  // wage", "Payroll burden (%)", "Overhead on direct cost (%)" and "Target
  // margin (%)" — all four, the third *verbatim* the label in the field spec
  // above — and got nothing, on four different ids. Pricing a change order is
  // the most bid-shaped job in this catalogue, and it was the page furthest
  // from the feature.
  'change-order-margin-calculator': {
    hourlyWage: 'wage',
    burdenRate: 'burdenPercent',
    overheadRate: 'overheadPercent',
    targetMargin: 'targetMarginPercent',
  },
  // "Staff hourly wage" is one person's raw pay and "Payroll tax & benefits
  // load (%)" is the payroll burden on it — the same two quantities, and
  // `hourlyWage` already matches the canonical id directly, so only the burden
  // and the margin need naming. Its overhead is monthly dollars for the room
  // rather than a percentage of direct cost: see PARTIAL_SHOP_RATE_PAGES.
  'childcare-tuition-calculator': {
    burdenRate: 'payrollBurdenPercent',
    targetMargin: 'targetMarginPercent',
  },
  // `calc.mjs` documents `driverHourlyRate` as "Target hourly pay for driver"
  // and multiplies it by driver hours with nothing added — a raw, un-burdened
  // per-person wage. Its overhead asks "Overhead (% of direct cost)" and its
  // margin "Target margin (%)", both already under the canonical ids, so this
  // one alias completes three of the four.
  'dumpster-rental-margin-calculator': { hourlyWage: 'driverHourlyRate' },
  // "Staff pay ($/hr)" and "Overhead (% of direct cost)" — the same shape as
  // the dumpster case, with the margin under a `Pct` suffix.
  'food-truck-event-margin-calculator': {
    hourlyWage: 'staffHourlyRate',
    targetMargin: 'targetMarginPct',
  },
  // "Attendant pay ($/hr)" is documented in `calc.mjs` as "Target hourly pay
  // per attendant" and no burden is applied to it anywhere, so it is the raw
  // wage. "Overhead (% of direct cost)" is applied as
  // `nonPrintDirectCost * (overheadRate / 100)` — overhead on direct cost,
  // exactly as the spec means it — and already carries the canonical id.
  'photo-booth-event-quote': {
    hourlyWage: 'attendantHourlyRate',
    targetMargin: 'targetMarginPct',
  },
  // "Wage per hour ($)" is the raw wage on both of these. Their overhead is a
  // monthly shop figure in dollars and neither has a payroll-burden field, so
  // each carries two of the four — see PARTIAL_SHOP_RATE_PAGES.
  'apparel-decoration-price-calculator': {
    hourlyWage: 'wagePerHour',
    targetMargin: 'targetMarginPct',
  },
  'wash-and-fold-price-calculator': {
    hourlyWage: 'wagePerHour',
    targetMargin: 'targetMarginPct',
  },
  // "Crew rate ($/hr per person)" is the same raw, un-burdened per-person wage
  // as `hourlyWage`, spelled `crewHourlyRatePerPerson`. "Target margin on
  // price (%)" is the same net-margin-on-price concept as `targetMargin`,
  // spelled `targetMarginPercentPct` (the `Pct` suffix matches this page's own
  // convention for a 0-100 UI field backing a 0-1 fraction in calc.mjs). It has
  // no separate payroll-burden field, and office research and drafting time
  // are priced as their own hourly rates rather than an overhead percentage of
  // direct cost, so it carries two of the four: see PARTIAL_SHOP_RATE_PAGES.
  'land-survey-bid-calculator': {
    hourlyWage: 'crewHourlyRatePerPerson',
    targetMargin: 'targetMarginPercentPct',
  },
};

/**
 * Why a page carries only some of the four, so the bar can say so.
 *
 * A page reaches this map by having been read: the missing field is missing
 * because that tool genuinely prices it differently, not because nobody has
 * wired it up yet. The note is shown to the visitor, so it explains the gap in
 * their terms rather than naming an id.
 */
export const PARTIAL_SHOP_RATE_PAGES = {
  'tree-service-bid-calculator':
    'This tool prices labour as a whole-crew hourly rate, not one person’s wage, so your saved crew wage is left alone here.',
  'appliance-repair-quote-calculator':
    'This tool asks for a loaded labour rate — wage and burden together — so your saved wage and burden are left alone here.',
  'portable-restroom-event-quote':
    'This tool prices units and hauls rather than crew hours, so your saved wage and burden are left alone here.',
  'mobile-detailing-bid-calculator':
    'This tool allocates overhead as dollars for the job rather than a percentage of direct cost, so your saved overhead rate is left alone here.',
  'pet-grooming-bid-calculator':
    'This tool allocates overhead as dollars for the job rather than a percentage of direct cost, so your saved overhead rate is left alone here.',
  'vehicle-wrap-bid-calculator':
    'This tool asks for a loaded installer rate — wage and burden together — so your saved wage and burden are left alone here.',
  'locksmith-bid-calculator':
    'This tool prices one call from a single billed rate rather than a separate crew wage and payroll burden, so your saved wage and burden are left alone here.',
  'ice-dam-removal-bid-calculator':
    'This tool has no separate payroll-burden field, so your saved burden rate is left alone here.',
  'home-staging-bid-calculator':
    'This tool has no separate payroll-burden field, so your saved burden rate is left alone here.',
  // --- added 2026-09-11 alongside the aliases above ---------------------------
  'childcare-tuition-calculator':
    'This tool allocates overhead as monthly dollars for the room rather than a percentage of direct cost, so your saved overhead rate is left alone here.',
  'dumpster-rental-margin-calculator':
    'This tool has no separate payroll-burden field, so your saved burden rate is left alone here.',
  'food-truck-event-margin-calculator':
    'This tool has no separate payroll-burden field, so your saved burden rate is left alone here.',
  'photo-booth-event-quote':
    'This tool has no separate payroll-burden field, so your saved burden rate is left alone here.',
  'apparel-decoration-price-calculator':
    'This tool has no payroll-burden field and allocates overhead as monthly shop dollars rather than a percentage of direct cost, so your saved burden and overhead rates are left alone here.',
  'wash-and-fold-price-calculator':
    'This tool has no payroll-burden field and allocates overhead as monthly dollars rather than a percentage of direct cost, so your saved burden and overhead rates are left alone here.',
  // `bounce-house-rental-calculator` needs no alias at all — it asks "Overhead
  // on direct cost (%)" and "Target net margin (%)" under the canonical ids
  // already, and was excluded purely for want of an entry in this map. Its one
  // labour input is "Labor rate ($/hr per crew member)", documented in
  // `calc.mjs` as "Per crew member, per hour" with no burden applied anywhere,
  // so that single number has to cover burden as well as wage: the
  // `appliance-repair-quote-calculator` case, and not a `hourlyWage`.
  'bounce-house-rental-calculator':
    'This tool prices labour as one rate per crew member that already covers burden, so your saved wage and burden are left alone here.',
  'land-survey-bid-calculator':
    'This tool has no separate payroll-burden field and prices office research and drafting time as their own hourly rates rather than a percentage of direct cost, so your saved burden and overhead rates are left alone here.',
};

/**
 * Below this, the bar is not worth showing.
 *
 * One shared field is not "your shop rates" — it is a single number, and a
 * panel promising that every calculator opens with your numbers would be
 * overstating what this page can actually do with them.
 *
 * No venture is currently below this floor. `mobile-detailing-bid-calculator`
 * used to be the example — one field, `targetMargin` — and it stopped being
 * one when it grew a wage and a burden input; the floor kept excluding it only
 * because it spells them `wage` and `burdenPercent`. It is now aliased and
 * partial. The floor still guards the unread page, which is what it is for.
 */
export const MIN_CARRIED_FIELDS = 2;

/**
 * Pages that *produce* the shop rates rather than consume them.
 *
 * `shop-rate-calculator` is the upstream tool for this whole feature: it derives
 * the payroll burden and the overhead rate from a contractor's payroll,
 * vehicles, overhead and billable hours, and writes all four into
 * `SHOP_RATES_KEY` itself. Two of the four (`hourlyWage`, `targetMargin`) are
 * inputs on its form, so without this it would clear `MIN_CARRIED_FIELDS` and
 * receive the bar — offering "Save the rates on this bid" beside its own,
 * fuller control, and saving two of the four where the page had just computed
 * all four. Two save buttons with different scopes on the one page that exists
 * to settle these numbers is the wrong answer to which of them is authoritative.
 *
 * Burden and overhead are outputs there, not inputs, so this is not a
 * `PARTIAL_SHOP_RATE_PAGES` case: nothing is missing that a note could explain.
 */
export const RATE_SOURCE_SLUGS = new Set(['shop-rate-calculator']);

/**
 * Pages read and deliberately *not* carried, with the reason.
 *
 * This is the fourth bucket, and the one this file was missing. A page that
 * carries two or more of these quantities under its own ids reaches
 * `pageTakesShopRates` and is skipped for want of a `PARTIAL_SHOP_RATE_PAGES`
 * entry — which is the right default, because the alternative is prefilling a
 * field whose meaning nobody checked. But the skip is *silent and
 * indistinguishable* between "read, and it genuinely prices this differently"
 * and "nobody has looked yet". The comment on `pageTakesShopRates` already
 * records what that ambiguity cost once: four real tools, one of which asked
 * for burden, overhead and margin under the exact canonical ids and meanings.
 *
 * On 2026-09-11 it had cost eight more, found by enumerating the population
 * rather than by anyone noticing an absence — `bounce-house-rental-calculator`
 * was two canonical ids and a missing map entry away from working, and
 * `change-order-margin-calculator` had all four. Nothing was broken and no test
 * was red; there was simply no question being asked. That is the shape
 * `CLAUDE.md` records against the front-door mirror and the checklist
 * directories: an absence is not discovered by noticing it.
 *
 * So every page in the population now lands in exactly one of four buckets —
 * wired, aliased-and-partial, a rate source, or here with a reason — and
 * `rates-coverage.test.mjs` fails on a page in none of them. The reason strings
 * are for the next reader, never shown to a visitor: a page here draws no bar,
 * so there is nothing to explain on it.
 *
 * A page moves *out* of this map when the tool changes shape, not when someone
 * disagrees with the reading. Each entry names the quantity that differs.
 */
export const REVIEWED_NOT_CARRIED = {
  // The trap in the set, and the reason this map exists rather than a bare
  // allowlist: `overheadRate` here is the *canonical id* but asks "Overhead (%
  // of revenue)", a different base from the spec's percentage of direct cost.
  // Carrying it would put a considered-looking wrong number on the page — the
  // one outcome this whole feature is written to avoid. Its labour input is
  // named `loadedLaborRate` and says so.
  'medical-courier-route-margin':
    'overhead is a percentage of revenue, not of direct cost, and the labour rate is loaded',
  'pool-route-pricing':
    'labour is one "Labor cost / hour" with no burden field, and overhead is dollars per account per month',
  'custom-farm-rate-calculator':
    'the labour rate is what the operator wants to earn for their own time, not a wage cost, and there is no overhead percentage',
  'dog-walking-route-pricing':
    'the hourly figure is a target sell rate rather than a wage, and overhead is monthly dollars',
  'notary-trip-quote':
    'one call is priced from a single billed rate rather than a wage plus burden',
  '3d-print-price-calculator':
    'the labour rate carries burden with it and there is no overhead percentage',
  'drone-mapping-job-calculator':
    'the field and processing rates are billed rates, not wages',
  'home-inspection-fee-calculator':
    'the hourly rate is a single billed rate rather than a wage plus burden, and overhead is a flat dollar allowance per job rather than a percentage of direct cost',
  'staffing-markup-calculator':
    'it derives a markup from burden rather than consuming one; its wage figures are unemployment-tax wage bases and its burden figures are outputs',
  // Reads as a rate tool and is not one in this sense: it measures a month
  // already billed rather than pricing an hour about to be sold, so all four
  // of its rate-shaped fields have a different base from the spec's. Technician
  // pay is a *period total* in dollars including burden, not a wage plus a
  // burden percentage. `monthlyOverhead` is dollars for the whole shop, not a
  // percentage of direct cost — the page deliberately derives no overhead rate,
  // because it nets parts gross profit off overhead instead of allocating by a
  // percentage. And `targetLaborGrossProfit` is gross profit on the labor line
  // only, which is not the spec's net margin on a whole job: 70% here is
  // ordinary and 70% there would be nonsense. Prefilling any of them would put
  // a considered-looking wrong number on the page, which is what this map
  // exists to prevent.
  'auto-repair-effective-labor-rate':
    'technician pay is a period total in dollars with burden already in it, overhead is whole-shop dollars rather than a percentage of direct cost, and the target is labor gross profit rather than net margin on a job',
  // The marketplace fee tools ask for seller time on one task — driving to a
  // pickup, uploading a label, restocking — not for a crew wage, and they price
  // a listing rather than a bid.
  'ebay-fee-calculator': 'the hourly figures are per-task seller time, not a crew wage',
  'etsy-profit-calculator': 'the hourly figures are per-task seller time, not a crew wage',
  'amazon-fba-calculator': 'the hourly figure is per-task seller time, not a crew wage',
  'walmart-marketplace-calculator':
    'the hourly figures are per-task seller time, not a crew wage',
};

/**
 * The fields this page can actually carry, in spec order.
 *
 * Each entry is the canonical field plus the `inputId` to write on this page —
 * the same id for all but an aliased one. Returns `[]` for a page that carries
 * none, which is every deep SEO page and every non-trade tool.
 */
export function pageShopRateFields(html, slug = '') {
  if (typeof html !== 'string') return [];
  const aliases = SHOP_RATE_ALIASES[slug] ?? {};
  return SHOP_RATE_FIELDS.map((field) => ({
    ...field,
    inputId: aliases[field.id] ?? field.id,
  })).filter((field) => new RegExp(`<input[^>]*\\bid="${field.inputId}"`, 'i').test(html));
}

/**
 * Only a finite, non-negative number inside the field's own range is carried.
 * Same contract the calculators enforce on input, and the same reason: a
 * prefilled value the tool would reject is a page that opens broken.
 */
function usableRate(field, value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(result) || result < 0) return null;
  if (typeof field.max === 'number' && result > field.max) return null;
  return result;
}

/**
 * Keep only the known fields, and only where the value is usable.
 *
 * Returns `null` rather than `{}` when nothing survives, so "no rates" is one
 * state throughout instead of two that behave differently.
 */
export function normalizeRates(values) {
  if (!values || typeof values !== 'object') return null;
  const result = {};
  for (const field of SHOP_RATE_FIELDS) {
    const value = usableRate(field, values[field.id]);
    if (value !== null) result[field.id] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Parse what came back out of storage.
 *
 * Storage is the visitor's own disk and can hold anything — a half-written
 * value from a crashed tab, a key another tool happened to use, a payload from
 * a future version of this file. Every one of those has to end as "no saved
 * rates" rather than as an exception thrown into the page, because the failure
 * mode of a throw here is a calculator that stops calculating.
 */
export function parseStoredRates(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return normalizeRates(parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed);
}

/** The stored form. Versioned so a later shape can be told apart from this one. */
export function serializeRates(values) {
  const rates = normalizeRates(values);
  if (!rates) return null;
  return JSON.stringify({ v: 1, rates });
}

/**
 * Does this page carry the whole set, under the canonical ids?
 *
 * Kept as the strict test: the bid-calculator family's own suite uses it to
 * catch a venture that renames one of these ids and drops out of the shared bar
 * without anything failing.
 */
export function pageCarriesShopRates(html) {
  if (typeof html !== 'string') return false;
  return SHOP_RATE_FIELDS.every((field) =>
    new RegExp(`<input[^>]*\\bid="${field.id}"`, 'i').test(html),
  );
}

/**
 * Should this page get the bar at all?
 *
 * This used to be `pageCarriesShopRates` — all four ids or nothing — and the
 * all-or-nothing rule was written for the right reason: half-prefilling a page
 * would put a number in a field whose meaning nobody had checked. But "nobody
 * has checked" is a fact about this file, not about the page, and it cost four
 * real tools. `tree-service-bid-calculator` asks for payroll burden, overhead
 * on direct cost, and target net margin under those exact ids and those exact
 * meanings, and got no bar because its *fourth* field is a whole-crew rate.
 * A tree surgeon who set their overhead once still retyped it there.
 *
 * So the rule is now: carry the fields whose meaning has been read on that page
 * (`pageShopRateFields`), never the ones whose meaning differs, and tell the
 * visitor which is which. The deep SEO pages carry no form and still get
 * nothing.
 */
export function pageTakesShopRates(html, slug = '') {
  if (RATE_SOURCE_SLUGS.has(slug)) return false;
  const carried = pageShopRateFields(html, slug).length;
  if (carried === SHOP_RATE_FIELDS.length) return true;
  // A partial page needs an entry in `PARTIAL_SHOP_RATE_PAGES` — which is to
  // say, someone has read that page and can say in the panel why the missing
  // field is missing. Without one, a page carrying two of the four is still
  // what the old rule assumed it was: unreviewed, and skipped.
  return carried >= MIN_CARRIED_FIELDS && slug in PARTIAL_SHOP_RATE_PAGES;
}

/**
 * Scoped under `.pf-rates`, and — like the navigation chrome — it takes its
 * colours from the host page rather than from the operating system. Most
 * ventures here are deliberately light-only and carry no `prefers-color-scheme`
 * rule, so a band painted from its own dark palette would sit as a near-black
 * slab on a cream page for any visitor with a dark OS.
 *
 * Raw CSS rather than a `<style>` element: it is written once to
 * `pf-rates.css` at the site root and linked from the pages that carry the bar.
 * See `SHOP_RATES_STYLE_FILE`.
 */
const RATES_CSS = `
.pf-rates{font:inherit;font-size:.85rem;line-height:1.45;color:inherit;
  max-width:1060px;margin:0 auto;padding:8px 18px 0;box-sizing:border-box}
.pf-rates-line{margin:0;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline}
.pf-rates-status{opacity:.82}
.pf-rates button{font:inherit;font-size:.85rem;color:inherit;background:#8080801f;
  border:1px solid #80808059;border-radius:7px;padding:3px 9px;cursor:pointer}
.pf-rates button:hover{background:#8080802e}
.pf-rates-panel{margin:8px 0 0;padding:12px 14px;border:1px solid #80808040;
  border-radius:10px;background:#8080800f}
.pf-rates-panel p{margin:0 0 10px}
.pf-rates-list{margin:0 0 10px;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 18px}
/* An author display declaration outranks the user agent's [hidden] rule, so
   without this the list stayed in the layout — empty, with its own 10px
   margin, and announced as a list by a screen reader — for every visitor who
   has not saved their shop rates yet, which is every first-time visitor.
   Caught by asking a rendered page; see checkHiddenDisplay in check.mjs. */
.pf-rates-list[hidden]{display:none}
.pf-rates-list li{margin:0}
.pf-rates-list b{font-variant-numeric:tabular-nums}
.pf-rates-actions{display:flex;flex-wrap:wrap;gap:8px}
.pf-rates-note{margin:10px 0 0;opacity:.72}
.pf-rates :focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media (max-width:780px){.pf-rates{padding:8px 14px 0}}

/* Never print this band, and this one is not cosmetic.
 *
 * .pf-rates-list renders the contractor's saved crew wage, payroll burden,
 * overhead and target net margin. Nine bid calculators also print a customer
 * proposal (platform/proposal), and the whole point of that sheet is that the
 * homeowner receives the price without the cost structure behind it — its own
 * print rules hide header, main and footer for exactly that reason. This band
 * is injected as a sibling of the page's main element, so it fell outside that
 * allow-list: a contractor who had saved their rates and left the panel open
 * would have handed the customer their margin along with the quote. */
@media print{.pf-rates{display:none !important}}
`;

/** "a, b and c" — the carried fields named the way the page labels them. */
function fieldSentence(fields) {
  const names = fields.map((field) => field.label.toLowerCase());
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The prose is rendered at build time and the script only wires it, so what a
 * visitor reads is in the HTML rather than assembled by JavaScript — and so a
 * crawler or an answer engine can see that these tools carry the feature. That
 * now includes which fields *this* page shares and, on a partial page, why the
 * rest are absent: a reason assembled in script would be invisible to both.
 *
 * It starts `hidden` and the script reveals it. Everything this bar offers is
 * storage plus scripting; with scripting off there is nothing behind the
 * control, and a button that does nothing is worse than no button.
 */
const RATES_MARKUP = (fields, note) => `<section class="pf-rates" hidden data-pf-rates-root>
  <p class="pf-rates-line">
    <span class="pf-rates-status" id="pf-rates-status" role="status"></span>
    <button type="button" id="pf-rates-toggle" aria-expanded="false" aria-controls="pf-rates-panel">Your shop rates</button>
  </p>
  <div class="pf-rates-panel" id="pf-rates-panel" hidden>
    <p>Your ${fieldSentence(fields)} are the same on every job you bid. Save them once and every trade bid calculator here opens with your numbers instead of a stranger&rsquo;s ballpark.</p>
${note ? `    <p class="pf-rates-note">${note}</p>\n` : ''}    <ul class="pf-rates-list" id="pf-rates-list" hidden></ul>
    <div class="pf-rates-actions">
      <button type="button" data-pf-rates="save">Save the rates on this bid</button>
      <button type="button" data-pf-rates="apply" hidden>Use my saved rates here</button>
      <button type="button" data-pf-rates="clear" hidden>Forget my rates</button>
    </div>
    <p class="pf-rates-note">Kept in this browser only, on this site&rsquo;s own storage. Nothing is uploaded, and clearing your browser data clears it. Forgetting them leaves the numbers already on this bid alone.</p>
  </div>
</section>`;

/**
 * The browser half.
 *
 * A module script, not a classic one, and that is load-bearing: inline classic
 * scripts run the moment they are parsed, which would be *before* the venture's
 * own deferred module has restored a saved or shared bid. Module scripts are
 * deferred and run in document order, so this one — injected last — sees the
 * finished form. The `load` fallback covers a venture module that stalls.
 *
 * The rule about what may be overwritten is the whole design:
 *
 *   - A field named in the page's URL fragment (or a leftover query string)
 *     came off a *bid link* someone sent. Those are the sender's numbers on
 *     the sender's job, and replacing them would silently price a different
 *     bid than the sender saw — the exact bug `share.mjs` was written to
 *     avoid. Never overwritten. Bid links live in the fragment so wage and
 *     margin never hit the server log or a Referer.
 *   - Anything else is overwritten by the saved rates, including the copy sitting
 *     in this browser's own saved bid. That copy is a snapshot of what the rates
 *     were when the bid was last touched; the saved rates are what they are now.
 *     If a contractor raises their wage, every tool has to show it, or the
 *     feature is a lie the second time it matters.
 *
 * One file for the whole site, on the `pf-jobs.js` precedent. Only
 * two things about this script were ever per-page — *which* of the four fields
 * the tool carries, and what each one's input is called there — and both now
 * ride on the `<script>` tag as `data-pf-rates-fields`.
 */
const RATES_SCRIPT = () => `
(function(){
  // Everything a field *means* — its label, its units, its ceiling — is the
  // same on all 105 pages, so it stays here as a constant rather than
  // travelling through the DOM. The tag carries only the two facts that differ.
  var CATALOG = ${JSON.stringify(
    Object.fromEntries(
      SHOP_RATE_FIELDS.map(({ id, label, prefix, suffix, max }) => [
        id,
        { label, prefix: prefix || '', suffix: suffix || '', max },
      ]),
    ),
  )};

  // Only the fields this page was verified to carry, each with the input id it
  // uses here. A field absent from this list is one whose meaning differs on
  // this tool; it is never read and never written.
  //
  // Read back from the tag rather than compiled in, and validated on the way:
  // a pair naming a field this build does not know is dropped rather than
  // trusted, for the reason pf-jobs.js re-checks its amount selector — the
  // value used to be a build-time literal and now arrives through the DOM.
  var tag = document.querySelector('script[${RATES_FIELDS_ATTR}]');
  var FIELDS = (tag ? tag.getAttribute('${RATES_FIELDS_ATTR}') || '' : '')
    .split(',')
    .map(function(pair){
      var parts = pair.split(':');
      var spec = CATALOG[parts[0]];
      if (!spec || !parts[1]) return null;
      return { id: parts[0], inputId: parts[1], label: spec.label,
        prefix: spec.prefix, suffix: spec.suffix, max: spec.max };
    })
    .filter(Boolean);
  var ALL_FIELDS = ${SHOP_RATE_FIELDS.length};
  var KEY = ${JSON.stringify(SHOP_RATES_KEY)};

  var root = document.querySelector('[data-pf-rates-root]');
  if (!root) return;
  var el = function(id){ return document.getElementById(id); };
  var fieldFor = function(f){
    var node = el(f.inputId);
    return node && node.tagName === 'INPUT' ? node : null;
  };
  // Defensive: the build only injects the fields it found, but a venture could
  // rename one tomorrow, and a bar offering a field the page no longer has is
  // worse than none. Removing the panel is the honest outcome.
  //
  // An empty list is the same verdict and needs saying separately now that the
  // list arrives through the DOM: the loop below cannot fail on a list with
  // nothing in it, so without this a page whose tag lost its attribute would
  // draw a bar that saves nothing and reads as broken.
  if (!FIELDS.length) { root.remove(); return; }
  for (var i = 0; i < FIELDS.length; i++) {
    if (!fieldFor(FIELDS[i])) { root.remove(); return; }
  }

  var store = (function(){ try { return window.localStorage; } catch (e) { return null; } })();
  // Number('') and Number(null) are 0. A blank field must not become a $0
  // wage that then prices the next trade at nothing and looks deliberate.
  var usable = function(raw, max){
    if (raw === '' || raw === null || raw === undefined) return null;
    var value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!isFinite(value) || value < 0 || value > max) return null;
    return value;
  };
  var read = function(){
    if (!store) return null;
    var raw;
    try { raw = store.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
    if (!parsed || typeof parsed !== 'object') return null;
    var source = parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed;
    var out = {}, kept = 0;
    FIELDS.forEach(function(f){
      var value = usable(source[f.id], f.max);
      if (value === null) return;
      out[f.id] = value; kept++;
    });
    // Whatever of this page's fields is saved, not all-or-nothing. A contractor
    // who saved three on a tool that has three has saved their shop rates; a
    // four-field tool must still open with those three rather than with a
    // stranger's ballpark in all four.
    return kept > 0 ? out : null;
  };
  // Everything already stored, including fields this page does not carry. The
  // save below merges into it: saving overhead and margin on a tool that has
  // only those two must not wipe the wage saved on a tool that has one.
  var readAll = function(){
    if (!store) return {};
    var raw;
    try { raw = store.getItem(KEY); } catch (e) { return {}; }
    if (!raw) return {};
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return {}; }
    if (!parsed || typeof parsed !== 'object') return {};
    var source = parsed.rates && typeof parsed.rates === 'object' ? parsed.rates : parsed;
    return source && typeof source === 'object' ? source : {};
  };
  var write = function(rates){
    if (!store) return false;
    var merged = readAll();
    Object.keys(rates).forEach(function(id){ merged[id] = rates[id]; });
    try { store.setItem(KEY, JSON.stringify({ v: 1, rates: merged })); return true; }
    catch (e) { return false; }
  };

  // The same anonymous, device-local convention the rest of the site uses:
  // which things were done, never who did them, never leaving the device, and
  // silent for a browser asking not to be counted.
  var bump = function(event){
    try {
      if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
      if (!store || store.getItem('portfolio-hub-optout') === '1') return;
      var k = 'portfolio-hub-usage';
      var counts = JSON.parse(store.getItem(k) || '{}');
      counts[event] = (counts[event] || 0) + 1;
      counts.last_day = new Date().toISOString().slice(0, 10);
      store.setItem(k, JSON.stringify(counts));
    } catch (e) {}
  };

  var encoded = (location.hash || location.search).replace(/^[#?]/, '');
  var params = new URLSearchParams(encoded);
  var format = function(f, value){
    var shown = Math.round(value * 100) / 100;
    return f.prefix + shown.toLocaleString('en-US') + f.suffix;
  };

  var currentFromForm = function(){
    var out = {}, kept = 0;
    FIELDS.forEach(function(f){
      var value = usable(fieldFor(f).value, f.max);
      if (value === null) return;
      out[f.id] = value; kept++;
    });
    // Every field this page carries, because a save that silently skipped a
    // blank one would store a set the contractor never checked.
    return kept === FIELDS.length ? out : null;
  };

  // Writing the value is not enough: the calculator recomputes on 'input' and
  // saves the bid on the document-level listener, so a silent assignment would
  // leave the price on screen computed from the number that is no longer there.
  var applyRates = function(rates, force){
    var applied = [], heldBack = [];
    FIELDS.forEach(function(f){
      if (!(f.id in rates)) return;
      // A bid link spells the field the way *this page* does, so an aliased
      // field has to be looked for under the page's own id as well as the
      // canonical one — otherwise the sender's wage would be silently replaced.
      if (!force && (params.has(f.inputId) || params.has(f.id))) { heldBack.push(f); return; }
      var node = fieldFor(f);
      applied.push(f);
      if (String(node.value) === String(rates[f.id])) return;
      node.value = rates[f.id];
      // "Hand-entered" as far as the venture's suggested-rate kits are
      // concerned, so a preset change cannot stomp the contractor's own rate.
      node.dataset.edited = '1';
      // 'input' only. Every calculator recomputes on 'input' and saves the bid
      // on a document-level 'input' listener, so this is enough — and their
      // 'change' handler is the one that records a usage event, which would be
      // a false reading: the visitor did not price anything, the page loaded.
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return { applied: applied, heldBack: heldBack };
  };

  var render = function(rates, outcome){
    root.hidden = false;
    var list = el('pf-rates-list');
    var status = el('pf-rates-status');
    var button = function(name){ return root.querySelector('[data-pf-rates="' + name + '"]'); };

    if (!rates) {
      status.textContent = 'Save your rates once \\u2014 every calculator here uses them.';
      list.hidden = true;
      list.innerHTML = '';
      button('save').textContent = 'Save the rates on this bid';
      button('apply').hidden = true;
      button('clear').hidden = true;
      return;
    }

    list.hidden = false;
    list.innerHTML = FIELDS.filter(function(f){ return f.id in rates; }).map(function(f){
      var label = document.createElement('li');
      label.textContent = f.label + ': ';
      var value = document.createElement('b');
      value.textContent = format(f, rates[f.id]);
      label.appendChild(value);
      return label.outerHTML;
    }).join('');

    button('save').textContent = 'Update from this bid';
    button('clear').hidden = false;
    var held = outcome && outcome.heldBack.length;
    button('apply').hidden = !held;
    // A field this page carries but has nothing saved for is worth naming: the
    // alternative is a bar that says "using your shop rates" over a form where
    // one of them is still a stranger's ballpark, which is the kind of quiet
    // half-truth that makes a contractor stop trusting the number.
    var unsaved = FIELDS.filter(function(f){ return !(f.id in rates); });
    status.textContent = held
      ? 'This bid came from a link, so it still shows the sender\\u2019s rates.'
      : unsaved.length
        ? 'Using your shop rates. ' + unsaved.map(function(f){ return f.label; }).join(' and ') +
          ' is not saved yet.'
        : 'Using your shop rates.';
  };

  var start = function(){
    var rates = read();
    var outcome = rates ? applyRates(rates, false) : null;
    if (outcome && outcome.applied.length) bump('shop_rates_applied');
    render(rates, outcome);

    el('pf-rates-toggle').addEventListener('click', function(){
      var panel = el('pf-rates-panel');
      var open = panel.hidden;
      panel.hidden = !open;
      el('pf-rates-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) bump('shop_rates_opened');
    });

    root.addEventListener('click', function(event){
      var action = event.target && event.target.closest && event.target.closest('[data-pf-rates]');
      if (!action) return;
      var name = action.getAttribute('data-pf-rates');

      if (name === 'save') {
        var next = currentFromForm();
        if (!next) {
          el('pf-rates-status').textContent =
            'Fill in all ' + FIELDS.length + ' of these rates on the bid first.';
          return;
        }
        if (!write(next)) {
          el('pf-rates-status').textContent = 'This browser is blocking site storage, so rates cannot be saved.';
          return;
        }
        bump('shop_rates_saved');
        render(next, { applied: FIELDS, heldBack: [] });
        // On a page carrying fewer than the full set, "every calculator opens
        // with these" would promise more than was saved: the fields this page
        // never asked for are untouched in storage, not written from here.
        el('pf-rates-status').textContent = FIELDS.length === ALL_FIELDS
          ? 'Saved. Every trade bid calculator here opens with these.'
          : 'Saved. Every trade bid calculator here that asks for them opens with these.';
        return;
      }

      if (name === 'apply') {
        var saved = read();
        if (!saved) return;
        bump('shop_rates_applied');
        render(saved, applyRates(saved, true));
        el('pf-rates-status').textContent = 'Repriced with your rates.';
        return;
      }

      if (name === 'clear') {
        try { if (store) store.removeItem(KEY); } catch (e) {}
        bump('shop_rates_cleared');
        render(null, null);
        el('pf-rates-status').textContent = 'Forgotten. The numbers on this bid are unchanged.';
      }
    });
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
`;

/**
 * The shop-rates script as one file, for the whole site.
 *
 * It was written into all 105 pages carrying the bar — **781 KiB of the built
 * site**, the same ~7.5 KB of JavaScript over and over, paid for on every page
 * load and again by every tool a contractor saves for offline use. One file at
 * the root is fetched once and served from cache for every tool after the
 * first, which is exactly the journey this bar exists to serve: the second
 * calculator someone crosses to.
 *
 * Still stripped of its prose, and for the guarantee rather than the bytes —
 * `stripForInjection` is what proves no line of the shipped source opens a
 * template literal it does not close.
 */
export const SHOP_RATES_MODULE_FILE = 'pf-rates.js';

/** The contents of that file. Written once by the build, at the site root. */
export function renderShopRatesModule() {
  return `${stripForInjection(RATES_SCRIPT())}\n`;
}

/**
 * The bar's stylesheet, extracted for the same reason and on the same terms.
 * Nothing in it was ever per-page.
 */
export const SHOP_RATES_STYLE_FILE = 'pf-rates.css';

/** The contents of that file. Written once by the build, at the site root. */
export function renderShopRatesStyle() {
  return RATES_CSS.trimStart();
}

/**
 * Add the shop-rates bar to one already-published page.
 *
 * Returns the html unchanged when the page carries no reviewed set of shop-rate
 * fields (`pageTakesShopRates`), when there is no `<body>` to attach to, or
 * when the bar is already there — the pass has to be safe to run twice.
 *
 * `slug` selects the page's verified aliases and its partial-page note, so the
 * bar offers exactly the fields that page was read to carry and says why any
 * of the four is absent.
 *
 * Placed directly after the navigation chrome rather than inside the form,
 * because the form is the one part of these pages that is genuinely different
 * from venture to venture: there is no element every calculator has in the same
 * place, and a regex that guessed would put the control somewhere different on
 * each of thirty-six tools. Under the nav it is the first thing below the site
 * bar on every one of them.
 */
export function injectShopRates(html, slug = '', toRoot = './') {
  if (typeof html !== 'string') return html;
  if (html.includes(SHOP_RATES_MARKER)) return html;

  if (!pageTakesShopRates(html, slug)) return html;
  const fields = pageShopRateFields(html, slug);

  const bodyOpen = html.match(/<body[^>]*>/i);
  if (!bodyOpen || !/<\/body>/i.test(html)) return html;

  const markup = RATES_MARKUP(fields, PARTIAL_SHOP_RATE_PAGES[slug] ?? '');
  // A link now, not a `<style>` body: one file at the site root, cached across
  // every tool a contractor opens. See `SHOP_RATES_STYLE_FILE`.
  const styleLink =
    `<link rel="stylesheet" href="${attr(toRoot + SHOP_RATES_STYLE_FILE)}">`;
  const withStyle = html.replace(/<\/head>/i, `${styleLink}\n</head>`);
  // A page with no <head> still gets the stylesheet, ahead of the bar it styles.
  const stylePrefix = withStyle === html ? `${styleLink}\n` : '';

  const nav = withStyle.match(/<nav class="pf-chrome pf-chrome-top"[\s\S]*?<\/nav>/i);
  const anchored = nav
    ? withStyle.replace(nav[0], `${nav[0]}\n${stylePrefix}${markup}`)
    : withStyle.replace(bodyOpen[0], `${bodyOpen[0]}\n${stylePrefix}${markup}`);

  // A tag, not a body. The script is one file at the site root now — see
  // `renderShopRatesModule` — and the field pairs are the only thing that
  // varies per page.
  //
  // `type="module"` is kept from when this was inline, and for the same reason:
  // module scripts are deferred and run in document order, so this one, last in
  // the document, sees a form the venture's own deferred module has finished
  // building. A classic external script would run the moment it arrived.
  const pairs = fields.map((field) => `${field.id}:${field.inputId || field.id}`).join(',');
  const tag = `<script type="module" src="${attr(toRoot + SHOP_RATES_MODULE_FILE)}"` +
    ` ${RATES_FIELDS_ATTR}="${attr(pairs)}"></script>`;

  return anchored.replace(/<\/body>/i, `${tag}\n</body>`);
}
