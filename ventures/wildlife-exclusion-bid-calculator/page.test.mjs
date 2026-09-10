// Structural assertions about the two published pages, plus a numeric check
// that every figure quoted in prose on the companion page is still what
// calc.mjs actually produces. The class of bug this catches is a number
// written into prose that the arithmetic no longer produces once calc.mjs
// changes — the same restate-instead-of-import defect CLAUDE.md records
// against the front-door mirror, in the one place where the restatement is
// unavoidable because prose cannot import.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { calculateBid, flatFeeGap, HEIGHT_TIERS, SPECIES_PRESETS } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./what-to-charge-for-wildlife-exclusion.html', import.meta.url), 'utf8');
const PAGES = [
  ['index', index],
  ['what-to-charge-for-wildlife-exclusion', article],
];

// The worked example both pages describe in prose: the index page's own
// opening form defaults, which is why every value below is also asserted to
// be the literal default on the corresponding input.
const WORKED_EXAMPLE = {
  species: 'raccoon',
  heightTier: 'two',
  scheduledMonth: 10,
  crewSize: 2,
  trapCheckCrewSize: 1,
  hourlyWage: 25,
  burdenRate: 52,
  milesOneWay: 14,
  ratePerMile: 0.85,
  driveMinutesOneWay: 22,
  separateInspection: true,
  inspectionMinutes: 45,
  inspectionBillable: false,
  trapsSet: 3,
  trapSetMinutes: 12,
  trapDays: 5,
  trapChecksPerDay: 1,
  minutesPerTrapCheck: 25,
  consumablesPerTrap: 7,
  exclusionLinearFeet: 45,
  exclusionMinutesPerFoot: 1.4,
  exclusionMaterialPerFoot: 3.2,
  oneWayDoors: 1,
  doorMinutesEach: 35,
  doorCostEach: 45,
  doorRemovalVisit: true,
  doorRemovalMinutes: 25,
  liftRentalCost: 350,
  deconSquareFeet: 250,
  deconMinutesPer100SqFt: 45,
  deconMaterialPer100SqFt: 55,
  insulationRemoveSqFt: 250,
  insulationRemoveCostPerSqFt: 1.4,
  insulationReplaceSqFt: 250,
  insulationReplaceCostPerSqFt: 1.9,
  disposalFee: 90,
  repairCost: 160,
  warrantyYears: 3,
  warrantyReservePct: 8,
  overheadRate: 14,
  targetMargin: 22,
  proposedPrice: null,
};

const money = (value) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// --- the pages open on the worked example ----------------------------------

test('the form defaults on index.html are the worked example', () => {
  const NUMERIC_DEFAULTS = [
    ['crewSize', '2'], ['trapCheckCrewSize', '1'], ['hourlyWage', '25'], ['burdenRate', '52'],
    ['milesOneWay', '14'], ['ratePerMile', '0.85'], ['driveMinutesOneWay', '22'],
    ['inspectionMinutes', '45'],
    ['trapsSet', '3'], ['trapSetMinutes', '12'], ['trapDays', '5'],
    ['trapChecksPerDay', '1'], ['minutesPerTrapCheck', '25'], ['consumablesPerTrap', '7'],
    ['exclusionLinearFeet', '45'], ['exclusionMinutesPerFoot', '1.4'], ['exclusionMaterialPerFoot', '3.20'],
    ['oneWayDoors', '1'], ['doorMinutesEach', '35'], ['doorCostEach', '45'],
    ['doorRemovalMinutes', '25'], ['liftRentalCost', '350'],
    ['deconSquareFeet', '250'], ['deconMinutesPer100SqFt', '45'], ['deconMaterialPer100SqFt', '55'],
    ['insulationRemoveSqFt', '250'], ['insulationRemoveCostPerSqFt', '1.40'],
    ['insulationReplaceSqFt', '250'], ['insulationReplaceCostPerSqFt', '1.90'],
    ['disposalFee', '90'], ['repairCost', '160'],
    ['warrantyYears', '3'], ['warrantyReservePct', '8'], ['overheadRate', '14'], ['targetMargin', '22'],
    ['flatFee', '395'],
  ];
  for (const [id, expected] of NUMERIC_DEFAULTS) {
    const pattern = new RegExp(`id="${id}"[^>]*value="${expected.replace('.', '\\.')}"`);
    assert.match(index, pattern, `${id} should default to ${expected}`);
  }
});

test('the selects default to the worked example species, tier and month', () => {
  assert.match(index, /fill\(el\('species'\)[^;]*'raccoon'\)/s);
  assert.match(index, /fill\(el\('heightTier'\)[^;]*'two'\)/s);
  assert.match(index, /fill\(el\('scheduledMonth'\)[^;]*'10'\)/s);
});

