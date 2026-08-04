import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { BUNDLES, COMMERCE_ADDON, soldPriceAmountsUsd } from "./bundles";

/**
 * Every price this venture shows a visitor must be a price it actually sells.
 *
 * `src/lib/pricing/bundles.ts` is the single field the Stripe Checkout Session
 * is built from: `POST /api/stripe/checkout` looks up the tier there and
 * `bootstrap-stripe-prices.ts` creates each Stripe Price at exactly that
 * `unit_amount`. So the amount in `BUNDLES` is the amount the customer's card
 * is charged.
 *
 * Nothing bound the *advertised* amount to it. Before this contract, twenty-six
 * places across the app restated the sold price as a typed string — the landing
 * page's three pricing cards, the search-result meta description, the preview
 * "Claim this site" CTA, six publicly reachable `/docs` pages, and the script
 * the AI phone agent reads to callers — and only three files (the checkout
 * form, the tier upsell and the checkout route) read `BUNDLES`. Changing
 * `monthlyPriceUsd` from 99 to 129 would have moved what Stripe charges while
 * every one of those surfaces went on advertising $99, and no test would have
 * failed. Advertising one price and charging another is not a cosmetic defect.
 *
 * Two rules, in increasing strictness:
 *
 * 1. Every USD amount anywhere on the public copy surface must be a price this
 *    venture currently sells, or a registered exception with a stated reason.
 *    This is the drift alarm: it fires on the prose pages the moment `BUNDLES`
 *    moves and the copy does not follow.
 * 2. The transactional surfaces — the pages a buyer reads immediately before
 *    handing over money — must contain no typed amount at all. They derive from
 *    `BUNDLES`, so they cannot drift in the first place.
 *
 * The surface is read off disk, not listed here, so a new public page carrying
 * a new price is covered the day it is added rather than the day someone
 * remembers to register it.
 */

const VENTURE_ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(VENTURE_ROOT, "src");

/**
 * Directory segments excluded from the public copy surface. `/dashboard` is the
 * only prefix `src/proxy.ts` puts behind a password, so everything else under
 * `src/app` — including all of `/docs` — is reachable anonymously and is copy a
 * prospective customer can read. `src/lib` is excluded because it holds no
 * rendered copy; the internal agent process log lives there and its figures are
 * history, not offers.
 */
const OPERATOR_ONLY_SEGMENT = "dashboard";

/**
 * Files that must derive every amount rather than state one. These are the
 * surfaces between a visitor and the checkout button.
 */
const TRANSACTIONAL_SURFACES = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/components/preview/category-preview.tsx",
];

/**
 * Amounts that appear in public copy but are not bundle prices. Each needs a
 * reason naming what the figure is, so an unexplained number cannot be waved
 * through. Empty is the healthy state; the test below also fails on a stale
 * entry, so this cannot quietly become a list of everything.
 */
const REGISTERED_NON_BUNDLE_AMOUNTS: ReadonlyArray<{
  file: string;
  amountUsd: number;
  reason: string;
}> = [];

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === OPERATOR_ONLY_SEGMENT || entry === "node_modules") continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    acc.push(path.relative(VENTURE_ROOT, full));
  }
  return acc;
}

function publicCopyFiles(): string[] {
  return [
    ...collectSourceFiles(path.join(SRC, "app")),
    ...collectSourceFiles(path.join(SRC, "components")),
  ];
}

/**
 * USD amounts written as literal copy. A template hole — `${formatPriceUsd(x)}`
 * or `+${COMMERCE_ADDON.setupPriceUsd}` — is a `$` followed by `{` and is
 * deliberately not matched: that is the derived form this contract wants.
 */
const USD_LITERAL = /\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g;

