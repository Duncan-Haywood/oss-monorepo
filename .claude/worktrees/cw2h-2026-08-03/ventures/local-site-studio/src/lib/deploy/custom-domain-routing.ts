/**
 * Pure host-matching helpers for proxy.ts custom-domain routing (Starter
 * "Preview subdomain → custom domain handoff" promise). Kept dependency-free
 * so it's Vitest-testable without proxy.ts's Node-runtime request plumbing.
 */

/** Strip port + trailing dot, lowercase. Empty/missing header → "". */
export function normalizeRequestHost(hostHeader: string | null | undefined): string {
  if (!hostHeader) return "";
  return hostHeader.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/**
 * True when `host` is platform-owned traffic that must never be diverted to
 * a lead's preview via the *custom-domain* lookup: localhost/dev, any Vercel
 * deployment domain, or the platform's own production root domain (marketing
 * site) and its `{slug}.{root}` suggested-host subdomains. The latter are
 * still platform-owned hosts — see extractPreviewSubdomainSlug for the
 * separate routing branch that serves a lead's preview on them directly,
 * without a per-host DB lookup for an external domain.
 */
export function isPlatformHost(host: string, productionRootDomain: string): boolean {
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".vercel.app")) return true;
  const root = productionRootDomain.trim().toLowerCase();
  if (!root) return false;
  return host === root || host.endsWith(`.${root}`);
}

/**
 * Labels that must never be treated as a lead slug even though they match
 * `{label}.{productionRootDomain}` — real-world aliases like `www` should
 * keep serving the platform's own marketing site, not a client preview.
 */
const RESERVED_PREVIEW_SUBDOMAIN_LABELS = new Set(["www"]);

/**
 * Extracts the candidate lead slug from a platform-owned preview-subdomain
 * host (`{slug}.{productionRootDomain}`, the `suggestedHost` every deploy
 * handoff already generates — see src/lib/deploy/handoff.ts), or null when
 * `host` is the bare root domain, has more than one subdomain label, is a
 * reserved label, or isn't under `productionRootDomain` at all.
 *
 * Callers must still confirm the returned label resolves to a real lead
 * (getLeadBySlug) before rewriting — an unrecognized label (typo, a reserved
 * word not yet listed) should fall through to the normal marketing homepage,
 * never a rewrite to the demo-catalog preview fallback.
 */
export function extractPreviewSubdomainSlug(
  host: string,
  productionRootDomain: string,
): string | null {
  const root = productionRootDomain.trim().toLowerCase();
  if (!root || !host || host === root) return null;
  if (!host.endsWith(`.${root}`)) return null;

  const label = host.slice(0, host.length - root.length - 1);
  if (!label || label.includes(".") || RESERVED_PREVIEW_SUBDOMAIN_LABELS.has(label)) {
    return null;
  }
  return label;
}
