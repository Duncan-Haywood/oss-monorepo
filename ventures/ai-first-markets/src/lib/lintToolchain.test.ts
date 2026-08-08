import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The build toolchain has to be able to run.
 *
 * `npm run lint` and `npm run cf:build` are the second and fifth steps of the
 * `ai-first-markets` arm of `scripts/ci/verify-component.sh`, which runs under
 * `set -euo pipefail`. On 2026-08-08 an `overrides` entry — not a lint rule and
 * not application code — pinned `brace-expansion` to `^5.0.9` for every
 * consumer in the resolved tree, and v5 changed its export shape in two
 * different ways at once:
 *
 *   - its CommonJS build exports an object,
 *     `{ EXPANSION_MAX, EXPANSION_MAX_LENGTH, expand }`, where v1 exported the
 *     function itself. `minimatch@3.1.5` does
 *     `var expand = require('brace-expansion')` and calls it, so every consumer
 *     of that copy — `@eslint/config-array` among them — dies with
 *     `TypeError: expand is not a function`.
 *   - its ES module build has no default export, where v2 did.
 *     `minimatch@8.0.7`, reached through `@node-minify/core`, does
 *     `import expand from 'brace-expansion'`, so `opennextjs-cloudflare build`
 *     dies with `SyntaxError: The requested module 'brace-expansion' does not
 *     provide an export named 'default'`.
 *
 * The two mechanisms surface through different module systems, so a copy of
 * minimatch can be healthy under `require` and broken under `import`. That is
 * why the contract below loads every entry point a package declares rather than
 * whichever one this test file happens to reach first — and why it is
 * behavioural against the really-resolved tree rather than an assertion about
 * package.json. On the broken tree the manifest was valid, `npm ci` succeeded,
 * the lockfile matched and `npm audit` reported zero vulnerabilities; only
 * running the code showed it.
 */

const require_ = createRequire(import.meta.url);
const ROOT = process.cwd();

/**
 * Every copy of `minimatch` npm actually installed, at any nesting depth.
 *
 * Enumerated from the tree rather than from a list of the ones we happen to
 * know about: the copy that broke `cf:build` sits four levels down under
 * `@opennextjs/cloudflare`, and a hand-written list would not have contained
 * it.
 */
function installedMinimatches(dir: string = join(ROOT, "node_modules"), depth = 0): string[] {
  if (depth > 6 || !existsSync(dir)) return [];

  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

    const path = join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      found.push(...installedMinimatches(path, depth + 1));
      continue;
    }

    if (entry.name === "minimatch" && existsSync(join(path, "package.json"))) found.push(path);
    const nested = join(path, "node_modules");
    if (existsSync(nested)) found.push(...installedMinimatches(nested, depth + 1));
  }
  return found;
}

type Manifest = {
  version: string;
  main?: string;
  module?: string;
  exports?: unknown;
};

function manifestOf(packageDir: string): Manifest {
  return JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as Manifest;
}

/**
 * The entry files a package exposes, tagged with the module system each one is
 * loaded through.
 *
 * Both are collected because the defect is per-module-system: `minimatch@8`
 * resolves a working CommonJS entry and a broken ES module entry from the same
 * directory, and the broken one is the one `opennextjs-cloudflare` reaches.
 */
function entryPoints(packageDir: string): Array<{ kind: "require" | "import"; file: string }> {
  const manifest = manifestOf(packageDir);
  const entries: Array<{ kind: "require" | "import"; file: string }> = [];

  const conditions = (manifest.exports as Record<string, unknown> | undefined)?.["."] as
    | Record<string, unknown>
    | undefined;

  const pick = (node: unknown): string | undefined => {
    if (typeof node === "string") return node;
    if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      return pick(record.default);
    }
    return undefined;
  };

  const esm = pick(conditions?.import) ?? manifest.module;
  const cjs = pick(conditions?.require) ?? manifest.main ?? "index.js";

  if (cjs && existsSync(join(packageDir, cjs))) entries.push({ kind: "require", file: join(packageDir, cjs) });
  if (esm && existsSync(join(packageDir, esm))) entries.push({ kind: "import", file: join(packageDir, esm) });

  return entries;
}

