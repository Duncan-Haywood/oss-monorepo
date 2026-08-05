import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every route handler this app serves declares whether it answers anonymous
 * callers, and that declaration is checked against what the middleware
 * actually does to its path.
 *
 * This venture guards routes in `src/middleware.ts`, not inside the handlers,
 * and the middleware defaults to deny — an unmatched path is redirected to
 * `/login`. The hole that leaves is `PUBLIC_PATHS`, which is matched by
 * *prefix*: `"/api/auth"` exempts the whole `/api/auth/*` subtree, so a new
 * handler dropped in beside the OAuth callback is public before anyone has
 * decided it should be. Nothing prompts that decision today. This contract is
 * the prompt: a new handler fails until it is listed below, and a listed one
 * fails if the middleware stops treating it the way the list claims.
 *
 * What this checks is reachability — whether an anonymous request gets past the
 * middleware to the handler at all. It does not check what the handler then
 * does with that request.
 */

const VENTURE_ROOT = existsSync(join(process.cwd(), "src/middleware.ts"))
  ? process.cwd()
  : join(process.cwd(), "ventures/ai-first-markets");
const APP_ROOT = join(VENTURE_ROOT, "src/app");
const MIDDLEWARE = join(VENTURE_ROOT, "src/middleware.ts");

/**
 * The declared auth posture of every handler, as `<path> <METHOD>`.
 *
 * `public` means an anonymous caller reaches the handler by design, and the
 * reason must name why that is safe — "it is public" is not a reason.
 * `guarded` means the middleware must turn an anonymous caller away.
 */
