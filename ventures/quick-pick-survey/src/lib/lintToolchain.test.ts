import { existsSync, readFileSync, readdirSync } from "fs";
import { createRequire } from "module";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * The lint gate has to be able to run.
 *
 * `npm run lint` is the third step of `npm run verify` and of the `pairwise`
 * arm of `scripts/ci/verify-component.sh`, which runs under `set -euo pipefail`
 * and is the fail-closed gate a deploy of this venture goes through. On
 * 2026-08-08 that gate stopped being able to reach a lint finding at all: it
 * crashed with `TypeError: expand is not a function` and exit code 2.
 *
 * The cause was an `overrides` entry, not a lint rule. `brace-expansion` was
 * pinned to `^5.0.9` for every consumer in the tree. v5's CommonJS build
 * exports an object — `{ EXPANSION_MAX, EXPANSION_MAX_LENGTH, expand }` —
 * whereas v1 exports the function itself, and `minimatch@3.1.5`, which
 * `@eslint/config-array` uses to match config globs, does
 * `var expand = require('brace-expansion')` and then calls it. Every layer
 * agreed: the manifest was valid, `npm ci` succeeded, the lockfile matched, and
 * `npm audit` reported zero vulnerabilities. Only running the gate showed it.
 *
 * A crashing gate is worse than a failing one, because "it errored" and "it
 * found nothing" both leave no findings behind. So the contract below is
 * behavioural and runs against the really-resolved dependency tree rather than
 * against the manifest text: a manifest assertion would have passed on the
 * broken tree, which is exactly how this shipped.
 */

const require_ = createRequire(import.meta.url);
const ROOT = process.cwd();

/**
 * Every copy of `minimatch` npm actually installed, at any nesting depth.
 *
 * Enumerated from the tree rather than from a list of the ones we happen to
 * know about: the defect was a transitive consumer nobody had in mind, and a
 * hand-written list would not have contained it.
 */
function installedMinimatches(dir = join(ROOT, "node_modules"), depth = 0): string[] {
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

function versionOf(packageDir: string): string {
  return JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).version;
}

describe("lint toolchain", () => {
  const minimatches = installedMinimatches();

  it("finds the minimatch copies the gate depends on", () => {
    // Guards the two tests below against passing vacuously over an empty set —
    // a resolution change that removed minimatch entirely would otherwise read
    // as health.
    expect(minimatches.length, "installed copies of minimatch").toBeGreaterThan(0);
  });

  it("expands a brace pattern in every installed minimatch", () => {
    // `{ts,tsx}` is the shape eslint.config.mjs and the Next.js shareable
    // config match files with, and brace expansion is the single code path the
    // override broke. Calling it is the whole assertion: under the bad
    // override this throws rather than returning a wrong answer.
    const broken: string[] = [];

    for (const dir of minimatches) {
      const version = versionOf(dir);
      try {
        const loaded = require_(dir);
        const Minimatch = loaded.Minimatch ?? loaded.default?.Minimatch;
        expect(Minimatch, `minimatch@${version} exports Minimatch`).toBeTypeOf("function");

        const matcher = new Minimatch("**/*.{ts,tsx}");
        if (!matcher.match("src/lib/lintToolchain.test.ts")) {
          broken.push(`minimatch@${version} (${dir}) did not match a .ts path`);
        }
      } catch (error) {
        broken.push(`minimatch@${version} (${dir}) threw: ${(error as Error).message}`);
      }
    }

    expect(broken, "minimatch copies that cannot expand a brace pattern").toEqual([]);
  });

  it("keeps every brace-expansion on a patched release of its own major line", () => {
    // The override existed for a reason — CVE-2025-5889, the ReDoS in
    // brace-expansion — and the cheapest way to make the crash above go away is
    // to delete the override and drop back under the patch floor. That would be
    // green everywhere else, so it is checked here: each major line keeps the
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
      const path = existsSync(nested)
        ? nested
        : join(ROOT, "node_modules", "brace-expansion");
      if (existsSync(path)) resolved.add(versionOf(path));
    }

    expect(resolved.size, "resolved brace-expansion versions").toBeGreaterThan(0);

    const unpatched = [...resolved].filter((version) => {
      const floor = FLOOR[version.split(".")[0]];
      return floor !== undefined && compare(version, floor) < 0;
    });

    expect(unpatched, "brace-expansion versions below the CVE-2025-5889 fix").toEqual([]);
  });
});
