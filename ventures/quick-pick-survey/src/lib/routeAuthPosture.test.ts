import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every route handler this app serves declares who may reach it, and that
 * declaration is checked against the guard the handler actually calls.
 *
 * This venture has no middleware. Nothing sits in front of a handler, so a
 * route is exactly as protected as its own body makes it, and a new file under
 * `src/app/api` that forgets its guard is indistinguishable from one that has
 * it — same shape, same tests passing, no diff anywhere else. That is the case
 * this file exists to make impossible.
 *
 * The postures below are not a two-way public/guarded split, because this app
 * does not have one. Anonymous answering is the product: someone starts a
 * survey before they have an account, and their participant id — held in their
 * own localStorage — is the only thing that identifies them. So the interesting
 * boundary is not "is there a session" but "whose rows may this handler touch",
 * and `owner-scoped` is the posture that carries it. A handler that reads a
 * participant id out of a request body and does not run it through
 * `participantAccess` will happily hand one person's answers to another; see
 * the note in `participantAccess.ts` for the couples case that makes that
 * concrete.
 *
 * What this checks is which callers a handler serves. It does not check what
 * the handler then does with the request.
 */

const APP_ROOT = join(process.cwd(), "src/app");
const PROXY = join(process.cwd(), "src/proxy.ts");
const PARTICIPANT_ACCESS = join(process.cwd(), "src/lib/participantAccess.ts");
const ADMIN_AUTH = join(process.cwd(), "src/lib/adminAuth.ts");

type Posture =
  /** Reaches the handler without credentials and is answered in full. */
  | "public"
  /** Anonymous writes accepted, but the anonymous branch must be throttled. */
  | "public-throttled"
  /** Refuses without a signed-in account. */
  | "session"
  /** Anonymous-reachable, but every participant row is checked for ownership. */
  | "owner-scoped"
  /** Refuses without a valid admin session cookie. */
  | "admin";

/**
 * The symbol a handler must call to earn each posture. `public` has none —
 * that is what makes it public — so it carries the burden of a written reason
 * instead.
 */
const REQUIRED_GUARD: Record<Exclude<Posture, "public">, RegExp> = {
  "public-throttled": /isWriteRateLimited|isRateLimited/,
  session: /getSessionUser/,
  "owner-scoped": /mayAccessOwnedParticipant|accessibleParticipantIds/,
  admin: /verifySessionToken/,
};

/** A `session` handler must also actually turn the anonymous caller away. */
const REFUSAL = /status:\s*(401|403)/;

