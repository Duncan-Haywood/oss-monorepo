/**
 * The one place this venture decides what its own public origin is.
 *
 * Three surfaces used to answer that question themselves, and all three
 * answered it the same wrong way:
 *
 *   src/app/robots.ts        `process.env.NEXT_PUBLIC_SITE_URL ?? "https://printatelier.com"`
 *   src/app/sitemap.ts       the same line
 *   src/app/api/ad-catalog/sync/route.ts  the same line, feeding `link` and
 *                            `imageLink` of every product pushed to Meta,
 *                            Google Merchant Center and Pinterest.
 *
 * `printatelier.com` is not a domain this portfolio deploys to. Measured
 * 2026-08-05 and recorded in `tests/catalog-print-file-provenance.test.ts`: it
 * resolves to AWS registrar parking, and print-atelier's only declared ingress
 * is `atelier.marisstella.dev`
 * (`platform/k8s/apps/print-atelier/ingress.yaml`). So the fallback was not a
 * harmless placeholder — it published a sitemap, a robots.txt and a merchant
 * product feed of URLs on a domain the business does not control.
 *
 * It was also unfixable from the cluster. Next.js substitutes `NEXT_PUBLIC_*`
 * at **build** time, so the origin is baked into the image; no Deployment env
 * entry can change it. `platform/k8s/apps/print-atelier/SECRETS.md` recorded
 * that as open. The Dockerfile now takes `NEXT_PUBLIC_SITE_URL` as a build arg,
 * and this module is what an unset build arg produces: nothing.
 *
 * The rule here is that an unconfigured deployment gets *no* origin rather than
 * a plausible one. Every caller must handle `null` by refusing to publish —
 * "not indexed" and "no feed" are recoverable; "indexed under someone else's
 * domain" and "a merchant feed of links we cannot serve" are not.
 */

export const SITE_URL_ENV = "NEXT_PUBLIC_SITE_URL";

/**
 * Operator-facing explanation, shared by every surface that has to refuse.
 * Names the variable and the reason, because the person reading it is the one
 * who has to set it.
 */
export const SITE_URL_UNCONFIGURED_HINT =
  `Set ${SITE_URL_ENV} to this deployment's own absolute origin (for example ` +
  `https://atelier.marisstella.dev) and rebuild the image — Next.js inlines ` +
  `NEXT_PUBLIC_* at build time, so the Dockerfile build arg is what carries it. ` +
  `Until it is set this deployment refuses to publish URLs rather than ` +
  `guessing a domain the business may not own.`;

/**
 * Validates a configured origin. Returns null for anything that is not an
 * absolute `http(s)` origin.
 *
 * Deliberately strict about the parts it drops rather than dropping them
 * silently:
 *
 *   - credentials, a query or a fragment are rejected outright — a site origin
 *     carrying any of those is a misconfiguration, and silently discarding them
 *     would hide it;
 *   - a path other than `/` is rejected for the same reason. Every caller
 *     concatenates `${origin}${path}`, so accepting `https://host/store` and
 *     then returning `https://host` would emit links that quietly lose the
 *     prefix. Refusing is loud; that is the point.
 */
export function parseSiteUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  if (parsed.hostname.length === 0) {
    return null;
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    return null;
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    return null;
  }

  return parsed.origin;
}

/**
 * The configured origin, or null when this deployment has none.
 *
 * The literal `process.env.NEXT_PUBLIC_SITE_URL` has to appear in this module
 * for Next.js to substitute it: the bundler rewrites the exact member
 * expression, not a variable holding the name. Reading it inside the function
 * rather than at module scope also means a caller sees the current value, which
 * is what lets the tests cover both states of a build-time constant.
 */
export function resolveSiteUrl(): string | null {
  if (typeof process === "undefined" || typeof process.env === "undefined") {
    return null;
  }
  return parseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}