const POSTURE: Record<string, { posture: "public" | "guarded"; reason: string }> = {
  "/api/auth/google/callback GET": {
    posture: "public",
    reason:
      "Google redirects the browser here with no session yet, so it cannot require one. It establishes the session, and admits the caller only if isEmailAllowed accepts the address Google returned.",
  },
  "/api/auth/session GET": {
    posture: "public",
    reason:
      "Sign-out. It deletes the auth cookie and redirects to a sanitized same-origin path; there is nothing behind it to protect and requiring a session to end one is a lockout.",
  },
  "/api/auth/session POST": {
    posture: "public",
    reason:
      "Sign-out, as the GET above. Deletes the auth cookie and returns success; it reads no state and reveals nothing about whether a session existed.",
  },
  "/api/subscribe POST": {
    posture: "public",
    reason:
      "Newsletter signup from the marketing page, which anonymous visitors are the entire audience for. It validates the address and returns a result; it reads no account state and echoes back only what the caller sent.",
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

/** The `PUBLIC_PATHS` literal the middleware actually ships. */
function publicPaths(): string[] {
  const source = readFileSync(MIDDLEWARE, "utf8");
  const match = source.match(/const PUBLIC_PATHS = \[([^\]]*)\]/);
  assert.ok(match, "PUBLIC_PATHS is no longer a literal array in src/middleware.ts");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

/**
 * Whether an anonymous request for `pathname` gets past the middleware.
 *
 * This mirrors `isPublicPath` rather than importing it — the function is
 * module-local to the middleware. The mirror is only trustworthy while the
 * original still matches this rule, which is what
 * "the rule this contract mirrors is the rule the middleware runs" checks.
 */
function reachableAnonymously(pathname: string): boolean {
  return publicPaths().some((path) => pathname === path || pathname.startsWith(`${path}/`));
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

test("each declared posture is the one the middleware enforces", () => {
  const wrong: string[] = [];
  for (const [name, { posture }] of Object.entries(POSTURE)) {
    const path = name.slice(0, name.lastIndexOf(" "));
    const actual = reachableAnonymously(path) ? "public" : "guarded";
    if (actual !== posture) {
      wrong.push(`${name}: declared ${posture}, middleware serves it as ${actual}`);
    }
  }
  assert.deepEqual(
    wrong.sort(),
    [],
    "PUBLIC_PATHS and the declared posture disagree; one of them changed without the other",
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

test("the rule this contract mirrors is the rule the middleware runs", () => {
  // reachableAnonymously() re-implements isPublicPath because the original is
  // module-local. If the original's matching rule changes, the mirror starts
  // answering for a middleware that no longer exists — and every check above
  // would keep passing while meaning nothing. Fail here instead.
  const source = readFileSync(MIDDLEWARE, "utf8");
  const rule = source
    .slice(source.indexOf("function isPublicPath"), source.indexOf("export async function middleware"))
    .replace(/\s+/g, " ");
  assert.match(
    rule,
    /PUBLIC_PATHS\.some\( \(path\) => pathname === path \|\| pathname\.startsWith\(`\$\{path\}\/`\), \)/,
    "isPublicPath no longer matches by exact-or-prefix; update reachableAnonymously to match before trusting this file",
  );
});

test("the middleware still runs on the paths this contract reasons about", () => {
  // Every check above assumes the middleware sees API requests at all. A
  // matcher that excluded /api would make the guarded declarations false while
  // leaving this file green.
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
  assert.ok(routes.size >= 3, `expected the route modules to be found, saw ${routes.size}`);
  const total = [...routes.values()].reduce((count, source) => count + handlers(source).size, 0);
  assert.ok(total >= 4, `expected handlers to be parsed, saw ${total}`);
  assert.ok(publicPaths().length >= 3, "expected PUBLIC_PATHS to be parsed out of the middleware");
});

test("the handler parser separates handlers rather than returning one blob", () => {
  // A parser that returned the whole file per route would let one declared
  // method vouch for an undeclared one beside it. This is the case that hides.
  const parsed = handlers(
    [
      "export async function GET(request: NextRequest) {",
      "  return NextResponse.json({});",
      "}",
      "export function POST() {",
      "  return NextResponse.json({});",
      "}",
    ].join("\n"),
  );
  assert.deepEqual([...parsed.keys()], ["GET", "POST"]);
});

test("the paths this contract reads are the ones the app serves", () => {
  assert.equal(relative(VENTURE_ROOT, APP_ROOT), join("src", "app"));
  assert.equal(relative(VENTURE_ROOT, MIDDLEWARE), join("src", "middleware.ts"));
});

test("every page the sitemap advertises can be loaded without a session", () => {
  // The app published a sitemap naming `/` at priority 1 while the middleware
  // redirected `/` to a login only the operator could pass. Anyone the sitemap
  // brought in — a prospective subscriber, a crawler — met that redirect, so
  // the venture could not acquire a customer without a code change. A URL this
  // app advertises and a URL this app serves anonymously must be the same set.
  const sitemap = readFileSync(join(APP_ROOT, "sitemap.ts"), "utf8");
  const urls = [...sitemap.matchAll(/url:\s*"([^"]+)"/g)].map((entry) => entry[1]);
  assert.ok(urls.length > 0, "no URLs parsed out of src/app/sitemap.ts");

  const unreachable = urls
    .filter((url) => url.startsWith("/"))
    .filter((url) => !reachableAnonymously(url));
  assert.deepEqual(
    unreachable,
    [],
    "the sitemap advertises these paths but the middleware turns anonymous visitors away from them",
  );
});

test("the research a subscription pays for is still behind the allowlist", () => {
  // The counterpart to the check above: the way to make the sitemap reachable
  // is to publish the landing page, not to publish the product.
  const guarded = ["/reports", "/reports/ai-market-efficiency", "/ideas", "/ideas/some-idea", "/market-map"];
  const leaked = guarded.filter((path) => reachableAnonymously(path));
  assert.deepEqual(leaked, [], "these are the paid pages and they became anonymously reachable");

  // The list above must name pages this app really has, or it guards nothing.
  for (const segment of ["reports", "ideas", "market-map"]) {
    assert.ok(
      existsSync(join(APP_ROOT, segment, "page.tsx")),
      `src/app/${segment}/page.tsx no longer exists; update the guarded list before trusting it`,
    );
  }
});