const POSTURE: Record<string, { posture: Posture; reason: string }> = {
  // --- Admin -------------------------------------------------------------
  "/api/admin/export GET": {
    posture: "admin",
    reason: "Exports participant rows including name and email as CSV.",
  },
  "/api/admin/overview GET": {
    posture: "admin",
    reason: "Returns every participant, trial, report and usage event.",
  },
  "/api/admin/report POST": {
    posture: "admin",
    reason: "Resolves user reports.",
  },
  "/api/admin/login POST": {
    posture: "public",
    reason:
      "The admin login endpoint, so it cannot require an admin session to reach. It authenticates the caller itself: verifyAdminKey compares against ADMIN_KEY in constant time and returns false when ADMIN_KEY is unset rather than admitting everyone, failures are recorded, and isRateLimited stops the key being guessed at more than 8 times per 15 minutes per IP.",
  },
  "/api/admin/logout POST": {
    posture: "public",
    reason:
      "Sign-out. It expires the admin cookie and returns ok; it reads no state and touches no row, and requiring a valid session to end one would strand an admin holding a broken cookie.",
  },

  // --- Account ------------------------------------------------------------
  "/api/auth/login POST": {
    posture: "public",
    reason:
      "The login endpoint. It authenticates the caller itself, answers a wrong email and a wrong password identically so neither confirms an account exists, records every attempt, and refuses with 429 once an email or IP has failed too often.",
  },
  "/api/auth/signup POST": {
    posture: "public",
    reason:
      "Account creation, which by definition precedes having an account. Anonymous callers are throttled per IP by isWriteRateLimited before any row is written, and an existing email is rejected with 409.",
  },
  "/api/auth/logout POST": {
    posture: "public",
    reason:
      "Sign-out. It clears the session cookie and returns ok; requiring a valid session to end one would strand a caller holding an expired or malformed cookie.",
  },
  "/api/auth/me GET": {
    posture: "public",
    reason:
      "The session probe the client uses to decide whether to render a signed-in view. It answers anonymous callers with a null user rather than a 401, which is the point of it: a 401 here would be an error the client has to swallow on every first page load. It returns only the caller's own session, never another account's.",
  },
  "/api/auth/forgot-password POST": {
    posture: "public",
    reason:
      "Password reset request, which is for people who cannot sign in. It answers the same way whether or not the email has an account, so it does not confirm membership, and it is throttled to 10 requests per IP.",
  },
  "/api/auth/reset-password POST": {
    posture: "public",
    reason:
      "Completes a reset for a caller who by definition has no session. Authorization is the emailed token, which is verified before anything is written, expired tokens are refused, and the route is throttled to 10 requests per IP.",
  },

  // --- Couples ------------------------------------------------------------
  // These are the routes the app's central privacy promise rests on: a partner
  // sees aggregate comparisons, never an individual answer.
  "/api/couple/create POST": { posture: "session", reason: "Creates a couple owned by the caller." },
  "/api/couple/join POST": { posture: "session", reason: "Attaches the caller to a couple." },
  "/api/couple/challenge POST": { posture: "session", reason: "Issues a challenge as the caller." },
  "/api/couple/challenge GET": { posture: "session", reason: "Lists the caller's challenges." },
  "/api/couple/compare GET": { posture: "session", reason: "Returns a couple comparison." },

  // --- Owner-scoped answering --------------------------------------------
  // Each of these takes a trial or participant id straight from the request
  // body. The id is the caller's own capability while the participant is
  // anonymous; once it belongs to an account, participantAccess requires that
  // account. Both halves matter — dropping the check exposes accounts, and
  // requiring a session locks anonymous people out of their own answers.
  "/api/trials/next POST": { posture: "owner-scoped", reason: "Serves the next pair." },
  "/api/trials/answer POST": { posture: "owner-scoped", reason: "Records an answer." },
  "/api/trials/skip POST": { posture: "owner-scoped", reason: "Skips a shown pair." },
  "/api/trials/undo POST": { posture: "owner-scoped", reason: "Rewinds the newest answer." },
  "/api/financial-trials/next POST": { posture: "owner-scoped", reason: "Serves the next pair." },
  "/api/financial-trials/answer POST": { posture: "owner-scoped", reason: "Records an answer." },
  "/api/insights POST": { posture: "owner-scoped", reason: "Returns a full item ranking." },
  "/api/session/status POST": { posture: "owner-scoped", reason: "Returns per-domain progress." },

  // --- Anonymous writes ---------------------------------------------------
  "/api/session/start POST": {
    posture: "public-throttled",
    reason:
      "Starting a survey without an account is the onboarding flow, so this cannot require a session. It writes only a participant row from a first name and a perspective — it deliberately no longer parses sex, age or ethnicity — and anonymous callers are throttled per IP.",
  },
  "/api/feedback POST": {
    posture: "public-throttled",
    reason:
      "Ratings and free-text feedback from people who are mid-survey and typically have no account. It attaches a user id when there is a session and throttles per IP when there is not.",
  },
  "/api/report POST": {
    posture: "public-throttled",
    reason:
      "Bug and confusion reports, which are most valuable from exactly the anonymous users who cannot sign in to file one. Anonymous callers are throttled per IP, the message and email are length-capped, and nothing is read back to the caller.",
  },
  "/api/usage POST": {
    posture: "public-throttled",
    reason:
      "Product telemetry from anonymous sessions, keyed by a hashed session key. It only appends events and reads nothing back; anonymous callers are throttled per IP.",
  },

  // --- Open reads ---------------------------------------------------------
  "/api/surveys/[slug] GET": {
    posture: "public",
    reason:
      "Survey title and description for the landing screen, which has to render before anyone has identified themselves. It selects four presentational columns of a survey definition and no participant data of any kind.",
  },
  "/api/health GET": {
    posture: "public",
    reason:
      "Liveness probe, which runs without credentials by design. Its body is a fixed status and an optional release revision; it touches no database and reads no request state.",
  },
  "/api/health/ready GET": {
    posture: "public",
    reason:
      "Readiness probe for the load balancer, which cannot hold credentials. It answers ready or unavailable and nothing else — the database error is logged server-side, never returned.",
  },
  "/api/og/couple-card GET": {
    posture: "public",
    reason:
      "The Open Graph preview image for a shared couple result. It has to answer Slack, iMessage and every other unauthenticated link crawler or the share renders blank. It cannot leak a couple's result because it never looks one up: the archetype, score, names and insight are all read from query parameters the caller supplied, so it renders back only what the sharer already put in the link.",
  },
};

