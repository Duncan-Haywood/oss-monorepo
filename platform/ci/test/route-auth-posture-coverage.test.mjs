import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { VENTURE_CATALOG } from '../src/pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const VENTURES_DIR = path.join(REPO_ROOT, 'ventures');

/**
 * Every app package that serves HTTP route handlers has a route auth-posture
 * contract, or a tracked, expiring, counted exception saying it does not.
 *
 * Four ventures wrote one of these contracts by hand after four separate route
 * audits, and each audit found a hole that reading the code had missed —
 * unguarded operator handlers in print-atelier (SEC-019), a public prefix that
 * matched its siblings in docs-site (SEC-020). What none of that produced was a
 * control. Nothing held a *fifth* venture to having a contract, nothing noticed
 * when a venture grew its first API route, and nothing stopped a contract file
 * from being deleted or quietly excluded from the run. The roadmap said as much:
 * "three hand-written files, not a control."
 *
 * This is the control. It scans for route handlers rather than trusting a list,
 * so a new app package with an API surface fails here until someone decides
 * which of the two entries below it gets.
 *
 * It deliberately does not check what any contract *says*. Posture is a
 * venture-local judgement about a venture-local guard — middleware in two of
 * them, a proxy in one, handler calls in another — and a repository-wide test
 * that tried to model all four would model none of them correctly. What it
 * checks is that a contract exists, reads the routes off disk rather than from a
 * hard-coded list, and is actually collected by the gate the venture runs.
 */

/** Directories that hold build output or dependencies, never source routes. */
const NOT_SOURCE = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.vercel',
  'dist',
  'out',
  'build',
  'coverage',
  '.git',
]);

/**
 * Every app package with route handlers, and what covers it.
 *
 * `contract` is a path, relative to the package root, to the venture-local
 * posture contract. `gap` records a package that has none yet, and follows the
 * exception register's shape for the same reason it does: an exception nobody
 * re-reads is a policy change made without review, and one whose size is not
 * recorded grows for free.
 *
 * `handlers` on a gap is the exact number of undeclared handlers accepted. It
 * fails high — the gap grew and nobody decided that — and low — the register is
 * stale. Same contract as `count` in platform/exception-register.yaml.
 */
const REGISTRY = {
  'ventures/ai-first-markets': { contract: 'src/lib/routeAuthPosture.test.ts' },
  'ventures/local-site-studio': { contract: 'src/lib/routeAuthPosture.test.ts' },
  'ventures/photo-editing/docs-site': { contract: 'src/lib/routeAuthPosture.test.ts' },
  'ventures/print-atelier': { contract: 'tests/api-route-guard-contract.test.ts' },

  // Was a sized, dated gap: the largest route surface in the repository, and
  // the only venture with a live production deployment. The gap's reasoning was
  // that writing a posture contract against 32 handlers is a review of 32
  // handlers, which is the work rather than the writing — so it was scheduled
  // rather than done badly in passing. `agent/route-posture-repo-gate` did that
  // review, and the contract landed in the 2026-08-03 integration: 13 tests,
  // passing, collected by the venture's `vitest run`. Registered on 2026-08-03.
  'ventures/quick-pick-survey': { contract: 'src/lib/routeAuthPosture.test.ts' },
};

/** The longest number of days an unwritten contract may stay unwritten. */
const MAX_EXPIRY_DAYS = 180;

/** Recursively collects `route.*` modules under `dir`. */
function routeModulesUnder(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (NOT_SOURCE.has(entry.name)) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) routeModulesUnder(entryPath, found);
    else if (/^route\.(ts|tsx|js|mjs|jsx)$/.test(entry.name)) found.push(entryPath);
  }
  return found;
}

/** Every directory under `ventures/` that could be an app package root. */
function candidateAppRoots(dir = VENTURES_DIR, depth = 0, found = []) {
  if (depth > 3) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || NOT_SOURCE.has(entry.name)) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.name === 'app') found.push(entryPath);
    else candidateAppRoots(entryPath, depth + 1, found);
  }
  return found;
}

