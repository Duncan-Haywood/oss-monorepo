import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * pricingClaims.test.ts — holds the pricing page to behaviour the product has.
 *
 * Pairwise is the only venture in this portfolio with a live production URL, so
 * its pricing section is the one place where the repository makes a commercial
 * statement to a real visitor. On 2026-08-02 that section carried three claims
 * with nothing behind them: a "Most Popular" badge on a plan nobody has ever
 * bought, a "$9 / month" price with no payment path anywhere in the venture
 * (no billing dependency, no checkout route, no entitlement check), and an
 * "Exportable Value Summary PDF" that appeared in exactly one file in the
 * repository — this one, as copy. Meanwhile every feature listed under the paid
 * tier is served, free and ungated, to anyone who clicks through.
 *
 * The rule enforced here: every capability the pricing page claims must be
 * registered against a code signal that grants it, and no purchase may be
 * implied unless the venture can actually take money. Both directions matter —
 * an unregistered bullet fails, and a registered bullet whose signal has
 * disappeared from the source fails too. Building the capability, or the
 * billing path, is what unlocks the copy, so this is a contract rather than a
 * word blocklist.
 *
 * Modelled on ventures/real-estate-agent-photo-app/pipeline/src/offer-claims.test.ts,
 * which enforces the same shape over that venture's $19 shoot description.
 */

const VENTURE = process.cwd();

function source(relative: string): string {
  return readFileSync(join(VENTURE, relative), "utf8");
}

/** Every file whose text a prospective customer reads before deciding to pay. */
const COPY_SURFACE = ["src/app/page.tsx"] as const;

/**
 * A claim the pricing page is allowed to make, and the code that grants it.
 * `signal` is matched against the named source file, so deleting the feature
 * fails here rather than quietly leaving the promise on the page.
 */
type RegisteredClaim = {
  /** Matches the bullet text as it appears on the page. */
  claim: RegExp;
  /** File the capability lives in, relative to the venture root. */
  file: string;
  /** Evidence in that file that the capability exists. */
  signal: RegExp;
  why: string;
};

const REGISTERED_CLAIMS: RegisteredClaim[] = [
  {
    claim: /^Unlimited Pairwise Picks$/,
    file: "src/lib/pairing.ts",
    signal: /export function selectNextPair/,
    why: "the pair selector has no trial cap; it keeps producing pairs from the active set",
  },
  {
    claim: /^Full Glicko-2 Rating Engine$/,
    file: "src/lib/glicko2.ts",
    signal: /export function updateGlicko/,
    why: "the Glicko-2 update step is implemented, not a rebadged Elo",
  },
  {
    claim: /^Personal Preference Rankings$/,
    file: "src/lib/couples.ts",
    signal: /export async function rankingFor/,
    why: "a ranking is computed per user and perspective from stored comparisons",
  },
  {
    claim: /^Rating Deviation Confidence Intervals$/,
    file: "src/lib/glicko2.ts",
    signal: /export function confidenceInterval95/,
    why: "the interval is derived from the rating deviation, so the claim is literal",
  },
  {
    claim: /^Browser Session Persistence$/,
    file: "src/components/UnifiedRunner.tsx",
    signal: /localStorage\.setItem/,
    why: "guided sessions and shown insight breaks are written to localStorage and re-read on load",
  },
  {
    claim: /^Everything in Free$/,
    file: "src/app/page.tsx",
    signal: /Free Forever/,
    why: "a reference to the other card on the same page, not a capability of its own",
  },
  {
    claim: /^Dual Perspective Switching$/,
    file: "src/lib/perspective.ts",
    signal: /export const PERSPECTIVES/,
    why: "SELF, PARTNER and PARTNER_GUESS are real, switchable perspectives",
  },
  {
    claim: /^Shared Ground Radar & Overlap Sync$/,
    file: "src/lib/couples.ts",
    signal: /export function sharedValues/,
    why: "overlap between two partners' rankings is computed, not illustrated",
  },
  {
    claim: /^Bradley-Terry Financial Trade-off Models$/,
    file: "src/lib/conjoint.ts",
    signal: /Bradley-Terry/,
    why: "the paired-comparison logit model is named and implemented in conjoint.ts",
  },
  {
    claim: /^Actionable Conversation Prompts$/,
    file: "src/lib/couples.ts",
    signal: /export function conversationStarters/,
    why: "prompts are generated from the couple's own blind spots and asymmetries",
  },
];

/**
 * Evidence that the venture can take money. Until one of these appears, any
 * copy presenting a price as purchasable is describing a transaction that
 * cannot happen. Adding real billing is what relaxes the rules below.
 */
const PAYMENT_PATH_SIGNALS: Array<{ file: string; signal: RegExp; what: string }> = [
  { file: "package.json", signal: /"(stripe|@stripe\/[a-z-]+|paddle-sdk|@paddle\/[a-z-]+|braintree|lemonsqueezy)"\s*:/, what: "a payment SDK dependency" },
];

/** Route segments that would indicate a checkout or billing endpoint. */
const PAYMENT_ROUTE_SEGMENTS = ["checkout", "billing", "stripe", "subscribe", "subscription"];

