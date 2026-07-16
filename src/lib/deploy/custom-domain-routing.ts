/**
 * Pure host-matching helpers for proxy.ts custom-domain routing (Starter
 * "Preview subdomain → custom domain handoff" promise). Vitest-testable
 * without proxy.ts's Node-runtime request plumbing (depends only on
 * isPublicLeadSlugPathLengthOk for Host→preview slug length).
 */

import { isPublicLeadSlugPathLengthOk } from "@/lib/leads/slug-path";

/** Strip port + trailing dot, lowercase. Empty/missing header → "". */
export function normalizeRequestHost(hostHeader: string | null | undefined): string {
  if (!hostHeader) return "";
  return hostHeader.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/**
 * Strip scheme / path / query / hash / port / trailing FQDN dot from an
 * operator-entered custom domain so it matches Host headers and Vercel
 * Domains API `name` (both are bare hostnames). Returns null for empty
 * input (clear domain) or when nothing hostname-like remains.
 *
 * Used by Save domain writes — previously only trim+lowercase ran, so
 * pasting `https://joesplumbing.com/` never equaled normalizeRequestHost
 * of inbound Host `joesplumbing.com` and Host→preview routing silently
 * failed (custom-domain-host-normalize).
 */
export function normalizeOperatorCustomDomainHost(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let host = "";
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    host = trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      ?.split("?")[0]
      ?.split("#")[0]
      ?.split(":")[0] ?? "";
  }

  host = host.replace(/\.$/, "").trim();
  return host || null;
}

/** Hostname shape check for a bare DNS name (no scheme/port/path). */
export function isPlausibleCustomDomainHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (host.includes(" ") || host.includes("@") || host.includes("/")) return false;
  if (host.includes("..")) return false;
  // Public client domains need a TLD; bare single labels (and localhost) are not.
  if (!host.includes(".")) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return false;
  }
  // Each label: alnum, optional internal hyphens, 1–63 chars.
  const labels = host.split(".");
  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  );
}

export type ParseOperatorCustomDomainResult =
  | { ok: true; host: string | null }
  | { ok: false; error: string };

/**
 * Parse operator Save domain input: empty → clear (null); otherwise a bare
 * hostname or a clear error. Optionally reject platform-owned hosts so the
 * operator cannot point Host→preview at the marketing root / suggestedHost
 * tree (those already route via extractPreviewSubdomainSlug).
 */
export function parseOperatorCustomDomain(
  raw: string,
  productionRootDomain = "",
): ParseOperatorCustomDomainResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, host: null };
  }

  const host = normalizeOperatorCustomDomainHost(trimmed);
  if (!host || !isPlausibleCustomDomainHost(host)) {
    return {
      ok: false,
      error:
        "Enter a domain like example.com (https://example.com is fine — scheme, path, and port are stripped). Localhost and single-label hosts are not accepted.",
    };
  }

  if (productionRootDomain && isPlatformHost(host, productionRootDomain)) {
    return {
      ok: false,
      error:
        "That host is platform-owned (marketing site or preview subdomain). Enter the client's own domain instead.",
    };
  }

  return { ok: true, host };
}

/**
 * www↔apex aliases for a bare client host. Host→preview lookup and Save
 * domain uniqueness treat these as the same sold domain so Save
 * `www.client.com` still matches Host `client.com` (and vice versa), and
 * two leads cannot own the www twin of each other's domain.
 *
 * Exact host first. Keep storing the operator's chosen form — do not strip
 * www on write. Returns `[host]` only when the twin is not a plausible
 * public hostname. Platform suggestedHost subdomains are not passed here.
 *
 * See custom-domain-www-apex-alias.
 */
export function customDomainHostAliases(host: string): string[] {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) return [];
  if (!isPlausibleCustomDomainHost(normalized)) {
    return [normalized];
  }

  const aliases = [normalized];
  if (normalized.startsWith("www.")) {
    const apex = normalized.slice(4);
    if (apex && isPlausibleCustomDomainHost(apex)) {
      aliases.push(apex);
    }
  } else {
    const www = `www.${normalized}`;
    if (isPlausibleCustomDomainHost(www)) {
      aliases.push(www);
    }
  }
  return aliases;
}

/**
 * Operator-facing error when another handoff already owns this domain.
 * Host→preview first-match would otherwise silently serve the wrong client
 * (custom-domain-normalize-and-unique). Also covers www↔apex twins
 * (custom-domain-www-apex-alias).
 */
export function customDomainAlreadyOwnedMessage(
  domain: string,
  ownerSlug: string,
): string {
  return `Domain ${domain} is already saved on lead ${ownerSlug} — clear it there first, or pick a different host`;
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
 * reserved label, isn't under `productionRootDomain`, or the label fails
 * isPublicLeadSlugPathLengthOk (proxy-host-lookup-field-length-cap).
 *
 * Spoofed Host headers are not DNS-bounded — a multi-KB `{label}.{root}` still
 * reached getLeadBySlug before this gate. Soft-cap would change the lookup key;
 * treat over-long like unrecognized (null → marketing homepage fall-through).
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
  // Shared public lead-slug ceiling (path/query twins already gate this).
  if (!isPublicLeadSlugPathLengthOk(label)) {
    return null;
  }
  return label;
}
