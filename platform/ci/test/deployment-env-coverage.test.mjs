// The enrollment half of `print-atelier-deployment-env-contract.test.mjs`.
//
// That file binds one Deployment's env list to the variables its venture reads,
// in both directions, and it is right about everything it looks at. It looks at
// one directory, named in a constant:
//
//     const APP_DIR = path.join(REPO_ROOT, 'platform/k8s/apps/print-atelier');
//
// Six of the eight apps under `platform/k8s/apps/` were held to nothing. Four of
// them read runtime environment variables and supply none — `local-site-studio`
// reads fifteen, including `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
// seven `STRIPE_PRICE_ID_*` values, with an ArgoCD Application syncing the
// directory. The contract existed for the one venture where someone happened to
// find the bug, which is the shape `docs/CONTROL-AUDIT-2026-08-04.md` finding 2
// is about: "The assertion is almost always right about the input it is given.
// The input is the defect."
//
// So this file does not re-assert what that one asserts. It asks the question
// one level up — *is every app bound to a contract at all* — and it discovers
// its subjects from `git ls-files` rather than naming them, so an app added
// tomorrow is enrolled without anyone remembering to enrol it.
//
// The rule, and it has exactly two outcomes:
//
//   * an app whose source reads runtime environment variables must be covered
//     by a contract file that actually reads that app's deployment.yaml; or
//   * it must be registered in `platform/k8s/deployment-env-coverage.yaml`,
//     where the registration is asserted to still be a genuine gap and the
//     number of registrations may fall and may never rise.
//
// Neither outcome is reachable by editing a list of expected apps, because
// there is no such list.
//
// Every parser below asserts it saw something before anything is asserted with
// it. The register parser additionally asserts it recovered *every* entry, by
// counting `- app:` lines in the raw text and comparing: a hand-rolled
// indentation parser that silently drops an item is a register with a hole in
// it, and that has happened in this repository before.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const APPS_ROOT = 'platform/k8s/apps';
const REGISTER = path.join(REPO_ROOT, 'platform/k8s/deployment-env-coverage.yaml');
const CONTRACT_DIR = path.join(REPO_ROOT, 'platform/ci/test');

/**
 * Where each app's application source lives.
 *
 * Declared rather than derived because it is not derivable: `real-estate-photo-app`
 * is served by `ventures/real-estate-agent-photo-app`, and `marisstella-homepage`
 * lives under `portfolio/`, not `ventures/`. A convention-based guess would have
 * silently mapped both to nothing and reported them as having no environment
 * reads — a passing gate over the exact case it exists to catch.
 *
 * An app with no entry here fails the enumeration test below rather than being
 * skipped, so this map cannot go stale quietly.
 */
const SOURCE_OF = {
  'ai-engineering-academy': 'ventures/ai-engineering-academy',
  'local-site-studio': 'ventures/local-site-studio',
  'marisstella-homepage': 'portfolio/marisstella-homepage',
  'print-atelier': 'ventures/print-atelier',
  'quick-pick-survey': 'ventures/quick-pick-survey',
  'real-estate-photo-app': 'ventures/real-estate-agent-photo-app',
  'retail-pilot-intel': 'ventures/retail-pilot-intel',
  'service-template': null, // a template; the register records the same fact
};

/**
 * Prefixes and names a container env entry cannot usefully supply.
 *
 * `NEXT_PUBLIC_*` and `VITE_*` are substituted into the bundle at build time, so
 * a runtime entry for one of them is configuration-shaped and inert — the worse
 * failure, because it looks supplied. `VERCEL*` is never set on this cluster and
 * its absence is load-bearing. `NODE_ENV`, `CI` and `PORT` come from the image
 * or the runtime.
 *
 * Coarse on purpose. This decides only whether an app needs a contract at all.
 * A contract, once written, classifies each variable individually with its own
 * reason and its own predicate, which is the level at which a prefix rule would
 * be a blanket exemption.
 */
const NOT_CONTAINER_SUPPLIABLE = [
  /^NEXT_PUBLIC_/,
  /^VITE_/,
  /^VERCEL/,
  /^NODE_ENV$/,
  /^CI$/,
  /^PORT$/,
  // Supplied by git and by the test runner, never by a container. It appeared
  // in local-site-studio on 2026-08-17 through a test-isolation fix
  // (`tier-price-binding.test.ts` pins it to /dev/null so `git ls-files` cannot
  // read the developer's ~/.gitconfig), and the register's ceiling for that
  // venture was raised 15 -> 16 to absorb it. A number that is meant to measure
  // the deployment gap should not move because a test hardened itself.
  /^GIT_CONFIG_GLOBAL$/,
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function gitLsFiles(...pathspecs) {
  return execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    env: GIT_ENV,
  })
    .split('\0')
    .filter(Boolean);
}

