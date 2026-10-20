import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareChannels, CHANNEL_PRESETS } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");
const rowTemplate = scriptSource.match(/<tr class="\$\{cls\}"[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the results row template exists", () => {
  assert.ok(rowTemplate, "could not find the per-channel <tr> template");
});

test("every results column has a cell, and every cell has a column", () => {
  const headers = [...markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim());
  const cells = (rowTemplate[0].match(/<t[hd][\s>]/g) || []).length;
  assert.ok(headers.length > 0, "no column headers found");
  assert.equal(
    cells,
    headers.length,
    `the results table declares ${headers.length} columns (${headers.join(" | ")}) but the row template emits ${cells} cells`,
  );
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");

  const claims = [
    ["annual take-home", /result\.annualPayout/],
    ["guest-paid total", /result\.guestPays/],
    ["effective host fee", /result\.effectiveHostFeeRate/],
    ["nightly raise to restore the old 3% payout", /restore\.newSubtotal/],
    ["direct-booking occupancy break-even", /directBreakEven/],
  ];

  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(
      scriptSource,
      rendered,
      `featureList advertises "${claim}" but the page never renders ${rendered}`,
    );
  }
});

test("the user-visible disclaimer and privacy line are in the footer", () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not legal, tax, financial, or business advice/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test("share encoding is the allowlisted numeric payload, not free text", () => {
  assert.match(scriptSource, /encodeComparison\(bookingInput\(\), state\)/);
  assert.equal(
    /encodeComparison\([^)]*(notes|address|listingName)/.test(scriptSource),
    false,
  );
});

test("links to the seller net sheet calculator", () => {
  assert.match(html, /href="\.\.\/seller-net-sheet\/"/, "the sibling-tool link is missing");
});

// Both price one transaction through platform-specific fees to find the true
// seller payout -- a nightly stay and a livestream lot. Without a crawlable
// link here, a crawler entering on this page never reaches the Whatnot
// calculator in one hop.
test("index links one hop to the whatnot-seller-payout sibling", () => {
  assert.match(
    markup,
    /href="\.\.\/whatnot-seller-payout\/"/,
    "index must link ../whatnot-seller-payout/ so crawlers reach the Whatnot seller payout calculator in one hop",
  );
});

// One property owner's other lease. A host letting nightly is the same person
// who lets the place on a long lease between seasons, and that raises the two
// arithmetic questions the deposit calculator answers. It had no inbound
// sibling link at all, so a crawler entering the catalogue anywhere else could
// not reach it in one hop -- and with sitemap enumeration unavailable on this
// origin (platform/ci/pages_state.py's `indexing` row) a page reachable only
// from the sitemap is reachable from nothing.
test("index links one hop to the security-deposit-return-calculator sibling", () => {
  assert.match(
    markup,
    /href="\.\.\/security-deposit-return-calculator\/"/,
    "index must link ../security-deposit-return-calculator/ so crawlers reach the deposit calculator in one hop",
  );
});

// Both compare a peer-to-peer host's payout across a platform's own fee or
// earnings-plan structure for one booking -- a nightly stay here, a car-share
// trip there. Without a crawlable link here, a crawler entering on this page
// never reaches the Turo calculator in one hop.
test("index links one hop to the turo-host-payout-calculator sibling", () => {
  assert.match(
    markup,
    /href="\.\.\/turo-host-payout-calculator\/"/,
    "index must link ../turo-host-payout-calculator/ so crawlers reach the Turo host payout calculator in one hop",
  );
});

test("the flat-percentage comparison page links back, names no product, and matches the worked Vrbo example", () => {
  const vsFlat = readFileSync(new URL("./vs-subtracting-a-flat-percentage.html", import.meta.url), "utf8");
  assert.match(vsFlat, /<a href="\.\/">/);
  assert.match(vsFlat, /names no specific product/i);
  assert.match(vsFlat, /github\.com\/sponsors\/Duncan-Haywood/);
  const input = { nightlyRate: 225, nights: 2, cleaningFee: 95, extraFees: 0, taxRate: 10, securityDeposit: 200, bookingsPerYear: 36 };
  const c = compareChannels(input, CHANNEL_PRESETS);
  const vrbo = c.channels.find((x) => x.id === "vrbo-pay-per-booking");
  const near = (a, e) => assert.ok(Math.abs(a - e) < 0.01, `${a} vs ${e}`);
  near(c.booking.subtotal, 545);
  near(c.booking.subtotal * 0.92, 501.4);
  near(vrbo.payoutPerStay, 493.77);
  for (const n of ["$545", "$501.40", "$493.77", "$7.63"]) assert.ok(vsFlat.includes(n), n);
});
