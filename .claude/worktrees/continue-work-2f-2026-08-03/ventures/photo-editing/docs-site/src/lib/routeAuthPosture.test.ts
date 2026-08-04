import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { isPublicPath } from "./auth.ts";

/**
 * Every route handler this app serves declares whether it answers anonymous
 * callers, and that declaration is checked against the real `isPublicPath`.
 *
 * This is a private documentation site: the middleware matches every path and
 * demands a password session, a token session, a bearer token or basic auth
 * before anything renders. The one way past it is `isPublicPath`, a list of
 * literals in `auth.ts`. Adding a route under a listed prefix makes it public
 * without anyone deciding it should be, and this venture had no test of any
 * kind under `src` to notice. A new handler now fails until it is listed below,
 * and a listed one fails if `isPublicPath` stops agreeing.
 *
 * What this checks is reachability — whether an anonymous request gets past the
 * middleware to the handler at all. It does not check what the handler then
 * does with that request.
 */

const APP_ROOT = join(process.cwd(), "src/app");
const AUTH_LIB = join(process.cwd(), "src/lib/auth.ts");
const MIDDLEWARE = join(process.cwd(), "src/middleware.ts");

/**
 * The declared auth posture of every handler, as `<path> <METHOD>`.
 *
 * `public` means an anonymous caller reaches the handler by design, and the
 * reason must name why that is safe — "it is public" is not a reason.
 * `guarded` means the middleware must turn an anonymous caller away.
 */