/**
 * Every app directory under `platform/k8s/apps/` that declares a Deployment.
 *
 * Read from the git index, not `readdirSync`. This repository runs many
 * concurrent agents and has already had a control count another session's
 * untracked build output; a directory that is not tracked is not what CI checks
 * out, so it is not a subject here.
 */
function deployedApps() {
  const apps = new Map();
  for (const file of gitLsFiles(APPS_ROOT)) {
    const rest = file.slice(APPS_ROOT.length + 1);
    const slash = rest.indexOf('/');
    if (slash === -1) continue;
    const app = rest.slice(0, slash);
    if (!apps.has(app)) apps.set(app, []);
    apps.get(app).push(file);
  }
  return [...apps.entries()]
    .filter(([, files]) => files.some((file) => file.endsWith('/deployment.yaml')))
    .map(([app, files]) => ({ app, files }))
    .sort((a, b) => a.app.localeCompare(b.app));
}

/**
 * The runtime environment variables an app's source reads.
 *
 * `process.env.X` only. The print-atelier contract reads four further shapes
 * because that venture uses all four; this file does not need them, because it
 * decides a yes/no question — an app that reads even one variable through the
 * plainest shape already needs a contract, and the contract is where the harder
 * shapes have to be found. Understating a count here can only ever move an app
 * from "needs a contract" to "needs a contract", never the other way, except for
 * an app whose *every* read is exotic. That residual case is what
 * `the scanner still sees the ventures it is known to see` below pins.
 */
