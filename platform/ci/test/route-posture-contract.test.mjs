import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every component that serves HTTP route handlers has a route auth posture
 * contract, that contract is actually run, and it accounts for every handler.
 *
 * Five ventures ship Next.js app-router handlers. Four now have a venture-local
 * contract making each handler declare whether it answers anonymous callers.
 * Those contracts were four hand-written files: nothing required the fifth
 * venture to have one, nothing noticed when a sixth venture appeared, and
 * nothing caught a contract that had quietly stopped covering half its routes.
 * A control that only exists where somebody remembered to write it is not a
 * control, and this file is the part that generalizes.
 *
 * It deliberately does not require the contracts to look alike. They do not:
 * `print-atelier` lists the handlers that are public and requires a guard call
 * in every other body, while the rest declare a posture per handler. Both hold
 * the line. So what is checked here is the property they share — that no
 * handler is unaccounted for — rather than a shape.
 *
 * This duplicates each venture's own enumeration on purpose. The venture suites
 * are the detailed check and they run in the venture's own pipeline arm; this
 * one runs in the repository suite and would still fail if a venture suite were
 * skipped, misconfigured, or never reached.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * How each component's posture contract is written.
 *
 * `guards` are the symbols that, appearing in a handler body, mean that handler
 * is accounted for without being named in the contract — that is the
 * `print-atelier` shape. A venture that names every handler needs none.
 */
const CONTRACTS = [
  {
    dir: "ventures/quick-pick-survey",
    contract: "src/lib/routeAuthPosture.test.ts",
    guards: [],
  },
  {
    dir: "ventures/local-site-studio",
    contract: "src/lib/routeAuthPosture.test.ts",
    guards: [],
  },
  {
    dir: "ventures/ai-first-markets",
    contract: "src/lib/routeAuthPosture.test.ts",
    guards: [],
  },
  {
    dir: "ventures/photo-editing/docs-site",
    contract: "src/lib/routeAuthPosture.test.ts",
    guards: [],
  },
  {
    dir: "ventures/print-atelier",
    contract: "tests/api-route-guard-contract.test.ts",
    // This venture declares only the public handlers; every other body has to
    // call requireOperator, which its own contract enforces.
    guards: ["requireOperator("],
  },
];

/** Directories never worth scanning for source. */
const IGNORED = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", ".turbo"]);

/**
 * Every directory the repository *tracks* that contains an `src/app` tree
 * serving route handlers.
 *
 * This asks git rather than walking the filesystem, and the difference is not
 * cosmetic. Walking found `src/app` trees inside `.claude/worktrees/`, where
 * four whole copies of this repository had been left by earlier agent runs, and
 * reported all five ventures four more times as unregistered components. The
 * `IGNORED` denylist below cannot fix that class of bug: it has to name each
 * offending directory in advance, and the next scratch directory is one nobody
 * has thought of yet. Anything git ignores or does not track is, by definition,
 * not part of the repository this control is describing.
 *
 * The fail-closed half survives intact. A new venture only reaches CI by being
 * committed, and the moment it is, its handlers are tracked and appear here.
 */
function componentsWithRoutes() {
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "*/src/app/**/route.ts", "*/src/app/**/route.tsx", "src/app/**/route.ts", "src/app/**/route.tsx"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  })
    .split("\0")
    .filter(Boolean);

  const found = new Set();
  for (const file of tracked) {
    // `<component>/src/app/.../route.ts` — take everything before `/src/app/`.
    const marker = file.indexOf("src/app/");
    if (marker < 0) continue;
    const component = file.slice(0, marker).replace(/\/$/, "");
    const appRoot = join(REPO_ROOT, component, "src/app");
    if (existsSync(appRoot) && routeHandlers(appRoot).size > 0) found.add(component);
  }
  return [...found];
}

/**
 * Every route handler under an `src/app` tree, as `<url path> <METHOD>` → body.
 * Route groups `(name)` organize files without appearing in the URL.
 */
function isIgnored(dirName, currentPath, appRoot) {
  const rel = relative(appRoot, currentPath);
  if (rel !== "" && !rel.startsWith("..")) {
    return dirName === "node_modules" || dirName === ".git";
  }
  return IGNORED.has(dirName);
}

