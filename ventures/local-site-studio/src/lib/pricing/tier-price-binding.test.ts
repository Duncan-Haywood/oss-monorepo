import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { BUNDLES, COMMERCE_ADDON } from "./bundles";

import LandingPage from "@/app/page";
import LaunchChecklistDocPage from "@/app/docs/launch-checklist/page";
import ProductBundlesDocPage from "@/app/docs/product-bundles/page";

/**
 * An advertised amount must be bound to the tier it is advertised *under*.
 *
 * `advertised-price-claims.test.ts` is the sibling contract and it asks a
 * different question: is this amount somewhere in the set of prices we sell,
 * and do the transactional surfaces type no amount at all. Both rules pass on
 * the defect this file exists for.
 *
 * `src/app/docs/product-bundles/page.tsx` binds three separate consts —
 * `starter`, `growth`, `complete` — and writes each heading by hand:
 *
 *     <h2>Growth — ${growth.setupPriceUsd} + ${growth.monthlyPriceUsd}/mo</h2>
 *
 * Change that one identifier to `complete.monthlyPriceUsd` and the page tells an
 * anonymous visitor that Growth costs $199/mo while `POST /api/stripe/checkout`
 * charges their card $99 — or the reverse, and they are quoted half. No literal
 * is typed, so the no-typed-amounts rule passes. Both figures are prices we do
 * sell, so the sold-set rule passes. The venture's 1271 other tests pass. It is
 * a one-identifier edit on the page a buyer reads before deciding, and until
 * this file nothing in the repository could see it.
 *
 * Recorded as finding 9 in docs/CONTROL-AUDIT-2026-08-04.md, second half.
 *
 * The check is on rendered output, not source. The defect is what the visitor
 * is told, and a source pattern that looked for `growth.` near "Growth" would
 * be satisfied by a helper, a map, or a rename. So each surface is rendered
 * with `react-dom/server` and every currency amount in the resulting text is
 * attributed to the nearest tier name preceding it — which is how a reader
 * attributes it too — then checked against that tier's own fields.
 */

const VENTURE_ROOT = path.resolve(__dirname, "../../..");

/**
 * Surfaces rendered and checked, by the path a reader would report a wrong
 * price against. Every entry must be a component that renders with no props:
 * a fixture would mean this contract asserts against invented data rather than
 * against what the venture ships.
 */
const RENDERED_SURFACES: ReadonlyArray<{ file: string; component: ComponentType }> = [
  { file: "src/app/page.tsx", component: LandingPage as ComponentType },
  {
    file: "src/app/docs/product-bundles/page.tsx",
    component: ProductBundlesDocPage as ComponentType,
  },
  {
    file: "src/app/docs/launch-checklist/page.tsx",
    component: LaunchChecklistDocPage as ComponentType,
  },
];

/**
 * Public files that pair a tier name with a price field but are not rendered
 * above, each with the reason it is not and when that reason expires.
 *
 * This is a per-file register with a stated reason, not a directory exemption:
 * a whole-directory waiver is a region where the claim may quietly stop being
 * true. The enumeration below fails when a public file starts pairing a tier
 * name with a price and appears in neither list, so the next priced page is
 * covered on the day it lands rather than the day somebody remembers it.
 */
const UNRENDERED_PRICED_FILES: ReadonlyArray<{
  file: string;
  expires: string;
  reason: string;
}> = [
  {
    file: "src/app/api/stripe/checkout/route.ts",
    expires: "2027-06-01",
    reason:
      "The charging side, not an advertising surface. It reads the tier out of " +
      "BUNDLES to build the Stripe session, so it is the thing every rule here " +
      "compares against rather than a page that can disagree with it.",
  },
  {
    file: "src/app/checkout/checkout-form.tsx",
    expires: "2026-12-01",
    reason:
      'A "use client" component with hooks and props, so it needs a fixture to ' +
      "render and this contract does not assert against fixtures. It is already " +
      "held to the stricter no-typed-amount rule by the TRANSACTIONAL_SURFACES " +
      "list in advertised-price-claims.test.ts. The tier-binding gap here is " +
      "real and unclosed.",
  },
  {
    file: "src/components/preview/category-preview.tsx",
    expires: "2026-12-01",
    reason:
      "Takes the previewed lead as a prop, so rendering it needs a fixture. " +
      "Listed in TRANSACTIONAL_SURFACES, so it may type no amount, but nothing " +
      "yet checks that the amount it derives belongs to the tier it names.",
  },
  {
    file: "src/components/preview/tier-upsell.tsx",
    expires: "2026-12-01",
    reason:
      "Takes a lead prop. Same unclosed tier-binding gap as category-preview; " +
      "it is the CTA that names a tier and quotes its price to a visitor.",
  },
  {
    file: "src/components/preview/commerce-catalog.tsx",
    expires: "2026-12-01",
    reason:
      'A "use client" catalog with state and props. It quotes the Commerce ' +
      "add-on, whose price has one source, and it prices operator-entered SKUs " +
      "rather than tiers — so the tier-binding question barely applies, but it " +
      "pairs the name with the field and is recorded rather than skipped.",
  },
];