function runtimeEnvReads(sourceDir) {
  if (!sourceDir) return [];
  const names = new Set();
  for (const file of gitLsFiles(sourceDir)) {
    if (!/\.(ts|tsx|mjs|cjs|js|jsx)$/.test(file)) continue;
    let text;
    try {
      text = read(path.join(REPO_ROOT, file));
    } catch {
      continue;
    }
    for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      const name = match[1];
      if (NOT_CONTAINER_SUPPLIABLE.some((pattern) => pattern.test(name))) continue;
      names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * The contract files, mapped to the app each one polices.
 *
 * An app is covered when some contract file mentions its deployment.yaml path.
 * Naming the path is the operative part: a file called
 * `<app>-deployment-env-contract.test.mjs` that stopped opening the manifest
 * would still satisfy a filename check, and a control that is green because it
 * reads nothing is this repository's most common defect.
 */
function contractCoverage() {
  const contracts = gitLsFiles('platform/ci/test').filter((file) =>
    /deployment-env.*\.test\.mjs$/.test(file)
  );
  const covered = new Map();
  for (const file of contracts) {
    if (path.join(REPO_ROOT, file) === path.join(CONTRACT_DIR, 'deployment-env-coverage.test.mjs')) {
      continue; // this file; it names every app and would cover them all
    }
    const text = read(path.join(REPO_ROOT, file));
    for (const { app } of deployedApps()) {
      if (text.includes(`${APPS_ROOT}/${app}`)) {
        if (!covered.has(app)) covered.set(app, []);
        covered.get(app).push(file);
      }
    }
  }
  return covered;
}

/**
 * The register, parsed by indentation.
 *
 * Hand-rolled because `platform/ci` has no dependencies and Node ships no YAML
 * parser — the same trade `print-atelier-deployment-env-contract.test.mjs`
 * documents. The risk of a hand-rolled parser is that it drops an item and the
 * register quietly shrinks, so `parsedEntryCount` is compared against a raw
 * count of `- app:` lines by the first test below. A parser that loses an entry
 * fails rather than excusing it.
 */
function parseRegister() {
  const text = read(REGISTER);
  const lines = text.split('\n');

  const sections = { no_application_source: [], registered: [] };
  const budget = {};
  let section = null;
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;

    const top = line.match(/^([a-z_]+):\s*$/);
    if (top) {
      section = top[1];
      current = null;
      continue;
    }

    if (section === 'budget') {
      const kv = line.match(/^\s+([a-z_]+):\s*(\d+)\s*$/);
      if (kv) budget[kv[1]] = Number(kv[2]);
      continue;
    }

    if (section !== 'no_application_source' && section !== 'registered') continue;

    const item = line.match(/^\s*-\s+app:\s*(\S+)\s*$/);
    if (item) {
      current = { app: item[1], source: null, runtimeEnvReads: null, reason: '' };
      sections[section].push(current);
      continue;
    }
    if (!current) continue;

    const source = line.match(/^\s+source:\s*(\S+)\s*$/);
    if (source) current.source = source[1];
    const reads = line.match(/^\s+runtime_env_reads:\s*(\d+)\s*$/);
    if (reads) current.runtimeEnvReads = Number(reads[1]);
    const reason = line.match(/^\s+reason:\s*(.*)$/);
    if (reason) current.reason = reason[1];
    else if (/^\s{6,}\S/.test(line) && current.reason !== '') current.reason += ` ${line.trim()}`;
  }

  const rawItemCount = (text.match(/^\s*-\s+app:/gm) ?? []).length;
  return { budget, ...sections, rawItemCount };
}

// ---------------------------------------------------------------------------
// The parsers see something, and see all of it.
// ---------------------------------------------------------------------------

test('deployment env coverage - the register parses completely', () => {
  const register = parseRegister();
  const parsed = register.no_application_source.length + register.registered.length;

  assert.equal(
    parsed,
    register.rawItemCount,
    `parsed ${parsed} register entries but the file contains ${register.rawItemCount} "- app:" lines. ` +
      'This parser is indentation-based and has dropped an entry; a register with a hole in it excuses ' +
      'whatever fell through, so this fails rather than proceeding.'
  );
  assert.ok(parsed > 0, 'no entries parsed from platform/k8s/deployment-env-coverage.yaml');

  assert.equal(
    typeof register.budget.max_registered,
    'number',
    'the register declares no numeric budget.max_registered, so the ratchet below enforces nothing'
  );
  assert.equal(typeof register.budget.slack, 'number', 'the register declares no numeric budget.slack');

  for (const entry of [...register.no_application_source, ...register.registered]) {
    assert.ok(
      entry.reason.trim().length >= 40,
      `${entry.app}: a register entry must carry a reason. An entry with no stated reason is an ` +
        'exemption nobody can review.'
    );
  }
});

test('deployment env coverage - the app enumeration and source map see the repository', () => {
  const apps = deployedApps();
  assert.ok(
    apps.length >= 5,
    `only ${apps.length} app(s) with a deployment.yaml found under ${APPS_ROOT}. The enumeration has ` +
      'stopped seeing the tree and every assertion below is vacuous.'
  );

  const unmapped = apps.map(({ app }) => app).filter((app) => !(app in SOURCE_OF));
  assert.deepEqual(
    unmapped,
    [],
    `these apps under ${APPS_ROOT} have no entry in SOURCE_OF, so this file cannot tell whether they read ` +
      'environment variables. Add the mapping — or null, with a register entry saying why there is no ' +
      'source — rather than letting the app be skipped: ' +
      unmapped.join(', ')
  );

  for (const [app, source] of Object.entries(SOURCE_OF)) {
    if (source === null) continue;
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, source)),
      `SOURCE_OF maps ${app} to ${source}, which does not exist. A mapping to a missing directory reports ` +
        'zero environment reads, which is indistinguishable from a clean app.'
    );
  }
});

test('deployment env coverage - the scanner still sees the ventures it is known to see', () => {
  // Anchors. These two are measured facts at the time of writing, and they are
  // the difference between a scanner that works and one that returns [] for
  // everything while every assertion below passes.
  const studio = runtimeEnvReads(SOURCE_OF['local-site-studio']);
  assert.ok(
    studio.includes('STRIPE_SECRET_KEY') && studio.includes('STRIPE_WEBHOOK_SECRET'),
    'the scanner no longer finds STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in ventures/local-site-studio. ' +
      'Either the venture stopped reading them or the scan has rotted; both make this file vacuous.'
  );

  const atelier = runtimeEnvReads(SOURCE_OF['print-atelier']);
  assert.ok(
    atelier.length >= 10,
    `only ${atelier.length} runtime variables found in ventures/print-atelier; expected the scanner to see ` +
      'its credential set'
  );
});

// ---------------------------------------------------------------------------
// The rule.
// ---------------------------------------------------------------------------

