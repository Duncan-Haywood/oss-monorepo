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
 * a lead's preview: localhost/dev, any Vercel deployment domain, or the
 * platform's own production root domain (marketing site) and its
 * `{slug}.{root}` suggested-host subdomains.
 */
export function isPlatformHost(host: string, productionRootDomain: string): boolean {
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".vercel.app")) return true;
  const root = productionRootDomain.trim().toLowerCase();
  if (!root) return false;
  return host === root || host.endsWith(`.${root}`);
}