/** A currency amount in rendered text. `$1,299` and `$99.50` both count. */
const AMOUNT = /\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g;

/** What a tier is called, and every amount that tier legitimately quotes. */
type Tier = { token: string; label: string; amounts: Set<number> };

function tiers(): Tier[] {
  const out: Tier[] = [];
  for (const bundle of BUNDLES) {
    const amounts = new Set<number>([bundle.setupPriceUsd]);
    if (bundle.monthlyPriceUsd != null) amounts.add(bundle.monthlyPriceUsd);
    out.push({ token: bundle.name.split(/\s+/)[0], label: bundle.name, amounts });
  }
  out.push({
    token: COMMERCE_ADDON.name.split(/\s+/)[0],
    label: COMMERCE_ADDON.name,
    amounts: new Set<number>([COMMERCE_ADDON.setupPriceUsd, COMMERCE_ADDON.monthlyPriceUsd]),
  });
  return out;
}

function renderText(component: ComponentType): string {
  return renderToStaticMarkup(createElement(component))
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/\s+/g, " ");
}

/** The tier whose name most recently preceded `index`, or null if none has. */
function attributedTier(text: string, index: number, all: Tier[]): Tier | null {
  let best: { tier: Tier; at: number } | null = null;
  for (const tier of all) {
    const pattern = new RegExp(`\\b${tier.token}\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index >= index) break;
      if (!best || match.index > best.at) best = { tier, at: match.index };
    }
  }
  return best ? best.tier : null;
}

/**
 * Candidate files: the union of what git tracks and what is on disk.
 *
 * Tracked-only was the first version and it had a hole a mutation found — an
 * uncommitted new page under `src/app/docs/` was invisible, so a priced page
 * could be written, reviewed and run against this contract without ever being
 * enumerated. On-disk-only has the opposite hole: it measures the developer's
 * working tree rather than the repository. The union is what
 * `scripts/ci/audit_exceptions.py` settled on for the same reason, and it is
 * the safe direction here because the answer is "which files must be covered",
 * where a false positive is a visible failure and a false negative is silence.
 *
 * The walk is confined to `src/app` and `src/components`, so build output —
 * `.next`, `.turbo`, `dist`, all of it sits at the venture root — cannot reach
 * this list the way it reached the register in the coverage incident.
 */
function candidateFiles(): string[] {
  const tracked = execFileSync("git", ["-C", VENTURE_ROOT, "ls-files", "src"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  const onDisk: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(VENTURE_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(rel);
        continue;
      }
      onDisk.push(rel);
    }
  };
  for (const root of ["src/app", "src/components"]) {
    if (existsSync(path.join(VENTURE_ROOT, root))) walk(root);
  }

  return [...new Set([...tracked, ...onDisk])].sort();
}

function publicPricedFiles(): string[] {
  return candidateFiles().filter((file) => {
    if (!/\.tsx?$/.test(file)) return false;
    if (/\.test\.tsx?$/.test(file)) return false;
    if (!/^src\/(app|components)\//.test(file)) return false;
    if (file.includes("/dashboard/")) return false;
    const source = readFileSync(path.join(VENTURE_ROOT, file), "utf8");
    const namesATier = tiers().some((tier) => new RegExp(`\\b${tier.token}\\b`).test(source));
    const readsAPrice = /PriceUsd|BUNDLES|COMMERCE_ADDON/.test(source);
    return namesATier && readsAPrice;
  });
}

describe("an advertised amount is bound to the tier it is advertised under", () => {
  it("derives distinct, non-empty tier tokens from the bundle definitions", () => {
    const all = tiers();
    expect(all.length).toBeGreaterThan(1);
    for (const tier of all) {
      expect(tier.token.length, `${tier.label} yields an empty token`).toBeGreaterThan(0);
      expect(tier.amounts.size, `${tier.label} quotes no amount`).toBeGreaterThan(0);
    }
    // Two tiers sharing a token would make attribution meaningless, and the
    // amount checks below would then pass by ambiguity rather than by being
    // right. A rename that collides has to fail here.
    const tokens = all.map((tier) => tier.token);
    expect(new Set(tokens).size, `tier tokens collide: ${tokens.join(", ")}`).toBe(tokens.length);
  });

  it("renders every surface to non-empty text that names every tier", () => {
    // Without this, a render that silently produced "" would satisfy every
    // assertion below over zero amounts.
    const all = tiers();
    const combined = RENDERED_SURFACES.map((surface) => renderText(surface.component)).join(" ");
    for (const surface of RENDERED_SURFACES) {
      expect(renderText(surface.component).length, `${surface.file} rendered empty`).toBeGreaterThan(
        200,
      );
    }
    for (const tier of all) {
      expect(
        new RegExp(`\\b${tier.token}\\b`).test(combined),
        `no rendered surface names the ${tier.label} tier`,
      ).toBe(true);
    }
  });

  it("quotes each tier only amounts that tier actually charges", () => {
    const all = tiers();
    const offenders: string[] = [];
    const unattributed: string[] = [];
    let checked = 0;

    for (const surface of RENDERED_SURFACES) {
      const text = renderText(surface.component);
      for (const match of text.matchAll(AMOUNT)) {
        const whole = Number(match[1].replace(/,/g, ""));
        const amount = whole + (match[2] ? Number(match[2]) / 100 : 0);
        const tier = attributedTier(text, match.index ?? 0, all);
        if (!tier) {
          unattributed.push(`${surface.file} states $${amount} before naming any tier`);
          continue;
        }
        checked += 1;
        if (tier.amounts.has(amount)) continue;
        offenders.push(
          `${surface.file}: "${tier.label}" is quoted $${amount}, but that tier charges ` +
            `${[...tier.amounts].map((a) => `$${a}`).join(" / ")}`,
        );
      }
    }

    expect(
      unattributed,
      "An amount appears before any tier is named, so a reader cannot tell which " +
        "tier it belongs to and this contract cannot check it.",
    ).toEqual([]);

    expect(
      offenders,
      "A page quotes a visitor one tier's price under another tier's name. The " +
        "amount is a real price, so the sold-set rule passes; it is derived rather " +
        "than typed, so the no-literals rule passes. What the buyer is told and " +
        "what Stripe charges have come apart.",
    ).toEqual([]);

    // Every tier must have had at least one amount attributed to it, or a
    // surface stopped quoting a tier and this test quietly stopped checking it.
    for (const tier of all) {
      const quoted = RENDERED_SURFACES.some((surface) => {
        const text = renderText(surface.component);
        return [...text.matchAll(AMOUNT)].some(
          (m) => attributedTier(text, m.index ?? 0, all)?.token === tier.token,
        );
      });
      expect(quoted, `no rendered surface quotes an amount under ${tier.label}`).toBe(true);
    }

    expect(checked, "no amount was checked at all").toBeGreaterThan(RENDERED_SURFACES.length);
  });

  it("accounts for every public file that pairs a tier name with a price", () => {
    const rendered = new Set(RENDERED_SURFACES.map((surface) => surface.file));
    const registered = new Set(UNRENDERED_PRICED_FILES.map((entry) => entry.file));

    const found = publicPricedFiles();
    expect(found.length, "the enumeration found nothing, so it is not enumerating").toBeGreaterThan(
      RENDERED_SURFACES.length,
    );

    const unaccounted = found.filter((file) => !rendered.has(file) && !registered.has(file));
    expect(
      unaccounted,
      "A public file names a tier and reads a price field, but is neither " +
        "rendered by this contract nor registered with a reason. Add it to " +
        "RENDERED_SURFACES if it renders without props; otherwise register it " +
        "and say why.",
    ).toEqual([]);

    // Both lists must stay honest in the other direction too.
    for (const file of rendered) {
      expect(found, `${file} is rendered here but no longer pairs a tier with a price`).toContain(
        file,
      );
    }
    for (const entry of UNRENDERED_PRICED_FILES) {
      expect(
        found,
        `${entry.file} is registered but no longer pairs a tier with a price; drop it`,
      ).toContain(entry.file);
      expect(
        entry.reason.trim().length,
        `${entry.file} needs a reason, not a placeholder`,
      ).toBeGreaterThan(40);
      expect(
        Number.isNaN(Date.parse(entry.expires)),
        `${entry.file} needs a parseable expiry`,
      ).toBe(false);
      expect(
        Date.parse(entry.expires) > Date.now(),
        `${entry.file}'s exemption expired on ${entry.expires}; render it or renew the reason`,
      ).toBe(true);
    }
  });
});
