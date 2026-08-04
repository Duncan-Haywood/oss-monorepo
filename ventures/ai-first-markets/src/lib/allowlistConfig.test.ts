import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * The sign-in allowlist is configuration, and it is server-only. This file
 * holds both of those claims to the source rather than to a comment.
 *
 * Two defects are guarded here, and this venture has been bitten by the shape
 * of each:
 *
 * 1. **A claim bound to a different field than the one that acts.**
 *    `wrangler.jsonc` set `ALLOWED_EMAIL` and `.env.example` documented it
 *    while `auth.ts` compared against a string compiled into the module and
 *    read no variable at all. The configuration said the allowlist was the
 *    operator's to edit; the code said one address on earth, and no test
 *    disagreed. The checks below hold the name the code reads to the names the
 *    configuration sets.
 *
 * 2. **The client/server boundary, in both directions.** A `"use client"`
 *    module that reads a server variable ships its value into the HTML (a
 *    leak); a client module that reads a server-only variable sees `undefined`
 *    forever (the feature is off and nothing notices). `auth.ts` reads
 *    `process.env` in every export, so the safe rule is that no module which
 *    reaches the browser may reach `auth.ts` at all. That is checked over the
 *    real import graph, not by reading the files and forming an opinion.
 */

const SRC = resolve(process.cwd(), "src");
const VENTURE = resolve(process.cwd());
const AUTH_MODULE = join(SRC, "lib", "auth.ts");

/** Every TypeScript module under src, as absolute path → source. */
function sourceFiles(dir = SRC): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [name, source] of sourceFiles(path)) found.set(name, source);
    } else if (/\.tsx?$/.test(entry.name)) {
      found.set(path, readFileSync(path, "utf8"));
    }
  }
  return found;
}

const FILES = sourceFiles();

/** The module specifiers a source imports, in any of the forms used here. */
function importSpecifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) found.push(match[1]);
  return found;
}

/**
 * Resolves a first-party specifier to a file under src, or null for a package.
 * Mirrors the `@/*` → `./src/*` mapping in tsconfig.json.
 */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (FILES.has(candidate)) return candidate;
  }
  return null;
}

/** Every first-party module reachable from `roots` by following imports. */
function importClosure(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importSpecifiers(FILES.get(file) ?? "")) {
      const target = resolveSpecifier(file, specifier);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

/** The modules Next.js sends to the browser, plus everything they pull in. */
function clientModules(): string[] {
  return [...FILES.entries()]
    .filter(([, source]) => /^\s*["']use client["']/m.test(source))
    .map(([path]) => path);
}

const shown = (path: string) => relative(VENTURE, path);

test("the variable the code reads is the variable the configuration sets", () => {
  const auth = FILES.get(AUTH_MODULE);
  assert.ok(auth, "src/lib/auth.ts is gone; this contract has nothing to check");

  const declared = auth.match(/export const ALLOWED_EMAIL_VAR = "([^"]+)"/);
  assert.ok(declared, "src/lib/auth.ts no longer names the allowlist variable");
  const name = declared[1];

  // A declared name that nothing reads is exactly the defect this file exists
  // for, so the read itself is asserted, not just the declaration.
  assert.match(
    auth,
    /process\.env\[ALLOWED_EMAIL_VAR\]/,
    "the allowlist variable is declared but never read out of the environment",
  );

  const wranglerSource = readFileSync(join(VENTURE, "wrangler.jsonc"), "utf8");
  let wrangler: { vars?: Record<string, unknown> };
  try {
    wrangler = JSON.parse(wranglerSource);
  } catch {
    assert.fail(
      "wrangler.jsonc no longer parses as JSON; teach this contract to strip its comments before trusting it",
    );
  }
  assert.ok(
    wrangler.vars && name in wrangler.vars,
    `wrangler.jsonc sets no ${name} var, so the deployed Worker admits nobody`,
  );

  const envExample = readFileSync(join(VENTURE, ".env.example"), "utf8");
  assert.match(
    envExample,
    new RegExp(`^${name}=`, "m"),
    `.env.example documents a different variable than the one the code reads`,
  );

  const deployDoc = readFileSync(join(VENTURE, "cloudflare", "DEPLOY.md"), "utf8");
  assert.ok(
    deployDoc.includes(`\`${name}\``),
    "cloudflare/DEPLOY.md tells the operator to set a variable the code does not read",
  );
});

test("no address is compiled into the allowlist module", () => {
  // A hardcoded fallback is how the previous allowlist survived being "made
  // configurable": the variable is read, and then an address stands in when it
  // is missing, so the misconfiguration never surfaces.
  const auth = FILES.get(AUTH_MODULE)!;
  const code = auth
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const literal = code.match(/["'`][^"'`\s]+@[^"'`\s]+\.[a-z]{2,}["'`]/i);
  assert.equal(
    literal,
    null,
    `src/lib/auth.ts contains the address literal ${literal?.[0]}; the allowlist must come from configuration only`,
  );
});

test("nothing that reaches the browser can reach the allowlist module", () => {
  const clients = clientModules();
  assert.ok(
    clients.length > 0,
    'no "use client" module was found; if this app really has none, this check is passing over nothing',
  );

  const reachable = importClosure(clients);
  assert.equal(
    reachable.has(AUTH_MODULE),
    false,
    `a client module imports ${shown(AUTH_MODULE)}: ${clients
      .map(shown)
      .join(", ")}. Every export there reads process.env, which in the browser ` +
      "is either baked into the HTML or undefined forever.",
  );
});

test("the import graph this contract walks actually resolves", () => {
  // Without this, a resolver that silently returned null for everything would
  // make the check above pass by finding nothing at all.
  const middleware = join(SRC, "middleware.ts");
  assert.ok(FILES.has(middleware), "src/middleware.ts is gone");
  const reachable = importClosure([middleware]);
  assert.ok(
    reachable.has(AUTH_MODULE),
    "the resolver cannot see that the middleware imports the auth module, so it cannot be trusted to see a client module doing it",
  );
  assert.ok(FILES.size >= 20, `expected the src tree to be walked, saw ${FILES.size} modules`);
});

test("no rendered page or component ever holds the allowlist itself", () => {
  // `isEmailAllowed` and `isAllowlistConfigured` answer yes/no about a caller
  // and are safe anywhere on the server. The list and the raw variable are
  // different: a page holding either can print it, and the login and
  // unauthorized pages — both reachable without a session — used to do exactly
  // that with the address that was compiled in.
  const offenders: string[] = [];
  for (const [path, source] of FILES) {
    if (/\.test\.tsx?$/.test(path)) continue;
    const isRendered = path.startsWith(join(SRC, "app")) || path.startsWith(join(SRC, "components"));
    if (!isRendered) continue;
    if (/getAllowedEmails|ALLOWED_EMAIL/.test(source)) offenders.push(shown(path));
  }
  assert.deepEqual(
    offenders.sort(),
    [],
    "these render output and hold the allowlist; pass a boolean instead so the addresses cannot reach the markup",
  );
});
