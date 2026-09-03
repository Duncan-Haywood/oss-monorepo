// Structural tests for the Faire Pay Now page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareFairePayNow, payNowNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-offer-faire-pay-now.html", import.meta.url), "utf8");
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
  assert.match(scriptSource, /compareFairePayNow/);
  assert.match(scriptSource, /payNowNote/);
  assert.match(scriptSource, /pay_now_compared/);
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
    ["Skip leftover on Net terms", /id === "skip"|skip\.cash/],
    ["Pay Now leftover after Faire remittance wait", /payNowRate|id === "offer"/],
    ["everyone-takes leftover", /id === "take"|takeVsSkip/],
    ["remittance-day ceiling that still matches skip", /breakEvenPayNowWaitDays|31\.0 days/],
    ["extra-order floor that still matches skip", /breakEvenExtraOrders|about 0\.02/],
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
  const result = compareFairePayNow(defaults);
  assert.equal(result.winner, "skip");
  assert.ok(Math.abs(result.skip.cash - 69.15764383561644) < 1e-9);
  assert.ok(Math.abs(result.offer.cash - 67.88049928767123) < 1e-9);
  const note = payNowNote(result);
  assert.ok(html.includes("$69.16"), "missing skip leftover");
  assert.ok(html.includes("$67.88"), "missing offer leftover");
  assert.ok(html.includes("$1.28"), "missing per-order leak");
  assert.ok(html.includes("$65.96"), "missing everyone leftover");
  assert.ok(html.includes("31.0 days"), "missing remittance ceiling");
  assert.ok(html.includes("0.02"), "missing extra-order floor");
  assert.ok(html.includes("$133.85"), "missing extra-order flip");
  assert.ok(html.includes("$64.69"), "missing extra-order gap");
  assert.ok(html.includes("$72.47"), "missing 1-day flip");
  assert.ok(html.includes("$3.31"), "missing 1-day gap");
  assert.ok(html.includes("$70.48"), "missing mixed 1-day leftover");
  assert.match(note, /\$69\.16/);
  assert.match(note, /\$67\.88/);
  assert.doesNotMatch(html, /you should offer Pay Now|must skip Pay Now|must turn Pay Now on/i);
});

test("sitemap and index point at the Pay Now page", () => {
  assert.match(sitemap, /should-i-offer-faire-pay-now\.html/);
  assert.match(index, /should-i-offer-faire-pay-now\.html/);
  assert.match(index, /compareFairePayNow/);
  assert.match(index, /pay_now_compared/);
});

test("disclaimers a user can actually read", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /Not affiliated with Faire/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});
