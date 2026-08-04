/**
 * Where a shared card sends the person who receives it.
 *
 * This module exists because the share surfaces handed out the literal
 * `https://quickpick.app`, which is not a host this product is served from —
 * `VENTURE.yaml` declares `https://pairwise.marisstella.dev`. Every recipient of
 * a shared insight was pointed off-product, so the one growth loop the venture
 * has returned nobody, and the card told the recipient the product lives
 * somewhere it does not.
 *
 * Deriving the target from the deployment's own origin — the way `CoupleView`
 * already builds couple invite links — is the only form that cannot go stale
 * when the domain changes, and it is what
 * `platform/ci/test/product-url-contract.test.mjs` requires of every share
 * surface in the repository.
 */

export type ShareTarget = {
  /** Absolute origin to put in a share link, e.g. `https://pairwise.marisstella.dev`. */
  url: string;
  /** Host alone, for display on the card, e.g. `pairwise.marisstella.dev`. */
  host: string;
};

/**
 * Narrow an origin string to a share target, or `null` if it is not one.
 *
 * Returning `null` rather than a fallback is deliberate: a fallback is how the
 * wrong domain got shipped in the first place. A caller that cannot learn where
 * it is running must share no link at all rather than guess at one.
 */
export function shareTargetFrom(origin: string | null | undefined): ShareTarget | null {
  if (!origin) return null;
  if (!origin.startsWith("http://") && !origin.startsWith("https://")) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!parsed.host) return null;
  return { url: parsed.origin, host: parsed.host };
}

/**
 * The share target for the running deployment, or `null` outside a browser.
 *
 * Call this from an effect, not during render: the server has no location, so
 * computing it during render produces a hydration mismatch.
 */
export function currentShareTarget(): ShareTarget | null {
  if (typeof window === "undefined") return null;
  return shareTargetFrom(window.location.origin);
}
