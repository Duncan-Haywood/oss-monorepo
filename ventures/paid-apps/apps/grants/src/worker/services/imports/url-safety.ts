// SSRF guard for user-supplied URLs (grant pages, org websites). Pure, no DNS: Workers cannot
// resolve names before fetch, so we reject everything that names an internal target directly:
// non-http(s) schemes, credentials, non-standard ports, IP literals in private / loopback /
// link-local / reserved ranges, single-label hosts, localhost and internal-only TLDs.
// (Cloudflare's own egress also blocks RFC1918 targets from Workers; this is defence in depth.)

export class UnsafeUrlError extends Error {
  constructor(
    public readonly reason: string,
    message = `URL not allowed: ${reason}`,
  ) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".home.arpa",
  ".localdomain",
  ".test",
  ".invalid",
  ".example",
  ".onion",
  ".arpa",
];
const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

/**
 * Public "wildcard DNS" services that resolve names to any IP embedded in them
 * (127.0.0.1.nip.io -> 127.0.0.1) or always to loopback. Blocked because we cannot resolve DNS
 * before fetch. RESIDUAL RISK: any other attacker-controlled name can still resolve (or rebind) to
 * an internal address; Workers fetch cannot pin IPs, so we rely on Cloudflare's egress refusing
 * private / loopback / link-local targets for Workers subrequests.
 */
const WILDCARD_DNS_SUFFIXES = [
  ".nip.io",
  ".sslip.io",
  ".xip.io",
  ".traefik.me",
  ".localtest.me",
  ".lvh.me",
  ".vcap.me",
  ".lacolhost.com",
  ".fbi.com",
  ".1u.ms",
  ".rebind.it",
  ".rbndr.us",
];

/** Parses and validates; returns the normalized URL or throws UnsafeUrlError. */
export function assertSafeUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input.trim()) : new URL(input.href);
  } catch {
    throw new UnsafeUrlError("invalid", "Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("scheme", "Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("credentials", "URLs with embedded credentials are not allowed");
  }
  // URL.port is "" for the scheme's default port (80/443).
  if (url.port !== "" && !(url.port === "80" || url.port === "443")) {
    throw new UnsafeUrlError("port", "Only standard web ports (80/443) are allowed");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new UnsafeUrlError("host", "URL has no host");

  if (host.startsWith("[")) {
    const v6 = host.slice(1, -1);
    if (isBlockedIpv6(v6))
      throw new UnsafeUrlError("private_ip", "Private IP addresses are not allowed");
    return url;
  }
  const v4 = parseIpv4(host);
  if (v4) {
    if (isBlockedIpv4(v4))
      throw new UnsafeUrlError("private_ip", "Private IP addresses are not allowed");
    return url;
  }
  if (
    BLOCKED_HOSTS.has(host) ||
    BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) ||
    WILDCARD_DNS_SUFFIXES.some((s) => host.endsWith(s) || host === s.slice(1))
  ) {
    throw new UnsafeUrlError("internal_host", "Internal host names are not allowed");
  }
  if (!host.includes(".")) {
    throw new UnsafeUrlError("internal_host", "Single-label host names are not allowed");
  }
  return url;
}

export function isSafeUrl(input: string | URL): boolean {
  try {
    assertSafeUrl(input);
    return true;
  } catch {
    return false;
  }
}

/** Dotted-quad only: WHATWG URL parsing already normalizes 0x7f.1 / 2130706433 forms to dotted quads. */
export function parseIpv4(host: string): [number, number, number, number] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number) as [number, number, number, number];
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

export function isBlockedIpv4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** Expands an IPv6 literal (no brackets) to 8 hextets; null if malformed. */
export function parseIpv6(addr: string): number[] | null {
  let s = addr.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  // Embedded IPv4 tail (::ffff:1.2.3.4)
  const v4tail = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4tail?.[1]) {
    const v4 = parseIpv4(v4tail[1]);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, -v4tail[1].length)}${hi}:${lo}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(":") : []);
  const head = parse(halves[0] ?? "");
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...new Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const nums = all.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? Number.parseInt(h, 16) : Number.NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

export function isBlockedIpv6(addr: string): boolean {
  const h = parseIpv6(addr);
  if (!h) return true; // unparseable literal: refuse
  const [h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0] = h;
  const allZeroUntil = (n: number) => h.slice(0, n).every((x) => x === 0);
  if (allZeroUntil(8)) return true; // ::
  if (allZeroUntil(7) && h7 === 1) return true; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) / IPv4-compatible (::a.b.c.d): judge the embedded IPv4.
  if (allZeroUntil(5) && (h5 === 0xffff || h5 === 0)) {
    return isBlockedIpv4([h6 >> 8, h6 & 0xff, h7 >> 8, h7 & 0xff]);
  }
  // IPv4-translated ::ffff:0:a.b.c.d (SIIT): judge the embedded IPv4.
  if (allZeroUntil(4) && h4 === 0xffff && h5 === 0) {
    return isBlockedIpv4([h6 >> 8, h6 & 0xff, h7 >> 8, h7 & 0xff]);
  }
  if (h0 === 0x64 && h1 === 0xff9b) return true; // NAT64 64:ff9b::/96 + 64:ff9b:1::/48 (internal v4)
  if (h0 === 0x100 && h1 === 0 && h2 === 0 && h3 === 0) return true; // discard-only 100::/64
  if (h0 === 0x2001 && h1 === 0) return true; // Teredo 2001::/32 (embeds arbitrary v4)
  if (h0 === 0x2001 && (h1 & 0xfff0) === 0x10) return true; // ORCHID 2001:10::/28
  if ((h0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((h0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((h0 & 0xffc0) === 0xfec0) return true; // site-local (deprecated)
  if ((h0 & 0xff00) === 0xff00) return true; // multicast
  if (h0 === 0x2001 && h1 === 0xdb8) return true; // documentation
  if (h0 === 0x2002) return true; // 6to4 (embeds arbitrary v4)
  return false;
}