function minimatchClassOf(loaded: Record<string, unknown>): unknown {
  const direct = loaded.Minimatch;
  if (direct) return direct;
  const fallback = loaded.default as Record<string, unknown> | undefined;
  return fallback?.Minimatch;
}

describe("build toolchain", () => {
  const minimatches = installedMinimatches();

  it("finds the minimatch copies the gates depend on", () => {
    // Guards the tests below against passing vacuously over an empty set — a
    // resolution change that removed minimatch entirely would otherwise read as
    // health.
    assert.ok(minimatches.length > 0, "expected at least one installed copy of minimatch");
  });

  it("exercises both module systems", () => {
    // The `cf:build` failure was import-only. A suite that reached every
    // minimatch copy but only ever through `require` would have stayed green
    // while the venture could not build, so the presence of an ES module entry
    // in the exercised set is itself part of the contract.
    const kinds = new Set(minimatches.flatMap((dir) => entryPoints(dir).map((entry) => entry.kind)));
    assert.ok(kinds.has("require"), "expected at least one CommonJS minimatch entry point");
    assert.ok(kinds.has("import"), "expected at least one ES module minimatch entry point");
  });

  it("expands a brace pattern through every installed minimatch entry point", async () => {
    // `{js,ts}`/`{ts,tsx}` is the shape eslint.config.mjs and the Next.js
    // shareable config match files with, and brace expansion is the single code
    // path the override broke. Loading the module and calling it is the whole
    // assertion: under the bad override the CommonJS entries throw at call time
    // and the ES module entries throw at instantiation time.
    const broken: string[] = [];

    for (const dir of minimatches) {
      const { version } = manifestOf(dir);
      for (const entry of entryPoints(dir)) {
        const label = `minimatch@${version} (${entry.kind} ${entry.file})`;
        try {
          const loaded =
            entry.kind === "require"
              ? (require_(entry.file) as Record<string, unknown>)
              : ((await import(pathToFileURL(entry.file).href)) as Record<string, unknown>);

          const Minimatch = minimatchClassOf(loaded) as
            | (new (pattern: string) => { match(path: string): boolean })
            | undefined;

          if (typeof Minimatch !== "function") {
            broken.push(`${label} does not export Minimatch`);
            continue;
          }

          const matcher = new Minimatch("**/*.{ts,tsx}");
          if (!matcher.match("src/lib/lintToolchain.test.ts")) {
            broken.push(`${label} did not match a .ts path`);
          }
        } catch (error) {
          broken.push(`${label} threw: ${(error as Error).message}`);
        }
      }
    }

    assert.deepEqual(broken, [], "minimatch entry points that cannot expand a brace pattern");
  });

  it("keeps every brace-expansion on a patched release of its own major line", () => {
    // The override existed for a reason — CVE-2025-5889, the ReDoS in
    // brace-expansion — and the cheapest way to make the crashes above go away
    // is to delete the override and drop back under the patch floor. That would
    // be green everywhere else, so it is checked here: each major line keeps the
    // first release that carries the fix, and the floor is enforced per line
    // rather than by forcing one version onto consumers that cannot take it.
    const FLOOR: Record<string, string> = { "1": "1.1.12", "2": "2.0.2", "3": "3.0.1", "4": "4.0.1" };

    const compare = (a: string, b: string) => {
      const x = a.split(".").map(Number);
      const y = b.split(".").map(Number);
      for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
      return 0;
    };

    const resolved = new Set<string>();
    for (const dir of minimatches) {
      const nested = join(dir, "node_modules", "brace-expansion");
      const path = existsSync(nested) ? nested : join(ROOT, "node_modules", "brace-expansion");
      if (existsSync(path)) resolved.add(manifestOf(path).version);
    }

    assert.ok(resolved.size > 0, "expected at least one resolved brace-expansion");

    const unpatched = [...resolved].filter((version) => {
      const floor = FLOOR[version.split(".")[0]];
      return floor !== undefined && compare(version, floor) < 0;
    });

    assert.deepEqual(unpatched, [], "brace-expansion versions below the CVE-2025-5889 fix");
  });
});