function hasPaymentPath(): boolean {
  for (const { file, signal } of PAYMENT_PATH_SIGNALS) {
    if (signal.test(source(file))) return true;
  }
  // A checkout route under src/app/api would also count.
  const routeDirs = readdirSafe(join(VENTURE, "src/app/api"));
  return routeDirs.some((d) => PAYMENT_ROUTE_SEGMENTS.includes(d.toLowerCase()));
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * The pricing section, isolated so the scans below cannot accidentally sweep in
 * the hero, the FAQ or the footer. Anchored on the section id the page renders.
 *
 * Throws rather than returning the whole page when the anchor is gone: a
 * renamed section must fail every scan loudly, not silently widen them. It is
 * called inside test bodies and never at module scope, so the failure is
 * reported as a named failing test rather than a collection error that CI logs
 * render as "no tests".
 */
function pricingSection(): string {
  const pageSource = source("src/app/page.tsx");
  const start = pageSource.indexOf('id="pricing"');
  if (start === -1) {
    throw new Error(
      'page.tsx no longer renders a section with id="pricing" — the pricing claim scans have nothing to read',
    );
  }
  const rest = pageSource.slice(start);
  const end = rest.indexOf('id="faq"');
  return end === -1 ? rest : rest.slice(0, end);
}

/** Every "✓ …" bullet the pricing cards render, in page order. */
function claimedBullets(section: string): string[] {
  const bullets: string[] = [];
  for (const match of section.matchAll(/✓\s*([^<]+?)\s*<\/li>/g)) {
    bullets.push(match[1].trim());
  }
  return bullets;
}

describe("pricing copy surface", () => {
  it("is readable and non-empty, so the scans below cannot pass vacuously", () => {
    for (const relative of COPY_SURFACE) {
      const text = source(relative);
      expect(text.trim().length, `${relative} is empty`).toBeGreaterThan(0);
    }
  });

  it("renders a pricing section with feature bullets", () => {
    expect(claimedBullets(pricingSection()).length).toBeGreaterThanOrEqual(5);
  });
});

describe("every claimed capability is granted by code", () => {
  it("registers every bullet the page shows", () => {
    const unregistered = claimedBullets(pricingSection()).filter(
      (b) => !REGISTERED_CLAIMS.some((r) => r.claim.test(b)),
    );
    expect(
      unregistered,
      "a new pricing bullet must be registered in REGISTERED_CLAIMS with the code signal that makes it true",
    ).toEqual([]);
  });

  for (const registered of REGISTERED_CLAIMS) {
    it(`${registered.claim.source} is backed by ${registered.file}`, () => {
      // Only enforce the signal for claims the page actually makes; a
      // registration for removed copy should not fail, but a made claim with a
      // vanished capability must.
      if (!claimedBullets(pricingSection()).some((b) => registered.claim.test(b))) return;
      expect(
        registered.signal.test(source(registered.file)),
        `${registered.file} no longer contains ${registered.signal} — ${registered.why}`,
      ).toBe(true);
    });
  }
});

describe("no purchase is implied while the venture cannot take money", () => {
  it("claims no popularity ranking for a plan with no sales", () => {
    if (hasPaymentPath()) return;
    const section = pricingSection();
    expect(
      section,
      'a "Most Popular"/"#1"/"Join N" badge is a statistic about customers; there are none, and no way to become one',
    ).not.toMatch(/most\s+popular|#\s*1\b|best\s+seller|join\s+[\d,]+\s+\w+/i);
  });

  it("uses no purchase verb on a plan that cannot be bought", () => {
    if (hasPaymentPath()) return;
    const section = pricingSection();
    expect(
      section,
      "a buy/subscribe/upgrade control would start a transaction the venture has no path to complete",
    ).not.toMatch(/\b(buy now|subscribe|upgrade|start (your )?(free )?trial|checkout|purchase)\b/i);
  });

  it("states plainly that nothing is charged wherever it shows a price", () => {
    if (hasPaymentPath()) return;
    const section = pricingSection();
    const showsAPrice = /\$\s*\d+\s*<[^>]*>\s*\/?\s*(month|mo|year)/i.test(section)
      || /\$\d+\s*\/\s*(month|mo|year)/i.test(section);
    if (!showsAPrice) return;
    // Deliberately narrow. A soft signal like "free while in beta" sitting
    // beside "$9 / month" reads as "currently discounted", not as "we cannot
    // bill you" — the disclosure has to be about the charge itself.
    expect(
      section,
      "a price on the page with no way to pay it must say plainly that the visitor will not be charged; otherwise it reads as an active offer",
    ).toMatch(/(will )?not be charged|cannot charge you|no way to (take |accept )?pay|nothing to pay|no charge/i);
  });
});

describe("no deliverable is listed that no code produces", () => {
  it("does not promise a file export the venture cannot generate", () => {
    const section = pricingSection();
    const claimsExport = /\b(pdf|\.csv\b|export(able)?\s+\w*\s*(summary|report|file))/i.test(section);
    if (!claimsExport) return;
    const hasGenerator = ["package.json", "src/lib/couples.ts", "src/lib/insights.ts"].some((f) =>
      /jspdf|pdfkit|puppeteer|@react-pdf|generatePdf|toCsv|exportSummary/i.test(source(f)),
    );
    expect(
      hasGenerator,
      "the pricing page lists an export, but nothing in the venture generates one",
    ).toBe(true);
  });
});