/** Every route module under src/app, as served URL path → source. */
function routeSources(dir = APP_ROOT, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Route groups `(name)` organize files without appearing in the URL.
      const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
      for (const [name, source] of routeSources(path, `${prefix}${segment}`)) {
        found.set(name, source);
      }
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      found.set(prefix, readFileSync(path, "utf8"));
    }
  }
  return found;
}

/**
 * Splits a route module into its exported HTTP handlers, as method → body.
 * The last handler's body runs to the end of the file, which is fine: the
 * checks below ask a body only whether it contains a call.
 */
function handlers(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const starts = [...source.matchAll(/export (?:async )?function ([A-Z]+)\s*\(/g)];
  starts.forEach((match, index) => {
    const from = match.index ?? 0;
    const to = index + 1 < starts.length ? (starts[index + 1].index ?? source.length) : source.length;
    found.set(match[1], source.slice(from, to));
  });
  return found;
}

function everyHandler(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [path, source] of routeSources()) {
    for (const [method, body] of handlers(source)) {
      found.set(`${path} ${method}`, body);
    }
  }
  return found;
}

describe("route auth posture", () => {
  it("every route handler declares one", () => {
    const undeclared = [...everyHandler().keys()].filter((name) => !(name in POSTURE));
    expect(undeclared.sort()).toEqual([]);
  });

  it("declares nothing for a handler that no longer exists", () => {
    const real = everyHandler();
    const stale = Object.keys(POSTURE).filter((name) => !real.has(name));
    expect(stale).toEqual([]);
  });

  it("each guarded handler calls the guard its posture names", () => {
    // The declaration is a claim about the body. Without this, a handler could
    // keep its `owner-scoped` label after the participantAccess call was
    // deleted, and the label would be describing nothing.
    const real = everyHandler();
    const missing: string[] = [];
    for (const [name, { posture }] of Object.entries(POSTURE)) {
      if (posture === "public") continue;
      const body = real.get(name);
      if (body && !REQUIRED_GUARD[posture].test(body)) {
        missing.push(`${name}: declared ${posture}, body never calls ${REQUIRED_GUARD[posture].source}`);
      }
    }
    expect(missing.sort()).toEqual([]);
  });

  it("each session handler actually refuses the anonymous caller", () => {
    // Calling getSessionUser is not the same as acting on the answer. A handler
    // that reads the session and carries on regardless would satisfy the check
    // above while serving everyone.
    const real = everyHandler();
    const permissive: string[] = [];
    for (const [name, { posture }] of Object.entries(POSTURE)) {
      if (posture !== "session") continue;
      const body = real.get(name);
      if (body && !REFUSAL.test(body)) {
        permissive.push(`${name}: declared session, but no 401 or 403 in the body`);
      }
    }
    expect(permissive.sort()).toEqual([]);
  });

  it("every public handler carries a reason naming why anonymous access is safe", () => {
    for (const [name, { posture, reason }] of Object.entries(POSTURE)) {
      if (posture !== "public") continue;
      expect(reason.trim().length, `${name} needs a reason, not just the label`).toBeGreaterThan(40);
    }
  });

  it("finds the routes at all, so an empty pass cannot look like a green one", () => {
    // Without this, moving or renaming the app directory would make every check
    // above pass over nothing. The floor is the measured surface, not a round
    // number: 31 route modules exporting 32 handlers.
    const real = everyHandler();
    expect(real.size).toBeGreaterThanOrEqual(32);
  });

  it("still rests on a proxy that authenticates nothing", () => {
    // The premise under every posture above. This app has no middleware, but it
    // does have a proxy, and `src/proxy.ts` matches `/api/:path*` while checking
    // only origin and body size — `checkOrigin` deliberately admits a request
    // with no Origin header, so curl reaches the handler untouched. Every
    // declaration here is therefore a statement about the handler's own body.
    // If the proxy grows authentication, this file is describing a world that
    // no longer exists and must be re-read rather than silently trusted.
    const proxy = readFileSync(PROXY, "utf8");
    expect(proxy).toContain('matcher: "/api/:path*"');
    expect(proxy).not.toMatch(/getSessionUser|verifySessionToken|verifyAdminKey/);
  });

  it("separates handlers rather than returning one blob per file", () => {
    // A parser that returned the whole file per route would let one guarded
    // method vouch for an unguarded one beside it. This is the case that hides:
    // /api/couple/challenge really does export both GET and POST.
    const parsed = handlers(
      [
        "export async function POST(req: NextRequest) {",
        "  const user = await getSessionUser();",
        "}",
        "export function GET() {",
        "  return NextResponse.json({});",
        "}",
      ].join("\n"),
    );
    expect([...parsed.keys()]).toEqual(["POST", "GET"]);
    expect(parsed.get("GET")).not.toContain("getSessionUser");
  });

  it("the guards the postures name still exist", () => {
    // Every posture above is a claim about a helper. A rename would leave the
    // regexes matching nothing and every check silently vacuous.
    const access = readFileSync(PARTICIPANT_ACCESS, "utf8");
    expect(access).toContain("export async function mayAccessOwnedParticipant");
    expect(access).toContain("export async function accessibleParticipantIds");
    expect(readFileSync(ADMIN_AUTH, "utf8")).toContain("export function verifySessionToken");
  });

  it("reads the directory the app actually serves", () => {
    expect(relative(process.cwd(), APP_ROOT)).toBe(join("src", "app"));
  });
});