test('deployment env coverage - every app that reads env is covered or registered', () => {
  const register = parseRegister();
  const covered = contractCoverage();
  const registered = new Set(register.registered.map((entry) => entry.app));
  const sourceless = new Set(register.no_application_source.map((entry) => entry.app));

  const unaccounted = [];
  for (const { app } of deployedApps()) {
    const source = SOURCE_OF[app] ?? null;
    if (source === null) {
      assert.ok(
        sourceless.has(app),
        `${app} has no application source and is not listed under no_application_source in the register`
      );
      continue;
    }
    const reads = runtimeEnvReads(source);
    if (reads.length === 0) continue; // nothing a Deployment could supply
    if (covered.has(app) || registered.has(app)) continue;
    unaccounted.push(`${app} (reads ${reads.length}: ${reads.slice(0, 5).join(', ')}…)`);
  }

  assert.deepEqual(
    unaccounted,
    [],
    'these apps read runtime environment variables, and nothing binds their Deployment to those reads. ' +
      'The pod starts, ArgoCD reports Healthy, and every feature behind an unsupplied variable is dead or ' +
      'refusing — which is exactly how print-atelier shipped a Deployment with zero env vars against twenty ' +
      'reads. Write a contract modelled on print-atelier-deployment-env-contract.test.mjs, or add an entry ' +
      'to platform/k8s/deployment-env-coverage.yaml: ' +
      unaccounted.join('; ')
  );
});

test('deployment env coverage - a registration is deleted once its contract lands', () => {
  const register = parseRegister();
  const covered = contractCoverage();

  const settled = register.registered
    .filter((entry) => covered.has(entry.app))
    .map((entry) => `${entry.app} (covered by ${covered.get(entry.app).join(', ')})`);

  assert.deepEqual(
    settled,
    [],
    'these apps now have a deployment env contract, so their entries in the register are obsolete and must ' +
      'be deleted rather than left standing as an unearned exemption — and max_registered lowered with them: ' +
      settled.join(', ')
  );

  const unknown = register.registered
    .map((entry) => entry.app)
    .filter((app) => !deployedApps().some((entry) => entry.app === app));
  assert.deepEqual(
    unknown,
    [],
    'the register names apps that have no deployment.yaml under ' +
      `${APPS_ROOT}. An entry for an app that does not exist is a place a future app can hide: ` +
      unknown.join(', ')
  );
});

test('deployment env coverage - a registered app still genuinely reads what it claims', () => {
  const register = parseRegister();

  const drifted = [];
  for (const entry of register.registered) {
    assert.ok(
      entry.source,
      `${entry.app}: register entry declares no source, so its runtime_env_reads count checks nothing`
    );
    const measured = runtimeEnvReads(entry.source).length;
    if (entry.runtimeEnvReads === null) {
      drifted.push(`${entry.app}: no runtime_env_reads recorded`);
      continue;
    }
    // The recorded figure is a fact about the gap. It may shrink as variables
    // are removed; it may not silently grow, because a growing gap under a
    // standing exemption is the exemption doing work it was never granted.
    if (measured > entry.runtimeEnvReads) {
      drifted.push(
        `${entry.app}: records ${entry.runtimeEnvReads} runtime env reads, measures ${measured}. The gap grew ` +
          'while the registration stood. Write the contract, or re-record the count deliberately.'
      );
    }
  }

  assert.deepEqual(drifted, [], drifted.join('; '));
});

test('deployment env coverage - the number of uncovered apps may fall and may never rise', () => {
  const register = parseRegister();
  const declared = register.budget.max_registered;
  const actual = register.registered.length;

  assert.ok(
    actual <= declared,
    `${actual} apps are registered without a deployment env contract, above the declared ceiling of ` +
      `${declared}. Raising max_registered is refused: the way to clear this is to write a contract for one ` +
      'of them, not to admit another.'
  );

  assert.ok(
    declared - actual <= register.budget.slack,
    `max_registered is ${declared} but only ${actual} apps are registered — the ceiling is stale by ` +
      `${declared - actual}, more than the declared slack of ${register.budget.slack}. Lower it: a ceiling ` +
      'with room in it is a ceiling that admits the next uncovered app for free.'
  );
});

test('deployment env coverage - the covering contract for print-atelier is found by content', () => {
  // The coverage map is only meaningful if it can actually detect a contract.
  // print-atelier has one; if this stops resolving, every other app would be
  // reported as needing a register entry and the register would grow to match —
  // the failure mode where a broken detector is answered by writing exemptions.
  const covered = contractCoverage();
  assert.ok(
    covered.has('print-atelier'),
    'no contract file was found naming platform/k8s/apps/print-atelier. The coverage detector has stopped ' +
      'working; do not answer this by registering apps.'
  );
});
