// Structural tests for the Faire Promoted Listings page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareFairePromoted, promotedNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-run-faire-promoted-listings.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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
const rowTemplate = scriptSource.match(/<tr class="\$\{winner[\s\S]*?<\/tr>/);

const defaults = {
  unitWholesale: 20,
  quantity: 10,
  unitCogs: 8,
  shippingReimbursement: 15,
  shippingCost: 15,
  region: "north_america",
  payout: "day_60",
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareFairePromoted/);
  assert.match(scriptSource, /promotedNote/);
  assert.match(scriptSource, /promoted_compared/);
});

test("every results column has a cell, and every cell has a column", () => {
  assert.ok(rowTemplate, "could not find the per-path <tr> template");
  const headers = [...markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim());
  const cells = (rowTemplate[0].match(/<t[hd][\s>]/g) || []).length;
  assert.equal(
    cells,
    headers.length,
    `table declares ${headers.length} columns (${headers.join(" | ")}) but the row emits ${cells} cells`,
  );
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  const claims = [
    ["Skip leftover on organic first orders", /id === "skip"|skip\.cash/],
    ["Promoted Listings leftover after last-click organic", /campaignPromotedRate|id === "campaign"/],
    ["higher-rate campaign leftover", /highPromotedRate|id === "higher"/],
    ["rate ceiling that still matches skip", /breakEvenCampaignRate|14\.6%/],
    ["extra-order floor that still matches skip", /breakEvenExtraOrders|about 1\.0/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource + html, rendered, `"${claim}" is advertised but never rendered`);
  }
});

test("worked example on the page matches the locked comparison", () => {
  const result = compareFairePromoted(defaults);
  assert.equal(result.winner, "skip");
  assert.ok(Math.abs(result.skip.cash - 303.6) < 1e-9);
  assert.ok(Math.abs(result.campaign.cash - 301.5) < 1e-9);
  const note = promotedNote(result);
  assert.ok(html.includes("$303.60"), "missing skip leftover");
  assert.ok(html.includes("$301.50"), "missing campaign leftover");
  assert.ok(html.includes("$2.10"), "missing per-window leak");
  assert.ok(html.includes("14.6%"), "missing rate ceiling");
  assert.ok(html.includes("38.3%"), "missing attribution ceiling");
  assert.ok(html.includes("$347.40"), "missing two-extra flip");
  assert.ok(html.includes("$43.80"), "missing two-extra gap");
  assert.ok(html.includes("$327.50"), "missing 10% flip");
  assert.ok(html.includes("$270.60"), "missing higher-rate leftover");
  assert.match(note, /\$303\.60/);
  assert.match(note, /\$301\.50/);
  assert.doesNotMatch(html, /you should run promoted|must skip ads|must turn the campaign on/i);
});

test("sitemap and index point at the Promoted Listings page", () => {
  assert.match(sitemap, /should-i-run-faire-promoted-listings\.html/);
  assert.match(index, /should-i-run-faire-promoted-listings\.html/);
  assert.match(index, /compareFairePromoted/);
  assert.match(index, /promoted_compared/);
});

test("disclaimers a user can actually read", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /Not affiliated with Faire/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});