/**
 * Comments are not copy. A file may explain a price in prose to the next
 * engineer — this very file does — without advertising it to anyone. Block
 * comments are removed outright; line comments only where `//` opens the line
 * or follows whitespace, so a `https://` inside rendered text survives.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function statedAmounts(relPath: string): number[] {
  const source = stripComments(readFileSync(path.join(VENTURE_ROOT, relPath), "utf8"));
  const found: number[] = [];
  for (const match of source.matchAll(USD_LITERAL)) {
    const whole = Number(match[1].replace(/,/g, ""));
    const cents = match[2] ? Number(match[2]) / 100 : 0;
    found.push(whole + cents);
  }
  return found;
}

describe("advertised prices match the prices this venture sells", () => {
  it("scans a non-empty public copy surface that includes the known money pages", () => {
    const files = publicCopyFiles();
    expect(files.length).toBeGreaterThan(10);
    // If the app directory moves or the walk breaks, every other assertion in
    // this file passes vacuously. Anchor on surfaces that must always exist.
    for (const required of TRANSACTIONAL_SURFACES) {
      expect(files, `${required} missing from the scanned surface`).toContain(required);
    }
    expect(files.some((f) => f.startsWith("src/app/docs/"))).toBe(true);
  });

  it("excludes the operator dashboard, and that exclusion is not vacuous", () => {
    const files = publicCopyFiles();
    expect(files.some((f) => f.includes(`/${OPERATOR_ONLY_SEGMENT}/`))).toBe(false);
    // The exclusion must be excluding something real, or it is decoration.
    const dashboardDir = path.join(SRC, "app", OPERATOR_ONLY_SEGMENT);
    expect(statSync(dashboardDir).isDirectory()).toBe(true);
    expect(collectSourceFiles(dashboardDir).length).toBeGreaterThan(0);
  });

  it("states no USD amount the venture does not currently sell", () => {
    const sold = new Set(soldPriceAmountsUsd());
    expect(sold.size).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of publicCopyFiles()) {
      for (const amount of statedAmounts(file)) {
        if (sold.has(amount)) continue;
        const registered = REGISTERED_NON_BUNDLE_AMOUNTS.some(
          (entry) => entry.file === file && entry.amountUsd === amount,
        );
        if (!registered) offenders.push(`${file} advertises $${amount}`);
      }
    }

    expect(
      offenders,
      `Public copy states an amount that is not a current price in ` +
        `src/lib/pricing/bundles.ts. Either the copy is stale — in which case a ` +
        `customer is being quoted one price and charged another — or the figure ` +
        `is not a bundle price and belongs in REGISTERED_NON_BUNDLE_AMOUNTS ` +
        `with a reason.\nSold today: ${soldPriceAmountsUsd().map((a) => `$${a}`).join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the transactional surfaces free of typed amounts", () => {
    for (const file of TRANSACTIONAL_SURFACES) {
      expect(
        statedAmounts(file),
        `${file} types a price instead of reading it from BUNDLES. A buyer reads ` +
          `this immediately before paying, so it must not be able to disagree ` +
          `with the Stripe Price the checkout session is built from.`,
      ).toEqual([]);
    }
  });

  it("carries no stale registered exception", () => {
    const files = new Set(publicCopyFiles());
    for (const entry of REGISTERED_NON_BUNDLE_AMOUNTS) {
      expect(entry.reason.trim().length, `${entry.file} exception needs a reason`).toBeGreaterThan(
        20,
      );
      expect(files, `${entry.file} is registered but no longer scanned`).toContain(entry.file);
      expect(
        statedAmounts(entry.file),
        `${entry.file} no longer states $${entry.amountUsd}; drop the exception`,
      ).toContain(entry.amountUsd);
    }
  });

  it("derives the sold-amount set from the bundle definitions themselves", () => {
    // Guards the other direction: soldPriceAmountsUsd() must widen when a tier
    // is added, or a new tier's price would be reported as an offender.
    const sold = new Set(soldPriceAmountsUsd());
    for (const bundle of BUNDLES) {
      expect(sold).toContain(bundle.setupPriceUsd);
      if (bundle.monthlyPriceUsd != null) expect(sold).toContain(bundle.monthlyPriceUsd);
    }
    expect(sold).toContain(COMMERCE_ADDON.setupPriceUsd);
    expect(sold).toContain(COMMERCE_ADDON.monthlyPriceUsd);
  });
});
