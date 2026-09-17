// The failure this suite exists to prevent is silent.
//
// The media kit generator parses its rate card out of a pipe-delimited text
// block, positionally: `service | price`. A handoff that emitted the two the
// other way round, or that lost a pipe, would not error anywhere. It would
// build a media kit -- the file a creator sends to a brand -- with a price
// where the deliverable name belongs, or with "$380" as the name of a
// service. `parsePipeList` skips nothing and complains about nothing.
//
// `where-to-sell-calculator/handoff.test.mjs` guards the equivalent hazard on
// the other side of the portfolio by importing each target's own *field list*.
// The hazard here is a *format* rather than a name, so this suite imports the
// receiver's own parsers and asserts that what this module emits parses back
// into the values it was built from. A change to either side's format then
// fails here, rather than shipping a wrong rate card to a brand.

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
import { DELIVERABLES, PLATFORMS, PLATFORM_LABELS, computeRates } from "./calculator.mjs";

// The receiving venture's own parsers and field list, imported rather than
// restated -- that is the whole point of this file.
import { parsePlatforms, parseRates, validateMediaKit } from "../influencer-media-kit-generator/generator.mjs";
import { STRING_FIELDS } from "../influencer-media-kit-generator/state.mjs";

const EXAMPLE = { followers: 45000, engagementRate: 4.5, platform: "instagram" };

test("the fields this module fills are fields the media kit form actually has", () => {
  assert.ok(STRING_FIELDS.includes(HANDOFF.platformsField));
  assert.ok(STRING_FIELDS.includes(HANDOFF.ratesField));
});

test("every deliverable the calculator prices has rate-card wording", () => {
  for (const deliverable of DELIVERABLES) {
    for (const platform of PLATFORMS) {
      const service = rateCardService(platform, deliverable);
      assert.ok(service, `no rate-card wording for ${platform}/${deliverable}`);
      assert.ok(!service.includes("|"), "a pipe in a service name would forge a column");
    }
  }
});

test("the platform prefixes each deliverable, except for other/multiple", () => {
  assert.equal(rateCardService("instagram", "post"), "Instagram feed post");
  assert.equal(rateCardService("youtube", "video"), "YouTube dedicated long-form video");
  // "Other / multiple platforms feed post" would read as nonsense on a rate
  // card a brand opens, so that option drops the prefix.
  assert.equal(rateCardService("general", "post"), "Feed post");
  assert.equal(rateCardService("general", "reel"), "Reel / short-form video");
});

test("an unknown platform is treated as other/multiple rather than crashing", () => {
  assert.equal(rateCardService("myspace", "post"), "Feed post");
  assert.equal(buildPlatformsBlock({ ...EXAMPLE, platform: "myspace" }).split("|")[0].trim(),
    PLATFORM_LABELS.general);
});

test("the platform line parses back into the receiver's own named fields", () => {
  const block = buildPlatformsBlock(EXAMPLE);
  const [row, ...rest] = parsePlatforms(block);
  assert.equal(rest.length, 0, "one account entered here is one platform row there");
  assert.equal(row.platform, "Instagram");
  assert.equal(row.followers, "45000");
  assert.equal(row.engagement, "4.5%");
});

test("the follower count travels as plain digits, so a handoff kit and a typed one match", () => {
  // `toLocaleString` here would emit "45,000" while someone typing the same
  // account into the form by hand writes "45000" -- two media kits from the
  // same numbers that do not look alike.
  assert.ok(buildPlatformsBlock(EXAMPLE).includes("| 45000 |"));
});

test("a trailing zero or float artefact does not reach the kit", () => {
  assert.ok(buildPlatformsBlock({ ...EXAMPLE, engagementRate: 4.0 }).endsWith("| 4%"));
  assert.ok(buildPlatformsBlock({ ...EXAMPLE, engagementRate: 0.1 + 0.2 }).endsWith("| 0.3%"));
});

test("no platform line at all when the numbers behind it were never entered", () => {
  assert.equal(buildPlatformsBlock({ ...EXAMPLE, followers: 0 }), "");
  assert.equal(buildPlatformsBlock({ ...EXAMPLE, engagementRate: 0 }), "");
  assert.equal(buildPlatformsBlock({}), "");
});