/**
 * Every route handler under an `src/app` tree, as `<url path> <METHOD>` → body.
 * Route groups `(name)` organize files without appearing in the URL.
 */
function routeHandlers(appRoot, prefix = "", found = new Map()) {
  for (const entry of readdirSync(appRoot, { withFileTypes: true })) {
    const path = join(appRoot, entry.name);
    if (entry.isDirectory()) {
      if (isIgnored(entry.name, path, appRoot)) continue;
      const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
      routeHandlers(path, `${prefix}${segment}`, found);
    } else {
      const isRoute = entry.name === "route.ts" || entry.name === "route.tsx" || entry.name === "route.js" || entry.name === "route.jsx" || entry.name === "route.mjs";
      const ext = entry.name.match(/\.(ts|tsx|js|jsx|mjs)$/);
      if (!isRoute && !ext) continue;

      const source = readFileSync(path, "utf8");
      const isAction = !isRoute && (source.includes('"use server"') || source.includes("'use server'"));
      if (!isRoute && !isAction) continue;

      const handlerPattern = isRoute
        ? /export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Z][A-Z0-9_]*)\b/g
        : /export\s+(?:async\s+)?(?:function|const|let|var)\s+([a-zA-Z0-9_]+)\b/g;

      const starts = [...source.matchAll(handlerPattern)];
      starts.forEach((match, index) => {
        const from = match.index ?? 0;
        const to = index + 1 < starts.length ? (starts[index + 1].index ?? source.length) : source.length;
        found.set(`${prefix} ${match[1]}`, source.slice(from, to));
      });
    }
  }
  return found;
}

/**
 * One spelling for a handler name, so contracts that write `/api/x POST` and
 * contracts that write `x POST` compare equal.
 */
