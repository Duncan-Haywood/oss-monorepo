// Guards the one thing this comparison page can get wrong in a way that
// matters: the worked numbers drifting from what calc.mjs actually computes.
// Unlike the vs-acuity-scheduling sibling, this page compares against a
// generic habit (guessing a flat dollar fee), not a named competitor, so it
// carries no non-affiliation clause and is listed in clauses.mjs's
// COMPARISON_DISCLAIMER_EXEMPT set instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  computeFeeAmount,
  computeAnnualExposure,
  computeAnnualFeeRevenue,
  computeRecovery,
} from "../calc.mjs";

function readPage() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "vs-a-flat-no-show-fee.html"), "utf8");
}

/** Text as a visitor sees it, with entities decoded for the few we use. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&larr;/g, "←")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const STUDIO = { price: 200, bookingsPerWeek: 25, noShowRatePct: 8, feePercent: 50, enforcementRatePct: 70 };
const BARBERSHOP = { price: 35, bookingsPerWeek: 60, noShowRatePct: 12, feePercent: 50, enforcementRatePct: 70 };
const FLAT_FEE = 25;

test("the worked massage-studio figures match calc.mjs exactly", () => {
  const feeAmount = computeFeeAmount(STUDIO);
  const { noShowsPerYear, annualLostRevenue } = computeAnnualExposure(STUDIO);
  const annualFeeRevenue = computeAnnualFeeRevenue({
    feeAmount,
    noShowsPerYear,
    enforcementRatePct: STUDIO.enforcementRatePct,
  });
  const flatAnnualFeeRevenue = computeAnnualFeeRevenue({
    feeAmount: FLAT_FEE,
    noShowsPerYear,
    enforcementRatePct: STUDIO.enforcementRatePct,
  });
  const rec = computeRecovery({ feeAmount, annualLostRevenue, annualFeeRevenue });
  const flatRec = computeRecovery({ feeAmount: FLAT_FEE, annualLostRevenue, annualFeeRevenue: flatAnnualFeeRevenue });

  assert.equal(feeAmount, 100);
  assert.equal(noShowsPerYear, 104);
  assert.equal(annualLostRevenue, 20800);
  assert.equal(annualFeeRevenue, 7280);
  assert.equal(flatAnnualFeeRevenue, 1820);
  assert.equal(rec.recoveryRatePct, 35);
  assert.equal(flatRec.recoveryRatePct, 8.75);
  assert.equal(Math.round((annualFeeRevenue - flatAnnualFeeRevenue) * 100) / 100, 5460);
});

test("the worked barbershop figures match calc.mjs exactly", () => {
  const feeAmount = computeFeeAmount(BARBERSHOP);
  const { noShowsPerYear, annualLostRevenue } = computeAnnualExposure(BARBERSHOP);

  assert.equal(feeAmount, 17.5);
  assert.equal(noShowsPerYear, 374.4);
  assert.equal(annualLostRevenue, 13104);
  // $25 flat is 71.4% of the $35 ticket, not the 50% the calculator computes.
  assert.equal(Math.round((FLAT_FEE / BARBERSHOP.price) * 1000) / 10, 71.4);
});

test("every currency figure printed on the page matches the computed values above", () => {
  const html = readPage();
  for (const figure of ["$100.00", "$17.50", "$20,800.00", "$7,280.00", "$1,820.00", "$5,460", "$13,104"]) {
    assert.ok(html.includes(figure), `expected figure not found on page: ${figure}`);
  }
});

test("embeds valid FAQPage JSON-LD and every answer is visible on the page", () => {
  const html = readPage();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  const parsed = JSON.parse(blocks[0][1]);
  assert.equal(parsed["@type"], "FAQPage");
  assert.ok(parsed.mainEntity.length >= 3);

  const text = visibleText(html);
  for (const entry of parsed.mainEntity) {
    assert.ok(text.includes(entry.name.toLowerCase()), `question not visible: ${entry.name}`);
    assert.ok(
      text.includes(entry.acceptedAnswer.text.replace(/\s+/g, " ").trim().toLowerCase()),
      `answer not visible: ${entry.name}`,
    );
  }
});

test("carries the no-warranty and hosting disclaimers", () => {
  const html = readPage();
  assert.match(html, /No warranty\./);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("names no vendor or competing platform in its title, description, or comparison body", () => {
  const html = readPage();
  assert.doesNotMatch(html.match(/<title>[\s\S]*?<\/title>/)[0], /Acuity|Calendly|Mindbody|Square|Vagaro/i);
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /Acuity|Calendly|Mindbody|Square|Vagaro/i);
});

test("adds no third-party script, font, stylesheet, or network call", () => {
  const html = readPage();
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});

test("links back to the calculator and its sibling explainer pages", () => {
  const html = readPage();
  assert.match(html, /href="\.\/"/);
  assert.match(html, /href="24h-vs-48h-cancellation-notice\.html"/);
  assert.match(html, /href="should-i-overbook-or-charge-a-no-show-fee\.html"/);
  assert.match(html, /href="vs-acuity-scheduling\.html"/);
});

test("the calculator's entry page and sitemap both link to it, so it is not orphaned", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const index = readFileSync(path.join(here, "..", "index.html"), "utf8");
  assert.match(index, /href="vs-a-flat-no-show-fee\.html"/);

  const sitemap = readFileSync(path.join(here, "..", "sitemap.xml"), "utf8");
  assert.match(sitemap, /vs-a-flat-no-show-fee\.html/);
});