test("the rate card parses back into service/price pairs in the right columns", () => {
  const result = computeRates(EXAMPLE);
  const rows = parseRates(buildRatesBlock({ platform: EXAMPLE.platform, rates: result.rates }));
  assert.equal(rows.length, DELIVERABLES.length);
  for (const row of rows) {
    // The service is a name, the price is money. Swapped columns fail here.
    assert.ok(/^Instagram /.test(row.service), `service column held ${row.service}`);
    assert.ok(/^\$[\d,]+ – \$[\d,]+$/.test(row.price), `price column held ${row.price}`);
  }
  assert.deepEqual(
    rows.map((r) => r.service),
    DELIVERABLES.map((d) => rateCardService(EXAMPLE.platform, d)),
  );
});

test("the range travels, not a point estimate", () => {
  // This calculator's own page says its output is a starting point for a
  // negotiation and never a quote. Collapsing the range on the way into a
  // document a brand reads would make a claim the tool refuses to make.
  const result = computeRates(EXAMPLE);
  const rows = parseRates(buildRatesBlock({ platform: EXAMPLE.platform, rates: result.rates }));
  const post = rows.find((r) => r.service === "Instagram feed post");
  assert.equal(post.price, formatRange(result.rates.post.low, result.rates.post.high));
  assert.notEqual(result.rates.post.low, result.rates.post.high);
});

test("a deliverable priced at zero is left out rather than shipped as $0", () => {
  const rates = { post: { low: 0, high: 0 }, story: { low: 10, high: 20 } };
  const rows = parseRates(buildRatesBlock({ platform: "instagram", rates }));
  assert.deepEqual(rows.map((r) => r.service), ["Instagram Story"]);
});

test("nothing to hand over means no link at all", () => {
  const empty = computeRates({ followers: 0, engagementRate: 0, platform: "instagram" });
  assert.equal(buildHandoffFields({ followers: 0, engagementRate: 0, platform: "instagram" }, empty), null);
  assert.equal(handoffUrl({ followers: 0, engagementRate: 0, platform: "instagram" }, empty), null);
});

test("the link is relative and carries its values in the fragment", () => {
  const url = handoffUrl(EXAMPLE, computeRates(EXAMPLE));
  // Relative so it works under the GitHub Pages project path, under a custom
  // domain later, and from a local static server.
  assert.ok(url.startsWith(`../${HANDOFF.slug}/#`), url.slice(0, 60));
  // In the fragment, which browsers do not send to any server -- this venture
  // promises the numbers never leave the device.
  assert.ok(!url.includes("?"));
  const params = new URLSearchParams(url.slice(url.indexOf("#") + 1));
  assert.ok(params.get(HANDOFF.platformsField).includes("Instagram"));
  assert.equal(params.get(HANDOFF.ratesField).split("\n").length, DELIVERABLES.length);
});

test("a real handoff clears both media-kit warnings it exists to clear", () => {
  // The user-visible point of this feature, asserted against the receiver's
  // own validator rather than described in a comment.
  const fields = buildHandoffFields(EXAMPLE, computeRates(EXAMPLE));
  const before = validateMediaKit({ creatorName: "Jamie Rivers", bio: "Travel and food." });
  const after = validateMediaKit({ creatorName: "Jamie Rivers", bio: "Travel and food.", ...fields });

  assert.ok(before.warnings.some((w) => w.includes("No platforms listed")));
  assert.ok(before.warnings.some((w) => w.includes("No rate card")));
  assert.ok(!after.warnings.some((w) => w.includes("No platforms listed")));
  assert.ok(!after.warnings.some((w) => w.includes("No rate card")));
});

test("every platform the calculator offers produces a usable handoff", () => {
  for (const platform of PLATFORMS) {
    const input = { ...EXAMPLE, platform };
    const fields = buildHandoffFields(input, computeRates(input));
    assert.ok(fields, `no handoff for ${platform}`);
    assert.equal(parsePlatforms(fields[HANDOFF.platformsField]).length, 1);
    assert.equal(parseRates(fields[HANDOFF.ratesField]).length, DELIVERABLES.length);
  }
});
