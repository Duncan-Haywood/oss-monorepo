/**
 * What the operator has to do before the storefront can take money.
 *
 * The admin portal already had a "Payout Exception Queue"
 * (`buildPayoutExceptionQueue`), and it looked like the place this question was
 * answered. It is not: that queue is about payout *economics* — margin, artist
 * floor, POD benchmark — plus proof and room mockups. It enumerates its blockers
 * itself rather than reading the ones the storefront acts on, and the two lists
 * drifted apart.
 *
 * Measured on the seeded catalog, 2026-08-05:
 *
 *   catalog size .......... 6
 *   checkout-eligible ..... 0
 *   payout queue length ... 1
 *
 * Five Live listings — badged "Bestseller" and "New", readiness scores 92 to 100
 * — were refused by `validateCheckoutLineItem` and reported as *no exception* by
 * the only operator surface that lists exceptions. The storefront was correct
 * and silent; the dashboard was wrong and reassuring. Nothing in the venture
 * said that revenue was zero by construction.
 *
 * This module exists so that one number is stated plainly, and so the blocker
 * list can never drift again: every reason here comes from
 * `validateCheckoutLineItem`'s `blockerDetails`. There is no second enumeration
 * to keep in step — adding a blocker to the checkout adds it here.
 *
 * It deliberately reports rather than fixes. Every remaining blocker on this
 * catalog needs a human to do something off-repo (upload a master file, collect
 * a licence, approve a proof), and inventing any of those inputs is what
 * `tests/catalog-print-file-provenance.test.ts` exists to prevent.
 */

import { validateCheckoutLineItem } from "./checkout";
import {
  catalogArtworks,
  defaultListingConsentRecords,
  type CatalogArtwork,
  type ListingConsentRecord,
} from "./marketplace";
import type { CheckoutBlocker, CheckoutBlockerCode } from "./checkout";

export type BlockedListing = {
  slug: string;
  title: string;
  artistName: string;
  /** Verbatim from the storefront's own refusal, in the order it lists them. */
  blockers: CheckoutBlocker[];
  /**
   * The listed price this artwork cannot currently charge. Not a revenue
   * forecast — nobody has bought it. It is the size of what is being advertised
   * and refused, which is what makes the queue worth ordering.
   */
  advertisedRetailPrice: number;
};

export type SellabilityBlockerGroup = {
  code: CheckoutBlockerCode;
  /**
   * The artwork-agnostic remedy for this code. Not one listing's own
   * `operatorAction`: that names a single artwork and would misreport a group.
   */
  remedy: string;
  /** Slugs blocked by this code, so the action names its own scope. */
  slugs: string[];
  /**
   * Listings that would become sellable if *only* this blocker were cleared.
   * The number that matters: clearing a code blocking five listings unblocks
   * nothing if each of those five also fails on something else.
   */
  wouldFullyUnblock: string[];
};

export type ListingSellabilityReport = {
  totalListings: number;
  sellableCount: number;
  blocked: BlockedListing[];
  /**
   * No listing in the catalog can be bought. The storefront serves normally and
   * charges nothing, whatever the traffic — the state this module was written
   * for, and the one the operator queue did not report.
   */
  storefrontTakesNoMoney: boolean;
  /** Blocker codes ordered by how many listings they block, most first. */
  blockerGroups: SellabilityBlockerGroup[];
  /**
   * One sentence for a dashboard header. Says the count and the single highest-
   * leverage next action, or states plainly that nothing is blocked.
   */
  headline: string;
};

export function buildListingSellabilityReport(
  artworks: CatalogArtwork[] = catalogArtworks,
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
): ListingSellabilityReport {
  const blocked: BlockedListing[] = [];
  let sellableCount = 0;

  for (const artwork of artworks) {
    const eligibility = validateCheckoutLineItem(artwork, consentRecords);
    if (eligibility.eligible) {
      sellableCount += 1;
      continue;
    }
    blocked.push({
      slug: artwork.slug,
      title: artwork.title,
      artistName: artwork.artistName,
      blockers: eligibility.blockerDetails,
      advertisedRetailPrice: artwork.retailPrice,
    });
  }

  const groups = new Map<CheckoutBlockerCode, SellabilityBlockerGroup>();
  for (const listing of blocked) {
    for (const blocker of listing.blockers) {
      const group = groups.get(blocker.code) ?? {
        code: blocker.code,
        remedy: blocker.remedy,
        slugs: [],
        wouldFullyUnblock: [],
      };
      group.slugs.push(listing.slug);
      if (listing.blockers.length === 1) {
        group.wouldFullyUnblock.push(listing.slug);
      }
      groups.set(blocker.code, group);
    }
  }

  // Ties broken by how many listings the code fully unblocks, then by code, so
  // the order is stable across runs rather than dependent on catalog order.
  const blockerGroups = [...groups.values()].sort(
    (a, b) =>
      b.slugs.length - a.slugs.length ||
      b.wouldFullyUnblock.length - a.wouldFullyUnblock.length ||
      a.code.localeCompare(b.code),
  );

  return {
    totalListings: artworks.length,
    sellableCount,
    blocked,
    storefrontTakesNoMoney: artworks.length > 0 && sellableCount === 0,
    blockerGroups,
    headline: buildHeadline(artworks.length, sellableCount, blockerGroups),
  };
}

function buildHeadline(
  total: number,
  sellable: number,
  groups: SellabilityBlockerGroup[],
): string {
  if (total === 0) {
    return "No listings in the catalog.";
  }
  if (sellable === total) {
    return `All ${total} listings can be sold.`;
  }

  const leading = groups[0];
  const scope = sellable === 0 ? `No listing of ${total} can be sold` : `${total - sellable} of ${total} listings cannot be sold`;

  if (!leading) {
    return `${scope}.`;
  }
  return `${scope} — ${leading.slugs.length} blocked by: ${leading.remedy}`;
}