describe("the ownership guard the owner-scoped posture rests on", () => {
  // The checks above are structural: they prove the call is there. This proves
  // the call still refuses, which is the part a rewrite can quietly remove
  // while leaving every call site intact.
  it("lets an anonymous participant through", async () => {
    const { mayAccessOwnedParticipant } = await freshGuard(null);
    expect(await mayAccessOwnedParticipant(null)).toBe(true);
  });

  it("refuses an owned participant when nobody is signed in", async () => {
    const { mayAccessOwnedParticipant } = await freshGuard(null);
    expect(await mayAccessOwnedParticipant("user_1")).toBe(false);
  });

  it("refuses an owned participant to a different signed-in account", async () => {
    const { mayAccessOwnedParticipant } = await freshGuard({ id: "user_2" });
    expect(await mayAccessOwnedParticipant("user_1")).toBe(false);
  });

  it("admits the account that owns the participant", async () => {
    const { mayAccessOwnedParticipant } = await freshGuard({ id: "user_1" });
    expect(await mayAccessOwnedParticipant("user_1")).toBe(true);
  });
});

/** Loads participantAccess with getSessionUser answering `user`. */
async function freshGuard(user: { id: string } | null) {
  vi.resetModules();
  vi.doMock("@/lib/auth", () => ({ getSessionUser: async () => user }));
  vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
  return import("@/lib/participantAccess");
}
