// Three failures this suite exists to prevent.
//
// **A row in the wrong column.** The media kit parses its rate card
// positionally out of pipe-delimited text, so a line emitted the wrong way
// round puts a price where the placement name belongs — in a file a sponsor
// reads — and `parsePipeList` complains about nothing. Guarded by importing
// the receiver's own parsers and asserting the emitted text parses back into
// the values it was built from.
//
// **Two senders drifting apart.** `brand-deal-rate-calculator` hands off to
// the same form. They are siblings rather than copies — different fields,
// different labels, a different metric — but the *wire contract* has to stay
// identical or a creator with both a social audience and a list gets one
// working link and one that quietly fills nothing. So this suite imports that
// module too and asserts the two agree.
//
// **An open rate described as engagement.** The receiver appends the word
// "engagement" to a bare figure, which is right for a social account and wrong
// for a list. Asserted against the receiver's own renderer, not by reading
// this module's output.

import test from "node:test";
import assert from "node:assert/strict";

import {
  HANDOFF,
  buildHandoffFields,
  buildPlatformsBlock,
  buildRatesBlock,
  formatRange,
  handoffUrl,
  rateCardService,
} from "./handoff.mjs";
import { NICHES, PLACEMENTS, computeRates } from "./calculator.mjs";

// The receiving venture's own parsers, validator and renderer.
import {
  buildOneSheetText,
  engagementLabel,
  parsePlatforms,
  parseRates,
  validateMediaKit,
} from "../influencer-media-kit-generator/generator.mjs";
import { STRING_FIELDS } from "../influencer-media-kit-generator/state.mjs";

// The sibling sender, imported to pin the shared contract.
import {
  HANDOFF as SOCIAL_HANDOFF,
  buildHandoffFields as socialHandoffFields,
  handoffUrl as socialHandoffUrl,
} from "../brand-deal-rate-calculator/handoff.mjs";
import { computeRates as socialComputeRates } from "../brand-deal-rate-calculator/calculator.mjs";

const EXAMPLE = { subscribers: 12000, openRate: 42, niche: "tech" };

test("the fields this module fills are fields the media kit form actually has", () => {
  assert.ok(STRING_FIELDS.includes(HANDOFF.platformsField));
  assert.ok(STRING_FIELDS.includes(HANDOFF.ratesField));
});

test("the two senders agree on the wire contract", () => {
  // A creator with a social audience and a list uses both. If these drift,
  // one link works and the other silently fills nothing.
  assert.equal(HANDOFF.slug, SOCIAL_HANDOFF.slug);
  assert.equal(HANDOFF.platformsField, SOCIAL_HANDOFF.platformsField);
  assert.equal(HANDOFF.ratesField, SOCIAL_HANDOFF.ratesField);

  const mine = handoffUrl(EXAMPLE, computeRates(EXAMPLE));
  const theirs = socialHandoffUrl(
    { followers: 45000, engagementRate: 4.5, platform: "instagram" },
    socialComputeRates({ followers: 45000, engagementRate: 4.5, platform: "instagram" }),
  );
  for (const url of [mine, theirs]) {
    assert.ok(url.startsWith(`../${HANDOFF.slug}/#`), url.slice(0, 50));
    assert.ok(!url.includes("?"), "values must ride in the fragment, never the query");
  }
});

test("every placement the calculator prices has rate-card wording", () => {
  for (const placement of PLACEMENTS) {
    const service = rateCardService(placement);
    assert.ok(service, `no rate-card wording for ${placement}`);
    assert.ok(!service.includes("|"), "a pipe in a service name would forge a column");
  }
  assert.equal(rateCardService("billboard"), null);
});

test("the reach line parses back into the receiver's own named fields", () => {
  const [row, ...rest] = parsePlatforms(buildPlatformsBlock(EXAMPLE));
  assert.equal(rest.length, 0);
  assert.equal(row.platform, "Newsletter (Tech / SaaS / startups)");
  assert.equal(row.followers, "12000");
  assert.equal(row.engagement, "42% open");
});

test("an open rate is not described as engagement in the kit", () => {
  // Asserted through the receiver's own renderer rather than by inspecting
  // this module's string: what matters is what the sponsor reads.
  const { engagement } = parsePlatforms(buildPlatformsBlock(EXAMPLE))[0];
  assert.equal(engagementLabel(engagement), "42% open");
  // ...while a bare figure, which is what a social account sends, still gets
  // the word. The two senders must both read correctly in one kit.
  assert.equal(engagementLabel("4.5%"), "4.5% engagement");
});

test("the general niche does not parenthesise itself", () => {
  assert.ok(buildPlatformsBlock({ ...EXAMPLE, niche: "general" }).startsWith("Newsletter | "));
  // An unknown niche falls back to general rather than printing `undefined`.
  assert.ok(buildPlatformsBlock({ ...EXAMPLE, niche: "cryptids" }).startsWith("Newsletter | "));
});