test('the checkbox defaults match: inspection is a separate free trip, devices get pulled', () => {
  assert.match(index, /id="separateInspection"[^>]*checked/);
  assert.match(index, /id="doorRemovalVisit"[^>]*checked/);
  // Deliberately unchecked: the free inspection is the point of that line.
  assert.doesNotMatch(index, /id="inspectionBillable"[^>]*checked/);
});

// --- the prose figures are the arithmetic ----------------------------------

test('every currency figure the article quotes is what calc.mjs produces', () => {
  const result = calculateBid(WORKED_EXAMPLE);
  const gap = flatFeeGap(395, result);

  const quoted = [
    ['walk-away price', result.breakEvenPrice],
    ['bid at target margin', result.price],
    ['direct cost', result.directCost],
    ['labor subtotal', result.laborCost],
    ['drive labor', result.driveLaborCost],
    ['inspection labor', result.inspectionLaborCost],
    ['seal labor', result.exclusionLaborCost],
    ['trapping labor', result.trapLaborCost],
    ['decon labor', result.deconLaborCost],
    ['vehicle', result.vehicleCost],
    ['decon material', result.deconMaterialCost],
    ['insulation', result.insulationCost],
    ['overhead', result.overhead],
    ['warranty reserve', result.warrantyReserve],
    ['flat-fee shortfall', gap.shortfall],
  ];
  for (const [label, value] of quoted) {
    assert.ok(article.includes(`$${money(value)}`), `article is missing the ${label}, $${money(value)}`);
  }
});

test('the grouped figures the article quotes are the sums it says they are', () => {
  const result = calculateBid(WORKED_EXAMPLE);

  const sealMaterial = result.exclusionMaterialCost + result.doorMaterialCost + result.trapConsumablesCost;
  const disposalAndRepair = result.disposalFee + result.liftCost + result.repairCost;
  const warrantedWork = result.exclusionLaborCost + result.exclusionMaterialCost + result.doorMaterialCost;

  assert.ok(article.includes(`$${money(sealMaterial)}`), 'seal material + device + bait');
  assert.ok(article.includes(`$${money(disposalAndRepair)}`), 'disposal + repair');
  assert.ok(article.includes(`$${money(warrantedWork)}`), 'the warranted-work base for the reserve');

  // The lift is deliberately not in that disposal line: the worked example is
  // on the two-story tier, which needs no lift, so a $350 rental sitting in
  // the form must not reach the bid.
  assert.equal(result.liftCost, 0);
});

test('the ground-versus-two-story comparison in the article is real', () => {
  const two = calculateBid(WORKED_EXAMPLE);
  const ground = calculateBid({ ...WORKED_EXAMPLE, heightTier: 'ground' });
  assert.ok(article.includes(`$${money(ground.exclusionLaborCost)}`), 'ground-level seal labor');
  assert.ok(article.includes(`$${money(two.exclusionLaborCost)}`), 'two-story seal labor');
  // And the multiplier the article names.
  assert.ok(article.includes('1.7'), 'the article names the two-story multiplier');
  assert.equal(two.reachMultiplier, 1.7);
});

test('the visit count, mileage and per-hour figures in the article are real', () => {
  const result = calculateBid(WORKED_EXAMPLE);
  assert.equal(result.totalVisits, 8);
  assert.equal(result.trapCheckVisits, 5);
  assert.ok(article.includes('224'), 'the article names the mileage');
  assert.equal(result.totalMiles, 224);
  assert.ok(article.includes(`$${money(result.pricePerCrewHour)}`), 'price per crew hour');
  assert.ok(article.includes('23.6'), 'the article names the crew hours');
  assert.equal(result.crewHours.toFixed(1), '23.6');
});

test('the worked example raises no flag, so the article is not describing a broken bid', () => {
  const result = calculateBid(WORKED_EXAMPLE);
  assert.equal(result.maternitySeasonRisk, false);
  assert.equal(result.trapsWithoutChecks, false);
  assert.equal(result.doorsWithoutRemoval, false);
  assert.equal(result.warrantyWithoutReserve, false);
  assert.equal(result.trapsOnUntrappedSpecies, false);
});

// --- the published-page contract -------------------------------------------

test('both pages carry the no-warranty clause PRODUCT_PLAYBOOK 5b requires', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /No warranty\./, `${name} is missing the no-warranty clause`);
    assert.match(html, /not legal, wildlife-regulation/, `${name} does not say what it is not advice about`);
    assert.match(html, /accept no liability/, `${name} is missing the liability limitation`);
  }
});

test('both pages disclaim being a determination about when a species may be excluded', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /state wildlife agency/, `${name} should send the reader to their own agency`);
  }
});

test('both pages carry a canonical link, a description and structured data', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /<link rel="canonical"/, `${name} has no canonical`);
    assert.match(html, /<meta name="description"/, `${name} has no description`);
    assert.match(html, /application\/ld\+json/, `${name} has no structured data`);
  }
});

