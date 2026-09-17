// Two failures this suite exists to prevent, and they pull in opposite
// directions.
//
// The first is **destroying work**. A creator can arrive here with a draft
// they have spent twenty minutes on. A prefill that replaced the rate card
// with an incoming one would take that away with no error and no undo, and
// the autosave would then write the loss to localStorage. Every test below
// that merges into a non-empty field is guarding that.
//
// The second is **trusting the link**. A fragment is whatever was in the URL
// someone clicked, and it lands in a form whose output is a file the creator
// sends to a brand. So the size caps, the control-character stripping, and
// the field allowlist are checked here rather than assumed.

import test from "node:test";
import assert from "node:assert/strict";

import {
  LIMITS,
  PREFILLABLE,
  applyHandoff,
  cleanBlock,
  describeHandoff,
  mergeLines,
  readHandoff,
} from "./prefill.mjs";
import { STRING_FIELDS } from "./state.mjs";
import { parsePlatforms, parseRates } from "./generator.mjs";

const link = (fields) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v);
  return `#${params.toString()}`;
};

const RATES = [
  "Instagram feed post | $380 – $620",
  "Instagram Story | $150 – $300",
].join("\n");

test("every prefillable field is a field the form actually has", () => {
  for (const field of PREFILLABLE) assert.ok(STRING_FIELDS.includes(field), field);
});

test("a handoff link round-trips into the receiver's own parsers", () => {
  const handoff = readHandoff(link({ platformsRaw: "Instagram | 45000 | 4.5%", ratesRaw: RATES }));
  assert.equal(parsePlatforms(handoff.platformsRaw)[0].followers, "45000");
  assert.deepEqual(parseRates(handoff.ratesRaw).map((r) => r.price), ["$380 – $620", "$150 – $300"]);
});

test("no fragment, an empty one, or one with nothing usable reads as no handoff", () => {
  assert.equal(readHandoff(""), null);
  assert.equal(readHandoff("#"), null);
  assert.equal(readHandoff(undefined), null);
  assert.equal(readHandoff("#platformsRaw="), null);
  // An ordinary in-page anchor is not a handoff.
  assert.equal(readHandoff("#rate-card"), null);
});

test("a link may only fill the two prefillable fields", () => {
  // `bio` and `contactEmail` are real form fields, so nothing would reject
  // them downstream -- a link that could write them could put words in a
  // creator's mouth or a stranger's address in their partnerships contact.
  const handoff = readHandoff(link({
    platformsRaw: "Instagram | 45000 | 4.5%",
    bio: "Text the creator never wrote.",
    contactEmail: "attacker@example.com",
  }));
  assert.deepEqual(Object.keys(handoff), ["platformsRaw"]);
});

test("control and bidi characters are stripped rather than carried into the kit", () => {
  // A right-to-left override can make a price render as a different number
  // than it is -- in a file a brand reads and pays against.
  const RLO = "\u202E";
  const cleaned = cleanBlock(`Instagram | 45000 | 4.5% ${RLO}$999\u0007`);
  assert.equal(cleaned, "Instagram | 45000 | 4.5% $999");
  // Nothing outside printable text survives, on any line. The `\n` that
  // separates rows is excluded: it is the block's own structure, not content
  // that arrived inside a value.
  for (const line of cleanBlock(`a${RLO}b\u0000c\nd\u200Be`).split("\n")) {
    assert.ok(!/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/.test(line), line);
  }
});

test("line count, line length and total size are capped", () => {
  const many = Array.from({ length: LIMITS.maxLines + 40 }, (_, i) => `Row ${i} | $1`).join("\n");
  assert.equal(cleanBlock(many).split("\n").length, LIMITS.maxLines);

  const long = `A${"x".repeat(LIMITS.maxLineLength * 3)} | $1`;
  assert.equal(cleanBlock(long).length, LIMITS.maxLineLength);

  const huge = Array.from({ length: LIMITS.maxLines }, () => "y".repeat(LIMITS.maxLineLength)).join("\n");
  assert.ok(cleanBlock(huge).length <= LIMITS.maxFieldLength);
});

test("merging into an empty field simply fills it", () => {
  const { text, added } = mergeLines("", RATES);
  assert.equal(text, RATES);
  assert.equal(added, 2);
});

test("merging never removes or rewrites what the creator already typed", () => {
  const mine = "YouTube integration | $2,000\nNewsletter mention | $250";
  const { text, added } = mergeLines(mine, RATES);
  assert.ok(text.startsWith(mine), "existing rows must survive, in order, unedited");
  assert.equal(added, 2);
  assert.deepEqual(parseRates(text).map((r) => r.service), [
    "YouTube integration", "Newsletter mention", "Instagram feed post", "Instagram Story",
  ]);
});

test("following the same handoff link twice does not duplicate the rate card", () => {
  const once = mergeLines("", RATES).text;
  const twice = mergeLines(once, RATES);
  assert.equal(twice.added, 0);
  assert.equal(twice.text, once);
});

test("a different price for the same deliverable is kept, not silently dropped", () => {
  // This module has no business deciding which of two prices for the same
  // service the creator meant; it shows both and lets them delete one.
  const existing = "Instagram feed post | $500";
  const { text, added } = mergeLines(existing, "Instagram feed post | $380 – $620");
  assert.equal(added, 1);
  assert.equal(parseRates(text).length, 2);
});

test("applyHandoff leaves every other form field untouched", () => {
  const current = {
    creatorName: "Jamie Rivers",
    bio: "Budget travel since 2021.",
    ratesRaw: "YouTube integration | $2,000",
    platformsRaw: "",
  };
  const handoff = readHandoff(link({ platformsRaw: "Instagram | 45000 | 4.5%", ratesRaw: RATES }));
  const { values, added, total } = applyHandoff(current, handoff);

  assert.equal(values.creatorName, "Jamie Rivers");
  assert.equal(values.bio, "Budget travel since 2021.");
  assert.ok(values.ratesRaw.startsWith("YouTube integration | $2,000"));
  assert.equal(values.platformsRaw, "Instagram | 45000 | 4.5%");
  assert.deepEqual(added, { platformsRaw: 1, ratesRaw: 2 });
  assert.equal(total, 3);
});

test("applying no handoff changes nothing at all", () => {
  const current = { creatorName: "Jamie", ratesRaw: "A | $1" };
  const { values, total } = applyHandoff(current, null);
  assert.deepEqual(values, current);
  assert.equal(total, 0);
});

test("the banner names what is on offer, in rows the reader will see appear", () => {
  const handoff = readHandoff(link({ platformsRaw: "Instagram | 45000 | 4.5%", ratesRaw: RATES }));
  assert.equal(describeHandoff(handoff), "1 platform row and 2 rate-card rows");
  assert.equal(describeHandoff(readHandoff(link({ ratesRaw: "A | $1" }))), "1 rate-card row");
  assert.equal(describeHandoff(null), "");
});

test("a query string is accepted as well as a fragment", () => {
  // The link this venture receives uses the fragment, but a creator who
  // copies a URL by hand can drop the `#`, and landing on an empty form with
  // no explanation would read as the handoff being broken.
  const handoff = readHandoff("?ratesRaw=A%20%7C%20%241");
  assert.deepEqual(parseRates(handoff.ratesRaw), [{ service: "A", price: "$1" }]);
});