test("subscribers travel as plain digits and the rate without float artefacts", () => {
  assert.ok(buildPlatformsBlock(EXAMPLE).includes("| 12000 |"));
  assert.ok(buildPlatformsBlock({ ...EXAMPLE, openRate: 42.0 }).endsWith("| 42% open"));
  assert.ok(buildPlatformsBlock({ ...EXAMPLE, openRate: 0.1 + 0.2 }).endsWith("| 0.3% open"));
});

test("no reach line when the numbers behind it were never entered", () => {
  assert.equal(buildPlatformsBlock({ ...EXAMPLE, subscribers: 0 }), "");
  assert.equal(buildPlatformsBlock({ ...EXAMPLE, openRate: 0 }), "");
  assert.equal(buildPlatformsBlock({}), "");
});

test("the rate card parses back into service/price pairs in the right columns", () => {
  const rows = parseRates(buildRatesBlock(computeRates(EXAMPLE)));
  assert.equal(rows.length, PLACEMENTS.length);
  for (const row of rows) {
    assert.ok(/^Newsletter /.test(row.service), `service column held ${row.service}`);
    assert.ok(/^\$[\d,]+ – \$[\d,]+$/.test(row.price), `price column held ${row.price}`);
  }
  assert.deepEqual(rows.map((r) => r.service), PLACEMENTS.map(rateCardService));
});

test("the range travels, not a point estimate", () => {
  const result = computeRates(EXAMPLE);
  const rows = parseRates(buildRatesBlock(result));
  const dedicated = rows.find((r) => r.service === "Newsletter dedicated send");
  assert.equal(dedicated.price, formatRange(result.rates.dedicated.low, result.rates.dedicated.high));
  assert.notEqual(result.rates.dedicated.low, result.rates.dedicated.high);
});

test("a placement priced at zero is left out rather than shipped as $0", () => {
  const rows = parseRates(buildRatesBlock({
    rates: { dedicated: { low: 0, high: 0 }, primary: { low: 40, high: 90 } },
  }));
  assert.deepEqual(rows.map((r) => r.service), ["Newsletter primary placement"]);
});

test("nothing to hand over means no link at all", () => {
  const blank = { subscribers: 0, openRate: 0, niche: "general" };
  assert.equal(buildHandoffFields(blank, computeRates(blank)), null);
  assert.equal(handoffUrl(blank, computeRates(blank)), null);
});

test("every niche the calculator offers produces a usable handoff", () => {
  for (const niche of NICHES) {
    const input = { ...EXAMPLE, niche };
    const fields = buildHandoffFields(input, computeRates(input));
    assert.ok(fields, `no handoff for ${niche}`);
    assert.equal(parsePlatforms(fields[HANDOFF.platformsField]).length, 1);
    assert.equal(parseRates(fields[HANDOFF.ratesField]).length, PLACEMENTS.length);
  }
});

test("a handoff clears both media-kit warnings it exists to clear", () => {
  const fields = buildHandoffFields(EXAMPLE, computeRates(EXAMPLE));
  const base = { creatorName: "Jamie Rivers", bio: "Weekly tech newsletter." };
  const before = validateMediaKit(base);
  const after = validateMediaKit({ ...base, ...fields });

  assert.ok(before.warnings.some((w) => w.includes("No platforms listed")));
  assert.ok(before.warnings.some((w) => w.includes("No rate card")));
  assert.ok(!after.warnings.some((w) => w.includes("No platforms listed")));
  assert.ok(!after.warnings.some((w) => w.includes("No rate card")));
});

test("both senders' rows coexist in one kit, each reading correctly", () => {
  // The payoff of the receiver being append-only: an operator with a list and
  // a social audience follows both links and gets one kit, not two halves.
  const social = { followers: 45000, engagementRate: 4.5, platform: "instagram" };
  const mine = buildHandoffFields(EXAMPLE, computeRates(EXAMPLE));
  const theirs = socialHandoffFields(social, socialComputeRates(social));

  const combined = {
    creatorName: "Jamie Rivers",
    bio: "Weekly tech newsletter, plus a travel account.",
    platformsRaw: `${theirs.platformsRaw}\n${mine.platformsRaw}`,
    ratesRaw: `${theirs.ratesRaw}\n${mine.ratesRaw}`,
  };
  assert.equal(parsePlatforms(combined.platformsRaw).length, 2);
  assert.equal(parseRates(combined.ratesRaw).length, 4 + PLACEMENTS.length);

  const sheet = buildOneSheetText(combined);
  assert.match(sheet, /4\.5% engagement/);
  assert.match(sheet, /42% open(?! engagement)/);
  assert.match(sheet, /Instagram feed post/);
  assert.match(sheet, /Newsletter dedicated send/);
});
