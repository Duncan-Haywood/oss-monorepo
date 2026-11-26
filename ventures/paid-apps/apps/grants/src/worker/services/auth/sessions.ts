// The signed-in user's own sessions: list (device summary, truncated IP, current flag) and revoke.
// Every query is scoped by userId, so one user can never see or revoke another's sessions.
import { and, desc, eq, gt, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import { session } from "../../db/schema";
import { notFound } from "../../lib/errors";

export interface SessionListItem {
  id: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  /** e.g. "Chrome on macOS" */
  device: string;
  /** Network prefix only, e.g. "203.0.113.0/24" or "2001:db8:85a3::/48". */
  ip: string | null;
  current: boolean;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function expandIpv6(ip: string): string[] | null {
  if (!/^[0-9a-f:]+$/i.test(ip) || ip.split("::").length > 2) return null;
  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [...left, ...Array<string>(Math.max(missing, 0)).fill("0"), ...right];
  if (groups.some((g) => g.length < 1 || g.length > 4)) return null;
  return groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""));
}

/**
 * Keeps only the network prefix of an IP (IPv4 /24, IPv6 /48), so stored sessions never hold a
 * full client address. Idempotent on its own output; returns null for anything unparseable.
 */
export function truncateIp(raw: string | null | undefined): string | null {
  const ip = raw?.trim();
  if (!ip) return null;
  const cidr = ip.match(/^(.+)\/(24|48)$/);
  if (cidr?.[1]) {
    const again = truncateIp(cidr[1]);
    return again === ip ? ip : again;
  }
  const v4 = ip.match(IPV4);
  if (v4) {
    const octets = v4.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255)) return null;
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped?.[1]) return truncateIp(mapped[1]);
  const groups = expandIpv6(ip);
  if (!groups) return null;
  return `${groups.slice(0, 3).join(":")}::/48`;
}

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
  [/^curl\//, "curl"],
];
const SYSTEMS: [RegExp, string][] = [
  [/\biPad\b/, "iPadOS"],
  [/\b(iPhone|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\b(Macintosh|Mac OS X)\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

/** "Chrome on macOS" from a User-Agent header (coarse on purpose; no versions). */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua?.trim()) return "Unknown device";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

export async function listSessions(
  ctx: AppContext,
  userId: string,
  currentSessionId: string | null,
): Promise<SessionListItem[]> {
  const rows = await ctx.db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, ctx.now())))
    .orderBy(desc(session.updatedAt))
    .limit(100);
  return rows
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      lastActiveAt: r.updatedAt,
      expiresAt: r.expiresAt,
      device: summarizeUserAgent(r.userAgent),
      ip: truncateIp(r.ipAddress),
      current: r.id === currentSessionId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Revoke one of MY sessions; another user's session id is indistinguishable from an unknown one. */
export async function revokeSession(ctx: AppContext, userId: string, id: string): Promise<void> {
  const deleted = await ctx.db
    .delete(session)
    .where(and(eq(session.id, id), eq(session.userId, userId)))
    .returning({ id: session.id });
  if (deleted.length === 0) throw notFound("Session");
  ctx.logger.info("auth.session_revoked", { userId, sessionId: id });
}

/** Revoke all of my sessions except the current one. Returns how many were revoked. */
export async function revokeOtherSessions(
  ctx: AppContext,
  userId: string,
  currentSessionId: string | null,
): Promise<number> {
  const where = currentSessionId
    ? and(eq(session.userId, userId), ne(session.id, currentSessionId))
    : eq(session.userId, userId);
  const deleted = await ctx.db.delete(session).where(where).returning({ id: session.id });
  ctx.logger.info("auth.other_sessions_revoked", { userId, count: deleted.length });
  return deleted.length;
}