function normalize(name) {
  return name.trim().replace(/^\//, "").replace(/^api\//, "");
}

/** Every `"<path> <METHOD>"` string literal a contract file declares. */
function declaredIn(source) {
  return new Set(
    [...source.matchAll(/["'`]([^"'`\n]*?)\s+([a-zA-Z0-9_]+)["'`]\s*:/g)].map(([, path, method]) =>
      normalize(`${path} ${method}`),
    ),
  );
}

/**
 * Whether a shell glob matches a path. `sh` has no `globstar`, so `**` in a
 * package script matches a single segment exactly as `*` does — which is why
 * this is not the same function as the vitest one below.
 */
function shellGlobMatches(pattern, path) {
  const expression = pattern
    .split("/")
    .map((segment) =>
      segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*+/g, "[^/]*"),
    )
    .join("/");
  return new RegExp(`^${expression}$`).test(path);
}

// Whether a vitest `include` glob matches a path. Here a `**` segment is a real
// globstar, spanning any number of directories including none — vitest's usual
// `src/**/*.test.ts` has to match `src/x.test.ts` as well as `src/a/b/x.test.ts`.
// (Line comments, because that pattern cannot appear inside a block comment.)
function includeGlobMatches(pattern, path) {
  const expression = pattern
    .split("/")
    .map((segment) =>
      segment === "**"
        ? "(?:[^/]+/)*"
        : `${segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}/`,
    )
    .join("")
    .replace(/\/$/, "");
  return new RegExp(`^${expression}$`).test(path);
}

/** Whether a component's `npm test` would actually collect a given file. */
function isCollected(dir, contract) {
  const script = JSON.parse(readFileSync(join(REPO_ROOT, dir, "package.json"), "utf8")).scripts?.test;
  if (!script) return false;

  // Named outright, or reached by a glob — but by whose expansion matters, and
  // the quoting is what decides it. `--test src/**/*.test.ts` is expanded by
  // sh, which has no globstar, so `**` collapses to one segment. Quote it —
  // `--test 'src/**/*.test.ts'` — and sh hands the pattern through untouched
  // for node's own test-runner glob, which does support `**`. Treating both the
  // same way reports a quoted globstar as unreachable when it reaches fine;
  // ai-first-markets' contract was failed by exactly that while `npm test` was
  // demonstrably running it.
  const tokens = script.split(/\s+/).filter((token) => !token.startsWith("-"));
  const collectedByArgument = tokens.some((token) => {
    const quoted = /^(['"]).*\1$/.test(token);
    const pattern = quoted ? token.slice(1, -1) : token;
    if (pattern === contract) return true;
    return quoted ? includeGlobMatches(pattern, contract) : shellGlobMatches(pattern, contract);
  });
  if (collectedByArgument) return true;

  // Or reached by a vitest `include` pattern.
  const config = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js"]
    .map((name) => join(REPO_ROOT, dir, name))
    .find(existsSync);
  if (!config) return false;
  const include = readFileSync(config, "utf8").match(/include:\s*\[([^\]]*)\]/);
  const patterns = include
    ? [...include[1].matchAll(/["']([^"']+)["']/g)].map(([, pattern]) => pattern)
    : ["**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.mjs"];
  return patterns.some((pattern) => includeGlobMatches(pattern, contract));
}

test("every component that serves route handlers has a registered posture contract", () => {
  // The fail-closed half: a new venture with an API shows up here as a failure
  // rather than as an absence nobody sees.
  const registered = new Set(CONTRACTS.map((entry) => entry.dir));
  const unregistered = componentsWithRoutes().filter((dir) => !registered.has(dir));
  assert.deepEqual(
    unregistered.sort(),
    [],
    "these components serve route handlers with no route auth posture contract; write one and register it above",
  );
});

test("an untracked scratch copy of a component is not mistaken for a new one", () => {
  // The regression. Four copies of this repository under `.claude/worktrees/`
  // made this control report all five ventures four extra times, and the fix
  // has to hold for a scratch directory nobody has named yet — so the fixture
  // deliberately is not `.claude`, and is not in `IGNORED`.
  const name = "scratch-route-posture-fixture";
  const fixture = join(REPO_ROOT, name, "src", "app", "api", "thing");
  mkdirSync(fixture, { recursive: true });
  try {
    writeFileSync(join(fixture, "route.ts"), "export async function GET() { return new Response('x') }\n");
    // Untracked and *not* gitignored, so passing this means the scanner keys on
    // what git tracks rather than on any denylist. `.gitignore` matching alone
    // would not have caught this fixture.
    assert.equal(
      execFileSync("git", ["ls-files", "--", name], { cwd: REPO_ROOT, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim(),
      "",
      "fixture must be untracked for this test to mean anything",
    );
    let ignored = true;
    try {
      execFileSync("git", ["check-ignore", "-q", "--", name], { cwd: REPO_ROOT, stdio: "ignore", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
    } catch {
      ignored = false; // check-ignore exits 1 when the path is not ignored
    }
    assert.equal(ignored, false, "fixture must not be gitignored, or it would prove only that the ignore list works");
    assert.ok(
      !componentsWithRoutes().includes(name),
      "an untracked directory serving route handlers was reported as a component of this repository",
    );
  } finally {
    rmSync(join(REPO_ROOT, name), { recursive: true, force: true });
  }
});

test("every registered contract still belongs to a component that serves routes", () => {
  const withRoutes = new Set(componentsWithRoutes());
  const stale = CONTRACTS.map((entry) => entry.dir).filter((dir) => !withRoutes.has(dir));
  assert.deepEqual(stale, [], "registered contracts for components that no longer serve route handlers");
});

test("every registered contract file exists", () => {
  const missing = CONTRACTS.filter(({ dir, contract }) => !existsSync(join(REPO_ROOT, dir, contract)));
  assert.deepEqual(
    missing.map(({ dir, contract }) => `${dir}/${contract}`),
    [],
    "registered contract files that are not there",
  );
});

test("every contract is actually collected by its component's test command", () => {
  // A test file existing is not a gate. This repository has already shipped a
  // contract that sat unrun for a day because the runner named files one by one
  // and never reached it.
  const unreached = CONTRACTS.filter(({ dir, contract }) => !isCollected(dir, contract)).map(
    ({ dir, contract }) => `${dir}/${contract}`,
  );
  assert.deepEqual(
    unreached,
    [],
    "these contracts are never run by their component's `npm test`; fix the test script or the include pattern",
  );
});

test("every contract enumerates its routes from disk rather than hardcoding them", () => {
  // A contract holding a fixed list of routes stops describing the app the
  // moment a route is added, and keeps passing while it does.
  const hardcoded = CONTRACTS.filter(({ dir, contract }) => {
    const source = readFileSync(join(REPO_ROOT, dir, contract), "utf8");
    return !source.includes("readdirSync");
  }).map(({ dir, contract }) => `${dir}/${contract}`);
  assert.deepEqual(hardcoded, [], "these contracts do not read the route tree, so they cannot notice a new route");
});

test("every route handler in every component is accounted for by its contract", () => {
  // The coverage half, and the reason this file duplicates work the venture
  // suites already do: it is what catches a contract that stopped covering its
  // own app, whether or not that venture's suite ran.
  const unaccounted = [];
  for (const { dir, contract, guards } of CONTRACTS) {
    const source = readFileSync(join(REPO_ROOT, dir, contract), "utf8");
    const declared = declaredIn(source);
    for (const [name, body] of routeHandlers(join(REPO_ROOT, dir, "src/app"))) {
      if (declared.has(normalize(name))) continue;
      if (guards.some((guard) => body.includes(guard))) continue;
      unaccounted.push(`${dir}: ${name.trim()}`);
    }
  }
  assert.deepEqual(
    unaccounted.sort(),
    [],
    "these handlers are neither declared in their contract nor guarded; nobody has decided who may reach them",
  );
});

test("the scan finds the components and handlers, so an empty pass cannot look like a green one", () => {
  // Without this, a rename of `src/app` would make every check above pass over
  // nothing — which is the exact failure mode this file exists to catch.
  const components = componentsWithRoutes();
  assert.ok(components.length >= 5, `expected the route-serving components to be found, saw ${components.length}`);

  const total = CONTRACTS.reduce(
    (count, { dir }) => count + routeHandlers(join(REPO_ROOT, dir, "src/app")).size,
    0,
  );
  assert.ok(total >= 60, `expected the handlers to be parsed, saw ${total}`);

  for (const { dir, contract } of CONTRACTS) {
    const declared = declaredIn(readFileSync(join(REPO_ROOT, dir, contract), "utf8"));
    const guarded = CONTRACTS.find((entry) => entry.dir === dir).guards.length > 0;
    assert.ok(declared.size > 0 || guarded, `${dir}: parsed no declarations out of ${contract}`);
  }
});

test("the collection check can tell a reached file from an unreached one", () => {
  // Both glob dialects, because getting `**` wrong in either direction would
  // silently turn the check above into a pass.
  assert.ok(includeGlobMatches("src/**/*.test.ts", "src/lib/routeAuthPosture.test.ts"));
  assert.ok(includeGlobMatches("src/**/*.test.ts", "src/a/b/c/deep.test.ts"));
  // A globstar spans no directories as readily as many, and vitest agrees.
  assert.ok(includeGlobMatches("src/**/*.test.ts", "src/flat.test.ts"));
  assert.ok(!includeGlobMatches("src/**/*.test.ts", "tests/other.test.ts"));
  assert.ok(!includeGlobMatches("src/**/*.test.ts", "src/lib/notatest.ts"));

  // `sh` has no globstar, so this pattern reaches exactly one level down.
  assert.ok(shellGlobMatches("src/**/*.test.ts", "src/lib/routeAuthPosture.test.ts"));
  assert.ok(!shellGlobMatches("src/**/*.test.ts", "src/lib/auth/nested.test.ts"));
  assert.ok(shellGlobMatches("tests/*.test.ts", "tests/api-route-guard-contract.test.ts"));
  assert.ok(!shellGlobMatches("tests/*.test.ts", "tests/nested/deep.test.ts"));
});

test("the declaration parser reads both contract shapes", () => {
  // One writes `/api/x POST`, the other writes `x POST`. If this stopped
  // reading either, the coverage check would report everything unaccounted for
  // — loud — or, if it over-matched, nothing. This pins the shape.
  const parsed = declaredIn(
    [
      'const POSTURE = {',
      '  "/api/trials/answer POST": { posture: "owner-scoped", reason: "x" },',
      '  "stripe/webhook POST": "Called by Stripe.",',
      '  "/robots.txt GET": { posture: "public", reason: "y" },',
      '};',
    ].join("\n"),
  );
  assert.deepEqual([...parsed].sort(), ["robots.txt GET", "stripe/webhook POST", "trials/answer POST"]);
});