test('every ld+json block on both pages parses', () => {
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  for (const [name, html] of PAGES) {
    const blocks = [...html.matchAll(pattern)];
    assert.ok(blocks.length > 0, `${name} has no structured data`);
    for (const [, body] of blocks) {
      assert.doesNotThrow(() => JSON.parse(body), `${name} has an unparseable ld+json block`);
    }
  }
});

test('the two pages link to each other', () => {
  assert.match(index, /href="\.\/what-to-charge-for-wildlife-exclusion\.html"/);
  assert.match(article, /href="\.\/"/);
});

test('the sitemap lists both published pages and nothing that did not ship', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /wildlife-exclusion-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /what-to-charge-for-wildlife-exclusion\.html<\/loc>/);
});

// --- privacy and the counter ------------------------------------------------

test('the page makes no network request of any kind', () => {
  for (const [name, html] of PAGES) {
    assert.doesNotMatch(html, /\bfetch\s*\(/, `${name} should make no fetch`);
    assert.doesNotMatch(html, /XMLHttpRequest/, `${name} should make no XHR`);
    assert.doesNotMatch(html, /navigator\.sendBeacon/, `${name} should send no beacon`);
    // No third-party script or style, which is what makes "nothing leaves your
    // browser" true rather than aspirational.
    assert.doesNotMatch(html, /<script[^>]+src="https?:/, `${name} loads a remote script`);
    assert.doesNotMatch(html, /<link[^>]+href="https?:[^"]*\.css/, `${name} loads a remote stylesheet`);
  }
});

test('the privacy note names every usage event the page can record', () => {
  // Event names are literals in the submit handler; a new one that the footer
  // does not disclose is an undisclosed count, which is the bug this catches.
  const events = [...index.matchAll(/count\('([a-z_]+)'\)/g)].map((match) => match[1]);
  const unique = [...new Set(events)].sort();
  assert.deepEqual(unique, [
    'bid_calculated', 'company_forgotten', 'flat_fee_compared',
    'proposal_printed', 'proposed_price_compared',
  ]);
  // Each one named in the footer, not just tallied. Adopting the customer
  // proposal added two events to this page without touching the footer; a
  // count nobody disclosed is exactly the bug this assertion is for.
  for (const event of unique) {
    assert.ok(index.includes(`<code>${event}</code>`), `the privacy note does not name ${event}`);
  }
  assert.match(index, /Do not keep anonymous local usage counts/);
  assert.match(index, /Do Not Track or Global Privacy Control/);
});

test('the opt-out is on the page and the counter reads it', () => {
  assert.match(index, /id="usageOptOut"/);
  assert.match(index, /recordUsage\(localStorage, optedOut\(\), event\)/);
});

// --- the flags are prompts, never determinations ----------------------------

test('every flag message on the page is worded as a prompt, not a ruling', () => {
  // The maternity flag is the one that could be misread as legal advice, so it
  // has to carry the disclaimer in the message itself, not only in the footer.
  assert.match(index, /this is a prompt, not a legal determination/);
  assert.match(index, /Confirm the window with your state wildlife agency/);
});

test('the page builds every flag and option as a text node, never as markup', () => {
  // Preset labels and flag text come from calc.mjs; interpolating them into
  // innerHTML would be the one place a label could become script.
  assert.match(index, /option\.textContent = entry\.label/);
  assert.match(index, /li\.textContent = message/);
});

// --- the presets the page offers are the ones calc.mjs knows ----------------

test('the page offers exactly the species and tiers calc.mjs defines', () => {
  // Built from the imported constants rather than hand-listed in markup, so
  // this asserts the page did not fork the list.
  assert.match(index, /SPECIES_PRESETS\.map/);
  assert.match(index, /HEIGHT_TIERS\.map/);
  assert.doesNotMatch(index, /<option value="raccoon"/, 'species options must come from calc.mjs, not markup');
  assert.ok(SPECIES_PRESETS.length >= 5);
  assert.ok(HEIGHT_TIERS.length >= 5);
});

test('every input the page reads is a field calculateBid accepts', () => {
  // COST_IDS is what the page hands to calculateBid. A name here that the
  // calculator does not read is a figure the operator types and the bid
  // silently ignores — the same silent-drop bug share.mjs shipped once.
  const block = index.match(/const COST_IDS = \[([\s\S]*?)\];/);
  assert.ok(block, 'COST_IDS should be present');
  const ids = [...block[1].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);
  assert.ok(ids.length > 30, `expected the full input list, saw ${ids.length}`);

  const probe = { ...WORKED_EXAMPLE };
  const baseline = calculateBid(probe).price;
  for (const id of ids) {
    assert.ok(id in probe || id === 'proposedPrice', `calculateBid has no input named ${id}`);
  }
  assert.ok(baseline > 0);
});