const POSTURE: Record<string, { posture: "public" | "guarded"; reason: string }> = {
  "/api/auth/login POST": {
    posture: "public",
    reason:
      "This is the login endpoint, so it cannot require a session to reach. It authenticates the caller itself: verifyAccessToken compares against DOCS_SITE_TOKEN in constant time, an unset token 503s rather than admitting everyone, and a wrong token gets a 401 with no session cookie.",
  },
  "/api/auth/logout POST": {
    posture: "public",
    reason:
      "Sign-out. It expires the session cookie and returns success; it reads no state, and requiring a valid session to end one would strand a caller holding a broken cookie.",
  },
  "/api/health GET": {
    posture: "public",
    reason:
      "Uptime probe, which runs without credentials by design. Its whole body is a fixed ok flag and the service name — no version, no configuration, no state — so it confirms only what a DNS lookup already confirms.",
  },
  "/robots.txt GET": {
    posture: "public",
    reason:
      "Crawler-facing by definition; a robots file behind auth cannot do its job. It is generated from static text and reads nothing.",
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
 * The last handler's body runs to the end of the file, which is fine: what is
 * asked of a body is only whether it exists.
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

/** The body of `isPublicPath` as it ships. */
function publicPathRule(): string {
  const source = readFileSync(AUTH_LIB, "utf8");
  const from = source.indexOf("export function isPublicPath");
  assert.notEqual(from, -1, "isPublicPath is no longer declared in src/lib/auth.ts");
  return source.slice(from, source.indexOf("\n}", from));
}

test("every route handler declares an auth posture", () => {
  const undeclared: string[] = [];
  for (const [path, source] of routeSources()) {
    for (const method of handlers(source).keys()) {
      const name = `${path} ${method}`;
      if (!(name in POSTURE)) {
        undeclared.push(name);
      }
    }
  }
  assert.deepEqual(
    undeclared.sort(),
    [],
    "these handlers ship without anyone deciding whether they answer anonymous callers; add them to POSTURE",
  );
});

test("each declared posture is the one isPublicPath enforces", () => {
  const wrong: string[] = [];
  for (const [name, { posture }] of Object.entries(POSTURE)) {
    const path = name.slice(0, name.lastIndexOf(" "));
    const actual = isPublicPath(path) ? "public" : "guarded";
    if (actual !== posture) {
      wrong.push(`${name}: declared ${posture}, isPublicPath serves it as ${actual}`);
    }
  }
  assert.deepEqual(
    wrong.sort(),
    [],
    "isPublicPath and the declared posture disagree; one of them changed without the other",
  );
});

test("no posture is declared for a handler that no longer exists", () => {
  const real = new Set<string>();
  for (const [path, source] of routeSources()) {
    for (const method of handlers(source).keys()) {
      real.add(`${path} ${method}`);
    }
  }
  const stale = Object.keys(POSTURE).filter((name) => !real.has(name));
  assert.deepEqual(stale, [], "POSTURE entries for handlers that no longer exist");
});

test("every public handler carries a reason naming why anonymous access is safe", () => {
  for (const [name, { posture, reason }] of Object.entries(POSTURE)) {
    if (posture !== "public") continue;
    assert.ok(
      reason.trim().length > 40,
      `${name} needs a reason for being reachable without a session, not just the label`,
    );
  }
});

test("no public prefix opens a path it does not name", () => {
  // `startsWith("/api/health")` exempts `/api/health-internal` and
  // `/api/healthz` too — sibling names, not children. A prefix rule may only
  // open a subtree, so every one of them has to stop on a path boundary.
  const leaky = [...publicPathRule().matchAll(/pathname\.startsWith\("([^"]+)"\)/g)]
    .map((match) => match[1])
    .filter((prefix) => !prefix.endsWith("/"));
  assert.deepEqual(
    leaky,
    [],
    "these prefixes match sibling paths as well as children; end them with `/` or compare with `===`",
  );
});

test("a path that merely starts like a public one is still refused", () => {
  // The regression the rule above caught: `/api/health` was a `startsWith`
  // prefix, so every one of these reached the app without credentials on a
  // site whose entire purpose is being private.
  for (const pathname of [
    "/api/healthz",
    "/api/health-internal",
    "/api/health/secrets",
    "/logins",
    "/login/../admin",
    "/robots.txt.bak",
    "/_nextdoor",
  ]) {
    assert.equal(isPublicPath(pathname), false, `${pathname} is reachable without credentials`);
  }
});

test("the paths that are meant to be public still are", () => {
  // The other half of the regression: a fix that closed the hole by closing
  // everything would lock out login and break the crawler contract.
  for (const pathname of ["/login", "/api/auth/login", "/api/health", "/robots.txt", "/favicon.ico"]) {
    assert.equal(isPublicPath(pathname), true, `${pathname} must stay reachable`);
  }
});

test("isPublicPath is built only out of rules this contract understands", () => {
  // The two checks above read `===` and `startsWith` clauses. A clause of any
  // other shape — a regular expression, a negation, an env lookup — would be
  // invisible to them, and they would keep passing over a rule they no longer
  // describe.
  const clauses = publicPathRule()
    .slice(publicPathRule().indexOf("return"))
    .split("||")
    .map((clause) => clause.replace(/[\s();]|return/g, ""))
    .filter(Boolean);
  const unknown = clauses.filter(
    (clause) => !/^pathname(===|\.startsWith)"[^"]+"$/.test(clause),
  );
  assert.deepEqual(
    unknown,
    [],
    "isPublicPath gained a clause shape this contract cannot evaluate; teach it the new shape",
  );
  assert.ok(clauses.length >= 5, `expected the clauses to be parsed, saw ${clauses.length}`);
});

test("the middleware still asks isPublicPath before it asks for credentials", () => {
  // Every posture above is a claim about the middleware, not about the helper.
  // If the middleware stopped consulting it, or consulted it after granting
  // access, the declarations would be describing nothing.
  const source = readFileSync(MIDDLEWARE, "utf8");
  const consults = source.indexOf("isPublicPath(pathname)");
  const refuses = source.indexOf("unauthorizedResponse()");
  assert.notEqual(consults, -1, "the middleware no longer consults isPublicPath");
  assert.ok(consults < refuses, "isPublicPath is consulted after the refusal path, not before it");
});

test("the middleware still runs on the paths this contract reasons about", () => {
  // A matcher that excluded /api would make every posture above a claim about
  // a middleware that never sees the request.
  const source = readFileSync(MIDDLEWARE, "utf8");
  const matcher = source.slice(source.indexOf("export const config")).replace(/\s+/g, " ");
  assert.match(
    matcher,
    /matcher: \["\/\(\(\?!_next\/static\|_next\/image\|favicon\.ico\)\.\*\)"\]/,
    "the middleware matcher changed; confirm it still covers /api before trusting the postures above",
  );
});

test("it finds the routes at all, so an empty pass cannot look like a green one", () => {
  // Without this, moving or renaming the app directory would make every check
  // above pass over nothing.
  const routes = routeSources();
  assert.ok(routes.size >= 4, `expected the route modules to be found, saw ${routes.size}`);
  const total = [...routes.values()].reduce((count, source) => count + handlers(source).size, 0);
  assert.ok(total >= 4, `expected handlers to be parsed, saw ${total}`);
});

test("the handler parser separates handlers rather than returning one blob", () => {
  // A parser that returned the whole file per route would let one declared
  // method vouch for an undeclared one beside it. This is the case that hides.
  const parsed = handlers(
    [
      "export async function POST(request: Request) {",
      "  return NextResponse.json({});",
      "}",
      "export function GET() {",
      "  return NextResponse.json({});",
      "}",
    ].join("\n"),
  );
  assert.deepEqual([...parsed.keys()], ["POST", "GET"]);
});

test("the paths this contract reads are the ones the app serves", () => {
  assert.equal(relative(process.cwd(), APP_ROOT), join("src", "app"));
  assert.equal(relative(process.cwd(), AUTH_LIB), join("src", "lib", "auth.ts"));
  assert.equal(relative(process.cwd(), MIDDLEWARE), join("src", "middleware.ts"));
});