/**
 * App packages that serve route handlers, as package root -> handler count.
 *
 * The package root is what a venture's gates run from — the directory holding
 * `app/` or `src/app/` — which is also the key the CI catalog uses.
 */
function routeBearingPackages() {
  const packages = new Map();
  for (const appRoot of candidateAppRoots()) {
    const modules = routeModulesUnder(appRoot);
    if (modules.length === 0) continue;

    const parent = path.dirname(appRoot);
    const packageRoot = path.basename(parent) === 'src' ? path.dirname(parent) : parent;
    const key = path.relative(REPO_ROOT, packageRoot);

    let handlers = 0;
    for (const module of modules) {
      const source = fs.readFileSync(module, 'utf8');
      handlers += [
        ...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+([A-Z]+)\b/g),
      ].length;
    }
    packages.set(key, (packages.get(key) ?? 0) + handlers);
  }
  return packages;
}

/** Turns a shell path glob into an anchored regular expression. */
function globToRegExp(glob) {
  const pattern = glob
    .split(/(\*\*\/|\*\*|\*|\?)/)
    .map((part) => {
      if (part === '**/') return '(?:.*/)?';
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      if (part === '?') return '[^/]';
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${pattern}$`);
}

/**
 * What `sh` leaves of an *unquoted* glob before the test runner ever sees it.
 *
 * npm runs scripts under `sh`, which has no globstar, so an unquoted
 * `src/**\/*.test.ts` expands to `src/*\/*.test.ts` — exactly one directory
 * level. Quoting the same pattern passes it through untouched and the runner
 * globs it itself, with globstar.
 *
 * The difference decides whether a contract is collected. Reading an unquoted
 * `**` as multi-level would vouch for a contract sitting one directory deeper
 * than `sh` can reach — a file that is never run, reported here as covered.
 */
function shellExpanded(glob) {
  return glob.replace(/\*\*\//g, '*/').replace(/\*\*/g, '*');
}

/** The `include` patterns a vitest config declares, if it declares any. */
function vitestIncludes(packageRoot) {
  for (const name of ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js']) {
    const configPath = path.join(packageRoot, name);
    if (!fs.existsSync(configPath)) continue;
    const match = fs.readFileSync(configPath, 'utf8').match(/\binclude:\s*\[([^\]]*)\]/);
    if (!match) return null;
    return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
  }
  return null;
}

/**
 * Whether the venture's `test` script collects `contract`.
 *
 * Two script shapes exist in this repository and both are modelled: an explicit
 * list of paths or globs (`node --test src/**\/*.test.ts`), and a bare runner
 * that uses its own include patterns (`vitest run`). Anything else fails as
 * unrecognized rather than passing — a script this cannot read is a script whose
 * coverage it cannot vouch for, and guessing is how a gate stops binding.
 */
function collects(packageRoot, contract, script) {
  if (!script) return { ok: false, why: 'the package.json declares no `test` script' };

  const tokens = script.split(/\s+/).filter(Boolean);
  const paths = tokens
    .filter((token) => !token.startsWith('-'))
    // A quoted token reaches the runner intact; an unquoted one is whatever
    // `sh` made of it. Both appear in this repository and they collect
    // different files, so the quoting is carried, not discarded.
    .map((token) => {
      const quoted = /^(['"]).*\1$/.test(token);
      return { glob: quoted ? token.slice(1, -1) : token, quoted };
    })
    .filter(({ glob }) => /[/*]/.test(glob));

  if (paths.length > 0) {
    const matched = paths.some(({ glob, quoted }) =>
      globToRegExp(quoted ? glob : shellExpanded(glob)).test(contract)
    );
    return matched
      ? { ok: true }
      : { ok: false, why: `\`${script}\` names paths, and none of them match it` };
  }

  const runner = tokens.find((token) => /^(vitest|jest|mocha)$/.test(path.basename(token)));
  if (runner && path.basename(runner) === 'vitest') {
    const includes = vitestIncludes(packageRoot) ?? [
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      // vitest's default, spelled out; the brace form above is not expanded by
      // globToRegExp, so the plain forms carry the match.
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.test.js',
      '**/*.test.mjs',
    ];
    const matched = includes.some((glob) => globToRegExp(glob).test(contract));
    return matched
      ? { ok: true }
      : {
          ok: false,
          why: `vitest's include patterns (${includes.join(', ')}) do not match it`,
        };
  }

  return {
    ok: false,
    why:
      `this check cannot read the test script \`${script}\`. Add its shape to ` +
      '`collects()` in platform/ci/test/route-auth-posture-coverage.test.mjs ' +
      'rather than assuming the contract runs',
  };
}

/** The catalog entry that runs a package's gates, if one does. */
function catalogEntryFor(packageRoot) {
  return VENTURE_CATALOG.find(
    (component) => (component.packageDir || component.dir) === packageRoot
  );
}

function testScriptFor(packageRoot) {
  const packageJson = path.join(REPO_ROOT, packageRoot, 'package.json');
  if (!fs.existsSync(packageJson)) return null;
  return JSON.parse(fs.readFileSync(packageJson, 'utf8')).scripts?.test ?? null;
}

test('Route Posture Coverage - the route scan finds app packages at all', () => {
  // A scan that silently returns nothing makes every check below vacuous, which
  // is the exact failure this file exists to prevent elsewhere.
  const packages = routeBearingPackages();
  assert.ok(
    packages.size > 0,
    'No route handlers found anywhere under ventures/. Either every app moved ' +
      'or the handler pattern changed; this control verifies nothing until ' +
      'that is fixed.'
  );
});

test('Route Posture Coverage - every app package with routes is registered', () => {
  const unregistered = [...routeBearingPackages()]
    .filter(([packageRoot]) => !(packageRoot in REGISTRY))
    .map(([packageRoot, handlers]) => `${packageRoot} (${handlers} handlers)`);

  assert.deepEqual(
    unregistered,
    [],
    'These packages serve HTTP route handlers and no route auth-posture ' +
      'contract covers them. Every route audit this repository has run found a ' +
      'handler that was public and not meant to be, so an unreviewed route ' +
      'surface is the default-unsafe case.\n' +
      'Write the contract and register its path, or register a gap with an ' +
      'owner, an issue, a reason and an expiry, in ' +
      'platform/ci/test/route-auth-posture-coverage.test.mjs:\n  ' +
      unregistered.join('\n  ')
  );
});

test('Route Posture Coverage - no registry entry outlives its routes', () => {
  const live = routeBearingPackages();
  const stale = Object.keys(REGISTRY).filter((packageRoot) => !live.has(packageRoot));

  assert.deepEqual(
    stale,
    [],
    'These registry entries name packages that no longer serve route handlers. ' +
      'A stale entry reads as coverage and covers nothing:\n  ' + stale.join('\n  ')
  );
});

test('Route Posture Coverage - every registered contract exists and runs', () => {
  const broken = [];

  for (const [packageRoot, entry] of Object.entries(REGISTRY)) {
    if (!entry.contract) continue;

    const contractPath = path.join(REPO_ROOT, packageRoot, entry.contract);
    if (!fs.existsSync(contractPath)) {
      broken.push(`${packageRoot}: ${entry.contract} does not exist`);
      continue;
    }

    // A contract that hard-codes its route list stops covering the venture the
    // moment a route is added, which is precisely when it is needed. Every
    // contract written so far reads the app directory; requiring that keeps the
    // next one honest. This is a source check, not a behavioural one — it
    // cannot prove the scan is used, only that the file does not simply assert
    // against a literal list.
    const source = fs.readFileSync(contractPath, 'utf8');
    if (!/\breaddir(Sync)?\b/.test(source)) {
      broken.push(
        `${packageRoot}: ${entry.contract} never reads the app directory, so it ` +
          'cannot notice a route that was added after it was written'
      );
    }

    if (!catalogEntryFor(packageRoot)) {
      broken.push(
        `${packageRoot}: no CI catalog entry runs this package's gates, so the ` +
          'contract never executes in CI'
      );
      continue;
    }

    const scripts = catalogEntryFor(packageRoot).scripts || [];
    if (catalogEntryFor(packageRoot).type === 'node' && !scripts.includes('test')) {
      broken.push(
        `${packageRoot}: the CI catalog runs ${scripts.join(', ') || 'no scripts'} ` +
          'for this package and never `test`, so the contract never executes'
      );
      continue;
    }

    const { ok, why } = collects(
      path.join(REPO_ROOT, packageRoot),
      entry.contract,
      testScriptFor(packageRoot)
    );
    if (!ok) broken.push(`${packageRoot}: ${entry.contract} is not collected — ${why}`);
  }

  assert.deepEqual(
    broken,
    [],
    'These posture contracts are registered but do not bind:\n  ' + broken.join('\n  ')
  );
});

test('Route Posture Coverage - every gap is owned, reasoned, sized and expiring', () => {
  const live = routeBearingPackages();
  const problems = [];
  const today = new Date(new Date().toISOString().slice(0, 10));

  for (const [packageRoot, entry] of Object.entries(REGISTRY)) {
    if (!entry.gap) continue;
    const { owner, issue, reason, expires, handlers } = entry.gap;

    for (const [field, value] of Object.entries({ owner, issue, reason, expires })) {
      if (!value || String(value).trim() === '') {
        problems.push(`${packageRoot}: gap has no ${field}`);
      }
    }
    if (reason && reason.trim().length < 60) {
      problems.push(
        `${packageRoot}: the gap's reason states no decision. Say why the ` +
          'contract does not exist yet and what writing it involves'
      );
    }

    if (expires) {
      const expiryDate = new Date(expires);
      if (Number.isNaN(expiryDate.getTime())) {
        problems.push(`${packageRoot}: expires '${expires}' is not a date`);
      } else {
        const days = Math.round((expiryDate - today) / 86_400_000);
        if (days < 0) {
          problems.push(
            `${packageRoot}: the gap expired ${-days} days ago. Write the ` +
              'contract, or re-decide the exception in review and re-date it'
          );
        } else if (days > MAX_EXPIRY_DAYS) {
          problems.push(
            `${packageRoot}: expires ${expires}, ${days} days out. A gap nobody ` +
              `re-reads is a policy change made without review; ${MAX_EXPIRY_DAYS} ` +
              'days is the limit, as it is in the exception register'
          );
        }
      }
    }

    const actual = live.get(packageRoot);
    if (actual !== undefined && handlers !== actual) {
      problems.push(
        `${packageRoot}: the gap accepts ${handlers} undeclared handlers and the ` +
          `package now serves ${actual}. ` +
          (actual > handlers
            ? 'The unreviewed surface grew. Review the new handlers, then raise ' +
              'the number deliberately.'
            : 'The register is stale; lower the number.')
      );
    }
  }

  assert.deepEqual(
    problems,
    [],
    'Registered gaps that are not real exceptions:\n  ' + problems.join('\n  ')
  );
});

test('Route Posture Coverage - no gap is tracked for a package that has a contract', () => {
  const resolved = [];

  for (const [packageRoot, entry] of Object.entries(REGISTRY)) {
    if (!entry.gap) continue;
    const candidates = [
      'src/lib/routeAuthPosture.test.ts',
      'tests/api-route-guard-contract.test.ts',
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(REPO_ROOT, packageRoot, candidate))) {
        resolved.push(`${packageRoot}: ${candidate} exists — register it instead of a gap`);
      }
    }
  }

  assert.deepEqual(
    resolved,
    [],
    'A gap is tracked for a package that already has a contract, so the ' +
      'contract is not being held to any of the checks above:\n  ' + resolved.join('\n  ')
  );
});
