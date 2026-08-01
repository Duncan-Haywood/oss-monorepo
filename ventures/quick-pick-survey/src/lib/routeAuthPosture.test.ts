/**
 * Route auth-posture contract.
 *
 * Every HTTP handler this venture serves must declare, here, whether it
 * answers anonymous callers — and the declaration is checked against what the
 * handler actually does, so it cannot drift into fiction.
 *
 * This is the largest API surface in the repository and the only venture
 * serving live production traffic, and until now nothing forced that decision.
 * `routeInventory.test.ts` is a close cousin, but it checks the route set
 * against docs/ROUTES.md — the *existence* of routes, not their posture.
 *
 * Two things about this venture shape the contract:
 *
 * 1. `src/proxy.ts` authenticates nothing. It matches `/api/:path*` but only
 *    checks origin and body size, and `checkOrigin` deliberately allows a
 *    request with no Origin header, so curl bypasses it entirely. All
 *    authorization is in-handler. A test below pins that, because the whole
 *    declaration rests on it: if someone adds authentication to the proxy,
 *    this file is describing a world that no longer exists and should fail
 *    until it is re-read.
 *
 * 2. Guards are return-value-based — `getSessionUser()` returns null, it does
 *    not throw and does not return a Response. So a contract that asked "does
 *    this handler import an auth helper?" would be worse than nothing here:
 *    four handlers (`session/start`, `feedback`, `report`, `usage`) call
 *    `getSessionUser()` for attribution and rate-limit exemption only, and
 *    would be waved through as guarded. The `guarded` check below therefore
 *    requires a refusal, not a mention.
 *
 * The vocabulary has three values, not two, because two would lie:
 *
 *   guarded     an anonymous caller is refused (401/403/404).
 *   public      an anonymous caller gets a normal, useful response by design.
 *   capability  no session is required; possession of an unguessable
 *               identifier IS the credential. Calling these `guarded` would
 *               overstate them and `public` would understate them. They are
 *               the anonymous-participant endpoints, and the honest name for
 *               what protects them is "the id is hard to guess".
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API_ROOT = join(process.cwd(), "src/app/api");
const PROXY = join(process.cwd(), "src/proxy.ts");

type Posture = "guarded" | "public" | "capability";

const POSTURE: Record<string, { posture: Posture; reason: string }> = {
  // --- admin -------------------------------------------------------------
  "/api/admin/export GET": {
    posture: "guarded",
    reason: "Exports survey data in bulk; refuses without a valid admin session cookie.",
  },
  "/api/admin/overview GET": {
    posture: "guarded",
    reason: "Aggregate operational counts across all participants; admin session required.",
  },
  "/api/admin/report POST": {
    posture: "guarded",
    reason: "Generates an operator report over all responses; admin session required.",
  },
  "/api/admin/login POST": {
    posture: "public",
    reason:
      "The admin authentication entrypoint itself, so it must answer anonymous callers. It compares the supplied key and is rate limited per IP; see SEC-021 on why that limit is weaker than it looks.",
  },
  "/api/admin/logout POST": {
    posture: "public",
    reason:
      "Deletes the caller's own admin cookie and nothing else. An anonymous caller can only log itself out, which is not an effect worth authenticating.",
  },

  // --- account auth ------------------------------------------------------
  "/api/auth/login POST": {
    posture: "public",
    reason:
      "The account authentication entrypoint, necessarily anonymous. Rate limited per email and per IP, and hashes a dummy password on miss so timing does not reveal whether an account exists.",
  },
  "/api/auth/signup POST": {
    posture: "public",
    reason:
      "Account creation, necessarily anonymous. Rate limited per IP to 8 per window so it cannot be used to bulk-create accounts.",
  },
  "/api/auth/logout POST": {
    posture: "public",
    reason:
      "Destroys the caller's own session cookie. An anonymous caller can only end its own session, so authenticating it would add nothing.",
  },
  "/api/auth/forgot-password POST": {
    posture: "public",
    reason:
      "Password reset request, necessarily anonymous. Returns the same response whether or not the address exists, so it cannot be used to enumerate accounts, and is rate limited per IP.",
  },
  "/api/auth/reset-password POST": {
    posture: "capability",
    reason:
      "The emailed reset token is the credential. The token row is claimed atomically with a usedAt guard so it cannot be replayed, and every existing session is destroyed after a successful reset.",
  },
  "/api/auth/me GET": {
    posture: "public",
    reason:
      "Reads the caller's own session. Anonymous callers are not refused — they receive {user: null}, which discloses nothing — so this answers anonymously by design rather than being guarded.",
  },

  // --- couple mode (account-scoped) --------------------------------------
  "/api/couple/create POST": {
    posture: "guarded",
    reason: "Creates a couple owned by the signed-in account; refuses anonymous callers with 401.",
  },
  "/api/couple/join POST": {
    posture: "guarded",
    reason: "Joins the signed-in account to a couple; refuses anonymous callers with 401.",
  },
  "/api/couple/compare GET": {
    posture: "guarded",
    reason: "Reads both partners' answers, the most sensitive read in the app; account required.",
  },
  "/api/couple/challenge POST": {
    posture: "guarded",
    reason: "Writes a challenge against the signed-in account's couple; account required.",
  },
  "/api/couple/challenge GET": {
    posture: "guarded",
    reason: "Reads the signed-in account's couple challenges; account required.",
  },

  // --- participant-scoped: the capability set ----------------------------
  // These grant read and destructive write access to anyone holding an
  // anonymous participant or trial id. That is the product decision — the
  // survey is usable without an account — but it is a capability, not a guard,
  // and naming it accurately is the point of this contract.
  "/api/trials/next POST": {
    posture: "capability",
    reason:
      "Serves the next trial for a participant id. mayAccessOwnedParticipant admits anonymous participants by design, so the unguessable participant id is the only credential.",
  },
  "/api/trials/answer POST": {
    posture: "capability",
    reason:
      "Records an answer against a trial id. Anonymous participants are admitted by design, so the unguessable trial id is the credential.",
  },
  "/api/trials/skip POST": {
    posture: "capability",
    reason:
      "Skips a trial by id. Anonymous participants are admitted by design, so the unguessable trial id is the credential.",
  },
  "/api/trials/undo POST": {
    posture: "capability",
    reason:
      "Deletes the most recent answer for a participant id. This is the one destructive write in the capability set and it carries no rate limit; recorded as a residual risk in SEC-021.",
  },
  "/api/financial-trials/next POST": {
    posture: "capability",
    reason:
      "Serves the next financial trial for a participant id, admitting anonymous participants exactly as the main trial route does.",
  },
  "/api/financial-trials/answer POST": {
    posture: "capability",
    reason:
      "Records a financial-trial answer against a trial id, admitting anonymous participants exactly as the main trial route does.",
  },
  "/api/insights POST": {
    posture: "capability",
    reason:
      "Returns computed insights for the participant ids supplied. accessibleParticipantIds filters to ids the caller may see and admits anonymous participants, so the ids are the credential.",
  },
  "/api/session/status POST": {
    posture: "capability",
    reason:
      "Reports progress for the participant ids supplied, filtered through accessibleParticipantIds; anonymous participants are admitted, so the ids are the credential.",
  },

  // --- anonymous by design -----------------------------------------------
  "/api/session/start POST": {
    posture: "public",
    reason:
      "Starts a survey session for an anonymous visitor — this is the product's front door. getSessionUser() is consulted for attribution and rate-limit exemption only, never to refuse.",
  },
  "/api/surveys/[slug] GET": {
    posture: "public",
    reason:
      "Returns a survey's id, slug, title and description so the public survey page can render. No participant data is reachable through it.",
  },
  "/api/feedback POST": {
    posture: "public",
    reason:
      "Accepts feedback from anonymous respondents by design. getSessionUser() is consulted only to exempt accounts from the per-IP rate limit, never to refuse the request.",
  },
  "/api/report POST": {
    posture: "public",
    reason:
      "Accepts an abuse or content report from anonymous respondents. getSessionUser() is consulted only for rate-limit exemption, never to refuse.",
  },
  "/api/usage POST": {
    posture: "public",
    reason:
      "Records anonymous usage telemetry for the survey UI. getSessionUser() is consulted only for rate-limit exemption, never to refuse.",
  },
  "/api/health GET": {
    posture: "public",
    reason:
      "Liveness probe for the load balancer, which cannot authenticate. It returns the deployed RELEASE_REVISION, which is a deliberate and minor disclosure noted in SEC-021.",
  },
  "/api/health/ready GET": {
    posture: "public",
    reason:
      "Readiness probe issuing SELECT 1, called by infrastructure that cannot authenticate. Returns no application data.",
  },
  "/api/og/couple-card GET": {
    posture: "public",
    reason:
      "Renders an Open Graph share image from query parameters, so it must be fetchable by social crawlers that never authenticate. Its unbounded, attacker-controlled text is recorded in SEC-021.",
  },
};

/** Handler bodies proving a guard is enforced rather than merely mentioned. */
const GUARD_CALL = /getSessionUser\(|verifySessionToken\(|verifyAdminKey\(/;
const REFUSAL = /status:\s*(401|403|404)/;
const CAPABILITY_CALL =
  /mayAccessOwnedParticipant\(|accessibleParticipantIds\(|passwordResetToken|resetToken|usedAt/;

/** Recursively collect route modules, mirroring what Next.js actually serves. */
function routeSources(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      routeSources(full, out);
    } else if (/^route\.(ts|tsx)$/.test(entry.name)) {
      const urlPath =
        "/api" +
        relative(API_ROOT, dir)
          .split(sep)
          .filter(Boolean)
          .map((segment) => (/^\(.*\)$/.test(segment) ? "" : segment))
          .filter(Boolean)
          .reduce((acc, segment) => `${acc}/${segment}`, "");
      out.set(urlPath, readFileSync(full, "utf8"));
    }
  }
  return out;
}

/** Split a module into per-handler slices, so one guarded method cannot vouch for its neighbour. */
function handlers(source: string): Array<{ method: string; body: string }> {
  const re = /export\s+(?:async\s+)?function\s+([A-Z][A-Z0-9_]*)\s*\(/g;
  const found: Array<{ method: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    found.push({ method: match[1], index: match.index });
  }
  return found.map((entry, i) => ({
    method: entry.method,
    body: source.slice(entry.index, i + 1 < found.length ? found[i + 1].index : source.length),
  }));
}

function discovered(): Array<{ key: string; body: string }> {
  const rows: Array<{ key: string; body: string }> = [];
  for (const [urlPath, source] of routeSources(API_ROOT)) {
    for (const { method, body } of handlers(source)) {
      rows.push({ key: `${urlPath} ${method}`, body });
    }
  }
  return rows;
}

describe("route auth posture", () => {
  it("makes every handler declare whether it answers anonymous callers", () => {
    const undeclared = discovered()
      .map((row) => row.key)
      .filter((key) => !(key in POSTURE))
      .sort();
    expect(undeclared).toEqual([]);
  });

  it("has no declaration for a handler that no longer exists", () => {
    const live = new Set(discovered().map((row) => row.key));
    expect(Object.keys(POSTURE).filter((key) => !live.has(key)).sort()).toEqual([]);
  });

  it("requires a guarded handler to actually refuse, not merely mention a guard", () => {
    // The check that stops the four attribution-only handlers being waved
    // through: calling getSessionUser() is not guarding, refusing is.
    const notRefusing = discovered()
      .filter((row) => POSTURE[row.key]?.posture === "guarded")
      .filter((row) => !(GUARD_CALL.test(row.body) && REFUSAL.test(row.body)))
      .map((row) => row.key)
      .sort();
    expect(notRefusing).toEqual([]);
  });

  it("requires a capability handler to check the capability it claims", () => {
    const unchecked = discovered()
      .filter((row) => POSTURE[row.key]?.posture === "capability")
      .filter((row) => !CAPABILITY_CALL.test(row.body))
      .map((row) => row.key)
      .sort();
    expect(unchecked).toEqual([]);
  });

  it("makes anonymous access carry a stated reason", () => {
    const thin = Object.entries(POSTURE)
      .filter(([, value]) => value.posture !== "guarded")
      .filter(([, value]) => value.reason.trim().length <= 40)
      .map(([key]) => key)
      .sort();
    expect(thin).toEqual([]);
  });

  it("still rests on a proxy that authenticates nothing", () => {
    // The premise of every `public` and `capability` entry above. If the proxy
    // grows authentication, the postures declared here stop being the whole
    // story and this file must be re-read rather than silently trusted.
    const proxy = readFileSync(PROXY, "utf8");
    expect(proxy).toContain('matcher: "/api/:path*"');
    expect(proxy).not.toMatch(/getSessionUser|verifySessionToken|verifyAdminKey/);
  });

  it("finds the routes at all, so an empty pass cannot look like a green one", () => {
    const routes = routeSources(API_ROOT);
    const total = discovered().length;
    expect(routes.size).toBeGreaterThanOrEqual(31);
    expect(total).toBeGreaterThanOrEqual(32);
    expect(relative(process.cwd(), API_ROOT)).toBe(join("src", "app", "api"));
  });

  it("parses each handler separately rather than as one blob", () => {
    const parsed = handlers(
      [
        "export async function GET(req) { await getSessionUser(); return json({}, { status: 401 }); }",
        "export function POST(req) { return json({}); }",
      ].join("\n"),
    );
    expect(parsed.map((entry) => entry.method)).toEqual(["GET", "POST"]);
    expect(REFUSAL.test(parsed[0].body)).toBe(true);
    expect(REFUSAL.test(parsed[1].body)).toBe(false);
  });
});
