import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * A package.json that `npm ci` refuses to install is a package nothing audits.
 *
 * `2fdcf837` added an `overrides` block to three manifests to pull pinned
 * transitive dependencies forward, and regenerated none of their lockfiles.
 * Both of the resulting failures are install-time, so those packages did not
 * merely go untested — they left the vulnerability audit entirely.
 * `scripts/security-scan.sh` reports that state as `Incomplete audit: refusing
 * to rewrite SECURITY_ROADMAP.md`, and it is recorded in
 * `docs/ENGINEERING-ROADMAP.md` under SEC-022 as the reason no HIGH ceiling can
 * be seeded: "A complete audit of this repository is not reachable today —
 * three packages fail `npm audit` with `EOVERRIDE`". Three of twelve packages
 * left the scan; `SECURITY_ROADMAP.md` then read `1 package(s) audited`,
 * `HIGH: 0`, one row, `CLEAN`. A security-motivated edit switched the security
 * gate off for a quarter of the repository and reported the result as clean,
 * and it stayed that way for over a day because nothing in CI reads a manifest.
 * `2103eb24` fixed the manifests and the lockfiles; the audit came back at 12
 * packages / 0 critical / 23 high. This file is what makes the state
 * unreachable rather than merely fixed.
 *
 * Two distinct classes, both caught here, both statically.
 *
 * CLASS 1 — UNSATISFIABLE ROOT OVERRIDE. npm's documented rule: you may not
 * override a package you directly depend on unless the override spec and the
 * direct dependency spec are **the same string**. The seven violations at
 * `d84acc27`, which this file reports in one run:
 *
 *   photo-editing/docs-site           next            "16.2.12" vs dependencies    "^15.2.4"
 *   real-estate-.../docs-site         next            "16.2.12" vs dependencies    "^14.2.35"
 *                                     eslint-config-next "16.2.12" vs devDependencies "14.1.0"
 *                                     postcss         "^8.5.18" vs devDependencies "^8"
 *   real-estate-.../research          the same three
 *
 * The last one is the reason this check compares strings and not semver ranges:
 * `^8.5.18` is a strict *subset* of `^8`, every version it admits is admitted by
 * the direct spec, and npm rejects it anyway. A check written from what the
 * specs mean rather than from what npm does would pass that manifest and the
 * install would still be broken. npm's own words are `code EOVERRIDE`,
 * `Override for <name>@<spec> conflicts with direct dependency`.
 *
 * Note where that error does *not* appear. `npm ci` reports the same manifest as
 *
 *   npm error `npm ci` can only install packages when your package.json and
 *   package-lock.json ... are in sync ...
 *
 * — `EUSAGE`, naming the lockfile, which is not the file that is wrong. The
 * documented fix for EUSAGE is `npm install`, which regenerates a lockfile that
 * was never the problem and fails again. Every failure message below therefore
 * names the manifest, the block, both specs, and the edit that resolves it.
 *
 * CLASS 2 — LOCKFILE OUT OF SYNC WITH ITS MANIFEST. A fourth package,
 * `ventures/local-site-studio`, was stale for its own reasons and had been
 * passing its gate only because a non-`ci` install papered over it: it carried
 * `overrides.sharp: "^0.35.0"` over a lockfile that still resolved sharp 0.34.5,
 * a `devDependencies` entry — `@vitest/coverage-v8@4.1.10` — absent from the
 * lockfile root, and `eslint-config-next` at 16.2.9 against a manifest asking
 * for 16.2.12. Any one of the three makes `npm ci` refuse, with the same
 * consequence for the audit.
 *
 * WHY `overrides` IS NOT COMPARED AGAINST THE LOCKFILE ROOT. It would be the
 * obvious way to catch the sharp case, and it is wrong: npm never writes
 * `overrides` into `packages[""]`. The list of manifest fields Arborist mirrors
 * there is `pkgMetaKeys` in
 * `@npmcli/arborist/lib/shrinkwrap.js` — version, dependencies,
 * peerDependencies, peerDependenciesMeta, optionalDependencies,
 * bundleDependencies, acceptDependencies, funding, engines, os, cpu, license,
 * hasInstallScript, bin, deprecated, workspaces — plus `devDependencies` for the
 * top-level node. `overrides` is not in it, confirmed empirically on npm 10.9.8
 * / Node 22.22.3 with a manifest carrying two overrides and no dependencies: the
 * generated lockfile root is `{name, version}`. Seven of this repository's
 * eleven lockfiles are in exactly that state, so asserting the key were present
 * would fail every correctly generated lockfile in the repository — a control
 * reading a surface it guessed at rather than the one that exists.
 *
 * The override half is therefore checked where the effect actually lands: every
 * resolved version of an overridden package, anywhere in the tree, must satisfy
 * the override. A lockfile generated before the override was added still pins
 * the old version, which is precisely the sharp finding. Where the lockfile root
 * *does* carry an `overrides` key — a hand edit, or a future npm — it is
 * compared too.
 *
 * SCOPE AND FAILURE DIRECTION. Nothing here shells out to npm or touches the
 * network: it is `git ls-files`, `readFileSync` and `JSON.parse`, so it runs in
 * the same second as the rest of this suite and gives the same answer on a
 * runner as on a laptop. Manifests are enumerated from git rather than by
 * walking the filesystem, for the reason `gate-glob-resolution.test.mjs` gives:
 * a walk finds `node_modules` and a developer's build output, and answers
 * differently in a clone than in a working tree with three agents in it.
 * Anything this file cannot read — a lockfileVersion 1 file with no `packages`
 * map, an override spec in a range syntax the comparator does not implement — is
 * reported as a failure naming what to extend, never skipped. A check that goes
 * quiet on the input it does not understand is indistinguishable from one that
 * passes.
 *
 * `peerDependencies` takes no part in the EOVERRIDE rule — npm applies that to
 * the three blocks an override could contradict — but Arborist does mirror it
 * into the lockfile root, so it is included in the root comparison. No manifest
 * here declares one today; it is covered so that the first one to appear is
 * covered on the commit that adds it rather than when someone remembers.
 */

/** The three blocks npm's EOVERRIDE rule and `npm ci`'s sync check both read. */
const DEPENDENCY_BLOCKS = ['dependencies', 'devDependencies', 'optionalDependencies'];

const git = (args) =>
  execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });

/** Every `package.json` git tracks, repository-relative and sorted. */
function trackedManifests() {
  return git(['ls-files', '--', '*package.json'])
    .split('\n')
    .filter((line) => path.basename(line) === 'package.json')
    .sort();
}

/**
 * CLASS 1. Root overrides whose spec differs from the direct dependency they
 * override, which is every conflict npm reports as EOVERRIDE.
 *
 * Only the top-level keys of `overrides` are root overrides. The nested form —
 * `{"foo": {"bar": "1.0.0"}}` — scopes `bar` to dependents named `foo` and never
 * conflicts with a direct dependency on `bar`, so its inner keys are not
 * compared. A nested object may itself carry a `"."` key, which *is* a spec for
 * `foo` and is compared as one, exactly as npm reads it.
 */
function rootOverrideConflicts(manifest) {
  const findings = [];
  for (const [name, value] of Object.entries(manifest.overrides || {})) {
    const spec = typeof value === 'string' ? value : value?.['.'];
    if (typeof spec !== 'string') continue;
    for (const block of DEPENDENCY_BLOCKS) {
      const direct = manifest[block]?.[name];
      if (typeof direct !== 'string') continue;
      if (direct === spec) continue;
      findings.push({ name, block, overrideSpec: spec, directSpec: direct });
    }
  }
  return findings;
}

/** One line per class 1 finding, naming both specs and the edit that fixes it. */
const describeOverrideConflict = (file, f) =>
  `${file}: overrides.${f.name} "${f.overrideSpec}" conflicts with ${f.block}.${f.name} ` +
  `"${f.directSpec}" — npm rejects this with EOVERRIDE and \`npm ci\` misreports it as ` +
  `EUSAGE against the lockfile. Fix the manifest: make ${f.block}.${f.name} the string ` +
  `"${f.overrideSpec}" (byte-identical, not merely compatible), or drop the override.`;

/**
 * CLASS 2, first half. The lockfile's root entry against the manifest that
 * generated it — the comparison `npm ci` performs before it will install.
 *
 * Returns `{ readable: false, reason }` for a lockfile this cannot compare, so
 * the caller fails on it rather than counting it as checked.
 */
function lockRootDrift(manifest, lock) {
  if (!lock || typeof lock !== 'object') {
    return { readable: false, reason: 'lockfile is not a JSON object', findings: [] };
  }
  if (!lock.packages || typeof lock.packages !== 'object') {
    return {
      readable: false,
      reason:
        `lockfileVersion ${lock.lockfileVersion ?? '<absent>'} has no \`packages\` map, so its ` +
        'root entry cannot be compared with the manifest. Regenerate it with npm 7 or newer ' +
        '(`rm package-lock.json && npm install`) to get lockfileVersion 3.',
      findings: [],
    };
  }
  const root = lock.packages[''];
  if (!root || typeof root !== 'object') {
    return {
      readable: false,
      reason: '`packages[""]` is absent, so the lockfile declares no root package',
      findings: [],
    };
  }

  const findings = [];
  for (const block of [...DEPENDENCY_BLOCKS, 'peerDependencies', 'overrides']) {
    const declared = manifest[block] || {};
    const locked = root[block];
    // npm does not mirror `overrides` into the root entry (see the header), so
    // its absence is the normal case and not a finding. Its presence is
    // compared, because something wrote it and it must not disagree.
    if (block === 'overrides' && locked === undefined) continue;
    const lockedBlock = locked || {};
    for (const name of [...new Set([...Object.keys(declared), ...Object.keys(lockedBlock)])].sort()) {
      const manifestSpec = declared[name];
      const lockSpec = lockedBlock[name];
      if (typeof manifestSpec === 'object' || typeof lockSpec === 'object') {
        if (JSON.stringify(manifestSpec) === JSON.stringify(lockSpec)) continue;
      } else if (manifestSpec === lockSpec) {
        continue;
      }
      findings.push({ block, name, manifestSpec, lockSpec });
    }
  }
  return { readable: true, reason: null, findings };
}

const describeRootDrift = (file, f) => {
  const shown = (spec) => (spec === undefined ? '<absent>' : JSON.stringify(spec));
  return (
    `${file}: ${f.block}.${f.name} is ${shown(f.manifestSpec)} in package.json and ` +
    `${shown(f.lockSpec)} in package-lock.json — \`npm ci\` refuses this with EUSAGE ` +
    '("package.json and package-lock.json are not in sync") and installs nothing, which ' +
    'takes the package out of the dependency audit. Regenerate the lockfile with ' +
    '`npm install --package-lock-only` in that directory and commit it with the manifest.'
  );
};

/**
 * CLASS 2, second half. Root dependencies with no entry in the lockfile's tree —
 * `npm ci`'s `Missing: <name>@<spec> from lock file`. A lockfile can agree with
 * the manifest's root block and still be missing the package it resolves to,
 * which is the second way `local-site-studio` was unbuildable.
 */
function lockTreeGaps(lock) {
  const root = lock?.packages?.[''];
  if (!root) return [];
  const gaps = [];
  for (const block of DEPENDENCY_BLOCKS) {
    for (const name of Object.keys(root[block] || {})) {
      if (!lock.packages[`node_modules/${name}`]) {
        gaps.push({ block, name, spec: root[block][name] });
      }
    }
  }
  return gaps;
}

const describeTreeGap = (file, f) =>
  `${file}: ${f.block}.${f.name}@${f.spec} has no \`node_modules/${f.name}\` entry in the ` +
  'lockfile — `npm ci` reports `Missing: ' +
  `${f.name}@${f.spec} from lock file\` and installs nothing. Regenerate the lockfile with ` +
  '`npm install --package-lock-only` in that directory.';

/**
 * The subset of npm's range syntax needed to check an override against a
 * resolved version. Returns null for anything else — including npm's `$name`
 * form and any prerelease — so the caller reports it rather than assuming it
 * holds.
 */
function parseSimpleRange(spec) {
  const match = /^(\^|~|>=|=)?v?(\d+)\.(\d+)\.(\d+)$/.exec(String(spec).trim());
  if (!match) return null;
  return {
    operator: match[1] || '=',
    version: [Number(match[2]), Number(match[3]), Number(match[4])],
  };
}

const compareVersions = (a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

/** True, false, or null when `version` is not a plain three-part release. */
function satisfiesSimpleRange(version, range) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) return null;
  const actual = [Number(match[1]), Number(match[2]), Number(match[3])];
  const floor = range.version;
  if (compareVersions(actual, floor) < 0) return false;
  switch (range.operator) {
    case '=':
      return compareVersions(actual, floor) === 0;
    case '>=':
      return true;
    case '~':
      return actual[0] === floor[0] && actual[1] === floor[1];
    case '^':
      if (floor[0] > 0) return actual[0] === floor[0];
      if (floor[1] > 0) return actual[0] === 0 && actual[1] === floor[1];
      return actual[0] === 0 && actual[1] === 0 && actual[2] === floor[2];
    default:
      return null;
  }
}

/**
 * `minimatch@3` -> {name: 'minimatch', range: '3'}; `minimatch` -> range null.
 * `lastIndexOf` rather than `indexOf` so a scoped name keeps its leading `@`.
 */
function parseOverrideKey(key) {
  const at = key.lastIndexOf('@');
  if (at <= 0) return { name: key, range: null };
  return { name: key.slice(0, at), range: key.slice(at + 1) };
}

/**
 * The partial ranges an override *key* is written in — `3`, `8.0`, `^3.1.2`.
 * Missing components are wildcards. Returns null when unreadable, so the
 * caller reports it rather than assuming the rule applied.
 */
function matchesKeyRange(version, rangeSpec) {
  if (rangeSpec == null) return true;
  const want = /^(\^|~|>=|=)?v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(rangeSpec).trim());
  const got = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!want || !got) return null;
  if (Number(got[1]) !== Number(want[2])) return false;
  if (want[3] !== undefined && Number(got[2]) !== Number(want[3])) return false;
  if (want[4] !== undefined && Number(got[3]) !== Number(want[4])) return false;
  return true;
}

/** `node_modules/a/node_modules/b` -> `node_modules/a/`; `node_modules/b` -> ``. */
const enclosingPrefix = (treePath) => treePath.slice(0, treePath.lastIndexOf('node_modules/'));

/** The basename a lockfile path installs, or null when it is not a tree entry. */
function installedName(treePath) {
  const at = treePath.lastIndexOf('node_modules/');
  if (at < 0) return null;
  return treePath.slice(at + 'node_modules/'.length);
}

/**
 * Which scoped rules govern the instance at `treePath`.
 *
 * npm resolves a dependency of P by walking up from P's own directory, so a
 * rule written `parent@range: {child: spec}` governs the copy of `child` that
 * `parent` actually reaches: either the one beside `parent` (the placement npm
 * picks when it has to fork the version) or the one nested inside it. A rule
 * only claims an instance when a matching `parent` entry is really there —
 * otherwise the flat override keeps the instance, and the sweep does not
 * quietly lose it.
 */
function scopedClaims(treePath, child, rules, packages, unchecked) {
  const claims = [];
  const prefix = enclosingPrefix(treePath);
  for (const rule of rules) {
    if (rule.child !== child) continue;
    // The sibling placement only exists inside another package's tree. At the
    // top level `node_modules/<child>` is the copy everything else reaches, so
    // a scoped rule never claims it — npm forks a nested copy for the parent
    // instead, and that nested copy is the second candidate.
    const candidates = prefix ? [`${prefix}node_modules/${rule.parent}`] : [];
    if (prefix.endsWith(`node_modules/${rule.parent}/`)) candidates.push(prefix.slice(0, -1));
    for (const parentPath of candidates) {
      const parent = packages[parentPath];
      if (typeof parent?.version !== 'string') continue;
      const applies = matchesKeyRange(parent.version, rule.range);
      if (applies === null) {
        unchecked.push(
          `override key "${rule.key}" is in a range syntax this test cannot evaluate against ` +
            `${parentPath}@${parent.version}`
        );
      } else if (applies) {
        claims.push(rule);
      }
      break;
    }
  }
  return claims;
}

/**
 * CLASS 2, third half — the one that catches an override added without a
 * regenerated lockfile. Every resolved instance of an overridden package must
 * satisfy the override, at any depth, because that is what an override means.
 *
 * `unchecked` carries the specs and versions the comparator could not read. It
 * is asserted empty rather than ignored: an override in a syntax this does not
 * implement is an override nothing is checking.
 *
 * That principle is why this models npm's *scoped* overrides rather than
 * skipping them. `{"minimatch@3": {"brace-expansion": "^1.1.12"}}` beside a
 * flat `"brace-expansion": "^5.0.9"` is not a contradiction: it pins the one
 * copy minimatch v3 reaches, because brace-expansion v5 drops the CommonJS
 * `expand` export that minimatch v3 calls. Reading only the flat entry, this
 * sweep called the correctly-forked copies violations and told the author to
 * regenerate a lockfile that `npm ci` already installs cleanly — while the
 * scoped rules themselves went unread, the exact hole `unchecked` exists to
 * refuse.
 *
 * `bundled` carries the one exclusion: dependencies shipped inside another
 * package's tarball (`inBundle`). npm does not rewrite those — the publisher
 * packed them — so a bundled version outside an override is not something
 * regenerating the lockfile can fix and `npm ci` does not refuse it. This
 * repository has six such entries today, all under
 * `@tailwindcss/oxide-wasm32-wasi`, and every one is named in the sweep's
 * diagnostics on every run so the boundary is visible in the log rather than
 * only in this comment.
 */
function overrideResolutionViolations(manifest, lock) {
  const violations = [];
  const unchecked = [];
  const bundled = [];
  const packages = lock?.packages;
  if (!packages) return { violations, unchecked, bundled };

  // Pass one: split the block into the flat rules that govern every copy of a
  // package and the scoped rules that govern one parent's copy of it.
  //
  // Every spec is parsed here rather than where it is applied, because an
  // override for a package the lockfile has no entry for still has to be
  // reported. Parsing at the point of use would let `"next": "$next"` pass
  // silently the moment nothing resolved to compare it against, which is the
  // opposite of what `unchecked` is for.
  const flat = new Map();
  const scoped = [];
  for (const [key, value] of Object.entries(manifest.overrides || {})) {
    const spec = typeof value === 'string' ? value : value?.['.'];
    if (typeof spec === 'string') {
      const range = parseSimpleRange(spec);
      if (!range) {
        unchecked.push(`override ${key}@"${spec}" is in a range syntax this test cannot evaluate`);
      }
      flat.set(key, { spec, range, label: `overrides.${key}` });
    }
    if (value && typeof value === 'object') {
      const { name: parent, range: parentRange } = parseOverrideKey(key);
      for (const [child, childSpec] of Object.entries(value)) {
        if (child === '.') continue;
        if (typeof childSpec !== 'string') {
          unchecked.push(`override "${key}".${child} is not a version spec this test can read`);
          continue;
        }
        const range = parseSimpleRange(childSpec);
        if (!range) {
          unchecked.push(
            `override "${key}".${child} is "${childSpec}", a range syntax this test cannot evaluate`
          );
        }
        scoped.push({
          key,
          parent,
          range: parentRange,
          child,
          spec: childSpec,
          parsed: range,
          label: `overrides["${key}"].${child}`,
        });
      }
    }
  }

  // Pass two: every instance of an overridden package, checked against the
  // rule that actually governs it.
  const governed = new Set([...flat.keys(), ...scoped.map((r) => r.child)]);
  for (const [treePath, entry] of Object.entries(packages)) {
    const name = installedName(treePath);
    if (name === null || !governed.has(name)) continue;
    if (typeof entry?.version !== 'string') continue;

    const claims = scopedClaims(treePath, name, scoped, packages, unchecked);
    const applicable = claims.length
      ? claims.map((r) => ({ spec: r.spec, range: r.parsed, label: r.label }))
      : flat.has(name)
        ? [flat.get(name)]
        : [];

    for (const rule of applicable) {
      // Already reported once, in pass one, against the override rather than
      // against each instance it would have been compared to.
      if (!rule.range) continue;
      const satisfied = satisfiesSimpleRange(entry.version, rule.range);
      if (satisfied === null) {
        unchecked.push(`${treePath} resolves ${name}@${entry.version}, which this test cannot compare`);
      } else if (!satisfied) {
        if (entry.inBundle) {
          bundled.push(`${treePath}@${entry.version} is bundled, outside ${rule.label} "${rule.spec}"`);
        } else {
          violations.push({ name, spec: rule.spec, treePath, version: entry.version, label: rule.label });
        }
      }
    }
  }
  return { violations, unchecked, bundled };
}

const describeResolutionViolation = (file, f) =>
  `${file}: ${f.label || `overrides.${f.name}`} is "${f.spec}" but the lockfile still resolves ${f.treePath} ` +
  `at ${f.version} — the override was added without regenerating the lockfile, so \`npm ci\` ` +
  'refuses the package and it drops out of `npm audit`. Run `npm install --package-lock-only` ' +
  'in that directory and commit the result.';

/** Manifest, and lockfile when one is tracked beside it, read once for the sweeps. */
const PACKAGES = trackedManifests().map((manifestPath) => {
  const lockPath = path.join(path.dirname(manifestPath), 'package-lock.json');
  const lockAbsolute = path.join(REPO_ROOT, lockPath);
  return {
    manifestPath,
    lockPath,
    manifest: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, manifestPath), 'utf8')),
    lock: fs.existsSync(lockAbsolute) ? JSON.parse(fs.readFileSync(lockAbsolute, 'utf8')) : null,
  };
});

// ---------------------------------------------------------------------------
// The repository sweep.
// ---------------------------------------------------------------------------

test('the sweep has a population to sweep', (t) => {
  const withLock = PACKAGES.filter((p) => p.lock);
  const withOverrides = PACKAGES.filter((p) => Object.keys(p.manifest.overrides || {}).length > 0);

  t.diagnostic(`manifests inspected: ${PACKAGES.length}`);
  t.diagnostic(`manifest/lockfile pairs compared: ${withLock.length}`);
  t.diagnostic(`manifests declaring overrides: ${withOverrides.length}`);
  for (const p of PACKAGES) {
    t.diagnostic(`  ${p.manifestPath}${p.lock ? ' + package-lock.json' : ''}`);
  }

  // Every assertion below is over a list, and a list is empty both when the
  // repository is clean and when nothing was collected. These three are what
  // separates the two.
  assert.ok(
    PACKAGES.length > 0,
    'no tracked package.json was found: `git ls-files -- "*package.json"` returned nothing, ' +
      'so every assertion in this file is vacuous. Check the pathspec before believing the run.'
  );
  assert.ok(
    withLock.length > 0,
    'no tracked package.json has a package-lock.json beside it, so the lockfile-sync half of ' +
      'this file checked nothing'
  );
  assert.ok(
    withOverrides.length > 0,
    'no tracked package.json declares `overrides`, so the EOVERRIDE half of this file checked ' +
      'nothing. If the last override was genuinely removed, this test is what says so out loud.'
  );
});

test('no manifest overrides a package it directly depends on with a different spec', () => {
  const offenders = [];
  for (const { manifestPath, manifest } of PACKAGES) {
    for (const finding of rootOverrideConflicts(manifest)) {
      offenders.push(describeOverrideConflict(manifestPath, finding));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'npm refuses to install a manifest whose `overrides` entry for a direct dependency is not ' +
      'the identical string (EOVERRIDE). The specs need not merely be compatible — "^8.5.18" ' +
      `under an "^8" dependency is rejected. Offending manifests:\n  ${offenders.join('\n  ')}`
  );
});

test('every lockfile can be compared with its manifest', () => {
  const unreadable = [];
  for (const { lockPath, manifest, lock } of PACKAGES) {
    if (!lock) continue;
    const { readable, reason } = lockRootDrift(manifest, lock);
    if (!readable) unreadable.push(`${lockPath}: ${reason}`);
  }

  assert.deepEqual(
    unreadable,
    [],
    'a lockfile this test cannot read is a lockfile nothing checks, and it passes every other ' +
      `assertion here by producing no findings:\n  ${unreadable.join('\n  ')}`
  );
});

test("every lockfile's root entry matches the manifest beside it", () => {
  const offenders = [];
  for (const { manifestPath, manifest, lock } of PACKAGES) {
    if (!lock) continue;
    for (const finding of lockRootDrift(manifest, lock).findings) {
      offenders.push(describeRootDrift(manifestPath, finding));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'a lockfile that disagrees with its manifest makes `npm ci` exit before installing ' +
      'anything, which silently removes the package from `npm audit` and from every gate that ' +
      `needs its dependencies:\n  ${offenders.join('\n  ')}`
  );
});

test('every dependency in a lockfile root is present in that lockfile tree', () => {
  const offenders = [];
  for (const { manifestPath, lock } of PACKAGES) {
    if (!lock) continue;
    for (const gap of lockTreeGaps(lock)) {
      offenders.push(describeTreeGap(manifestPath, gap));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `dependencies declared in the lockfile root with nothing resolving them:\n  ${offenders.join('\n  ')}`
  );
});

test('every lockfile resolves overridden packages to versions the override admits', (t) => {
  const offenders = [];
  const unchecked = [];
  const bundled = [];
  for (const { manifestPath, manifest, lock } of PACKAGES) {
    if (!lock) continue;
    const result = overrideResolutionViolations(manifest, lock);
    for (const violation of result.violations) {
      offenders.push(describeResolutionViolation(manifestPath, violation));
    }
    for (const line of result.unchecked) unchecked.push(`${manifestPath}: ${line}`);
    for (const line of result.bundled) bundled.push(`${manifestPath}: ${line}`);
  }

  // The one exclusion, printed every run rather than described only in a
  // comment: npm cannot rewrite a dependency another package bundled, so these
  // are outside what regenerating a lockfile can fix.
  t.diagnostic(`bundled dependencies outside an override, not asserted on: ${bundled.length}`);
  for (const line of bundled) t.diagnostic(`  ${line}`);

  assert.deepEqual(
    offenders,
    [],
    'an override whose lockfile was never regenerated pins the version the override exists to ' +
      'replace, and `npm ci` refuses the package outright:\n  ' +
      offenders.join('\n  ')
  );
  assert.deepEqual(
    unchecked,
    [],
    'override specs or resolved versions in a syntax `parseSimpleRange`/`satisfiesSimpleRange` ' +
      'do not implement. Teach the comparator the form — do not remove the override or relax ' +
      `this assertion, which would leave the override unchecked:\n  ${unchecked.join('\n  ')}`
  );
});

// ---------------------------------------------------------------------------
// The checks above are only as good as the functions they call, and on a clean
// repository they all pass by finding nothing. These drive the same functions
// with the defects as they were committed, so the file demonstrates its own
// failure modes on every run instead of on the day one recurs.
// ---------------------------------------------------------------------------

test('the EOVERRIDE rule is exact string equality, not semver compatibility', () => {
  // ventures/real-estate-agent-photo-app/research as committed. `^8.5.18` admits
  // a strict subset of what `^8` admits, and npm rejects it regardless.
  const subset = rootOverrideConflicts({
    devDependencies: { postcss: '^8' },
    overrides: { postcss: '^8.5.18' },
  });
  assert.deepEqual(subset, [
    { name: 'postcss', block: 'devDependencies', overrideSpec: '^8.5.18', directSpec: '^8' },
  ]);

  // ventures/print-atelier as committed: the same override over a direct spec
  // that is the identical string. npm installs this, so this test must not fire.
  const identical = rootOverrideConflicts({
    devDependencies: { postcss: '^8.5.18' },
    overrides: { postcss: '^8.5.18' },
  });
  assert.deepEqual(identical, [], 'byte-identical specs are what npm requires, not a conflict');
});

test('a major-version override of a direct dependency is a conflict in any block', () => {
  // ventures/photo-editing/docs-site and the two real-estate-agent-photo-app
  // packages, as committed on 2026-08-05.
  const findings = rootOverrideConflicts({
    dependencies: { next: '^14.2.35' },
    devDependencies: { 'eslint-config-next': '14.1.0' },
    overrides: { next: '16.2.12', 'eslint-config-next': '16.2.12' },
  });
  assert.deepEqual(findings.map((f) => `${f.block}.${f.name}`).sort(), [
    'dependencies.next',
    'devDependencies.eslint-config-next',
  ]);
  assert.match(
    describeOverrideConflict('ventures/x/package.json', findings[0]),
    /overrides\.next "16\.2\.12" conflicts with dependencies\.next "\^14\.2\.35"/,
    'the message must name both specs and the block, because npm ci names the wrong file'
  );
});

test('an override for a package that is not a direct dependency is not a conflict', () => {
  assert.deepEqual(
    rootOverrideConflicts({
      dependencies: { next: '^15.2.4' },
      overrides: { sharp: '^0.35.3', 'brace-expansion': '^2.0.1' },
    }),
    [],
    'overriding a transitive dependency is the whole point of the block'
  );
});

test('the nested override form is read the way npm reads it', () => {
  const findings = rootOverrideConflicts({
    dependencies: { foo: '^1.0.0', bar: '^2.0.0' },
    overrides: { foo: { bar: '1.0.0' } },
  });
  assert.deepEqual(
    findings,
    [],
    'a nested override scopes `bar` to dependents named `foo`; it does not conflict with a ' +
      'direct dependency on `bar`, and must not crash the walk either'
  );

  const dotted = rootOverrideConflicts({
    dependencies: { foo: '^1.0.0' },
    overrides: { foo: { '.': '2.0.0', bar: '1.0.0' } },
  });
  assert.deepEqual(dotted, [
    { name: 'foo', block: 'dependencies', overrideSpec: '2.0.0', directSpec: '^1.0.0' },
  ], 'the "." key of a nested override is a spec for the parent, and npm applies the rule to it');
});

test('a lockfile root that disagrees with the manifest is reported per key', () => {
  const manifest = {
    dependencies: { next: '16.2.12', stripe: '^22.3.1' },
    devDependencies: { '@vitest/coverage-v8': '^4.1.10', vitest: '^4.1.10' },
    peerDependencies: { react: '^19.0.0' },
  };
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': {
        dependencies: { next: '15.5.0' },
        devDependencies: { vitest: '^4.1.10', tailwindcss: '^4' },
        peerDependencies: { react: '^18.0.0' },
      },
    },
  };

  const { readable, findings } = lockRootDrift(manifest, lock);
  assert.equal(readable, true);
  assert.deepEqual(
    findings.map((f) => `${f.block}.${f.name}`).sort(),
    [
      'dependencies.next', // differing spec
      'dependencies.stripe', // in the manifest, absent from the lockfile
      'devDependencies.@vitest/coverage-v8', // the local-site-studio finding
      'devDependencies.tailwindcss', // in the lockfile, absent from the manifest
      'peerDependencies.react', // mirrored into the root by Arborist, so compared
    ],
    'every disagreement is reported, in both directions, not just the first'
  );
  assert.match(
    describeRootDrift('ventures/x/package.json', findings[0]),
    /"16\.2\.12" in package\.json and "15\.5\.0" in package-lock\.json/,
    'the message must show both sides'
  );
});

test('an in-sync lockfile root produces no findings', () => {
  const manifest = {
    dependencies: { marked: '^13.0.0' },
    devDependencies: {},
    overrides: { sharp: '^0.35.0' },
  };
  const lock = {
    lockfileVersion: 3,
    packages: { '': { name: 'site', dependencies: { marked: '^13.0.0' }, devDependencies: {} } },
  };
  assert.deepEqual(
    lockRootDrift(manifest, lock).findings,
    [],
    'npm does not mirror `overrides` into packages[""], so its absence there is correct and ' +
      'must never be reported — seven of this repository\'s lockfiles are in this state'
  );
});

test('an overrides block written into the lockfile root is still compared', () => {
  const manifest = { overrides: { sharp: '^0.35.0' } };
  const lock = { lockfileVersion: 3, packages: { '': { overrides: { sharp: '^0.34.0' } } } };
  assert.deepEqual(lockRootDrift(manifest, lock).findings, [
    { block: 'overrides', name: 'sharp', manifestSpec: '^0.35.0', lockSpec: '^0.34.0' },
  ]);
});

test('a lockfileVersion 1 file is reported as uncheckable, not passed over', () => {
  const v1 = { lockfileVersion: 1, dependencies: { sharp: { version: '0.34.5' } } };
  const result = lockRootDrift({ dependencies: { sharp: '^0.35.0' } }, v1);
  assert.equal(result.readable, false, 'a v1 lockfile has no `packages` map to compare');
  assert.match(result.reason, /lockfileVersion 1 has no `packages` map/);
  assert.match(result.reason, /npm install/, 'the remedy must be in the message');
  assert.deepEqual(result.findings, [], 'an unreadable lockfile yields no findings — hence the ' +
    'separate assertion that no lockfile is unreadable');

  const rootless = lockRootDrift({}, { lockfileVersion: 3, packages: {} });
  assert.equal(rootless.readable, false, 'a lockfile with no root package cannot be compared');
});

test('a root dependency with no entry in the tree is the `Missing: from lock file` failure', () => {
  // The other half of the `local-site-studio` finding. Its manifest asked for
  // @vitest/coverage-v8 and neither the lockfile root nor the tree had it, so
  // the root comparison above caught that one. This is the case the root
  // comparison cannot see: root and manifest agree, and the package the root
  // names is still missing from the tree, which is what npm prints verbatim.
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { devDependencies: { '@vitest/coverage-v8': '^4.1.10', vitest: '^4.1.10' } },
      'node_modules/vitest': { version: '4.1.10' },
    },
  };
  assert.deepEqual(lockTreeGaps(lock), [
    { block: 'devDependencies', name: '@vitest/coverage-v8', spec: '^4.1.10' },
  ]);
  assert.match(
    describeTreeGap('ventures/local-site-studio/package.json', lockTreeGaps(lock)[0]),
    /Missing: @vitest\/coverage-v8@\^4\.1\.10 from lock file/,
    'the message must quote the error npm actually prints, so a search for it lands here'
  );
});

test('an override the lockfile predates is caught at the resolved version', () => {
  // ventures/local-site-studio as committed: overrides.sharp "^0.35.0" over a
  // lockfile that still resolved 0.34.5, at two depths.
  const manifest = { overrides: { sharp: '^0.35.0', postcss: '^8.5.18' } };
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { next: '16.2.12' } },
      'node_modules/sharp': { version: '0.34.5' },
      'node_modules/next/node_modules/sharp': { version: '0.34.5' },
      'node_modules/postcss': { version: '8.5.18' },
      'node_modules/sharp-cli': { version: '1.0.0' },
    },
  };

  const { violations, unchecked } = overrideResolutionViolations(manifest, lock);
  assert.deepEqual(unchecked, []);
  assert.deepEqual(
    violations.map((v) => `${v.treePath}@${v.version}`),
    ['node_modules/sharp@0.34.5', 'node_modules/next/node_modules/sharp@0.34.5'],
    'an override applies at every depth, and a package whose name merely starts with the ' +
      'overridden name (sharp-cli) is not that package'
  );
  assert.match(
    describeResolutionViolation('ventures/local-site-studio/package.json', violations[0]),
    /overrides\.sharp is "\^0\.35\.0" but the lockfile still resolves node_modules\/sharp at 0\.34\.5/
  );
});

test('a bundled dependency outside an override is reported, not asserted on', () => {
  // `ventures/local-site-studio` has six of these under
  // `@tailwindcss/oxide-wasm32-wasi`. npm does not apply overrides inside a
  // published tarball's bundle, so failing on one would demand a fix that
  // regenerating the lockfile cannot perform. It is separated rather than
  // dropped: the sweep prints every one on every run.
  const { violations, bundled, unchecked } = overrideResolutionViolations(
    { overrides: { tslib: '^3.0.0' } },
    {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/tslib': {
          version: '2.8.1',
          inBundle: true,
        },
        'node_modules/tslib': { version: '2.8.1' },
      },
    }
  );
  assert.deepEqual(unchecked, []);
  assert.deepEqual(
    violations.map((v) => v.treePath),
    ['node_modules/tslib'],
    'the unbundled copy is still a violation — only the bundled one is excluded'
  );
  assert.deepEqual(bundled, [
    'node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/tslib@2.8.1 is bundled, ' +
      'outside overrides.tslib "^3.0.0"',
  ]);
});

test('caret ranges below 1.0.0 are compared the way npm compares them', () => {
  const range = parseSimpleRange('^0.35.0');
  assert.equal(satisfiesSimpleRange('0.34.5', range), false, '^0.35.0 does not admit 0.34.5');
  assert.equal(satisfiesSimpleRange('0.35.3', range), true, '^0.35.0 admits 0.35.3');
  assert.equal(satisfiesSimpleRange('0.36.0', range), false, 'a 0.x caret pins the minor');
  assert.equal(satisfiesSimpleRange('1.0.0', range), false, 'a 0.x caret does not admit 1.x');

  assert.equal(satisfiesSimpleRange('8.5.18', parseSimpleRange('^8.5.18')), true);
  assert.equal(satisfiesSimpleRange('8.6.0', parseSimpleRange('^8.5.18')), true);
  assert.equal(satisfiesSimpleRange('8.5.17', parseSimpleRange('^8.5.18')), false);
  assert.equal(satisfiesSimpleRange('9.0.0', parseSimpleRange('^8.5.18')), false);
  assert.equal(satisfiesSimpleRange('16.2.12', parseSimpleRange('16.2.12')), true);
  assert.equal(satisfiesSimpleRange('16.2.13', parseSimpleRange('16.2.12')), false);
  assert.equal(satisfiesSimpleRange('1.3.0', parseSimpleRange('~1.2.3')), false);
  assert.equal(satisfiesSimpleRange('1.2.9', parseSimpleRange('~1.2.3')), true);
  assert.equal(satisfiesSimpleRange('0.0.4', parseSimpleRange('^0.0.3')), false, '^0.0.x is exact');
});

test('a range or version the comparator cannot read is reported, never assumed to hold', () => {
  assert.equal(parseSimpleRange('$next'), null, "npm's $name form is not implemented here");
  assert.equal(parseSimpleRange('>=1.2.3 <2.0.0'), null, 'compound ranges are not implemented');
  assert.equal(parseSimpleRange('^8'), null, 'a partial version is not implemented');
  assert.equal(satisfiesSimpleRange('1.0.0-beta.1', parseSimpleRange('^1.0.0')), null);

  const { violations, unchecked } = overrideResolutionViolations(
    { overrides: { next: '$next', sharp: '^0.35.0' } },
    { lockfileVersion: 3, packages: { 'node_modules/sharp': { version: '0.35.0-rc.1' } } }
  );
  assert.deepEqual(violations, [], 'nothing may be asserted about input the comparator cannot read');
  assert.deepEqual(unchecked, [
    'override next@"$next" is in a range syntax this test cannot evaluate',
    'node_modules/sharp resolves sharp@0.35.0-rc.1, which this test cannot compare',
  ], 'both halves are surfaced so the sweep fails on them instead of going quiet');
});

test('a lockfile entry with no version, such as a workspace link, is not a violation', () => {
  const { violations, unchecked } = overrideResolutionViolations(
    { overrides: { schemas: '^1.0.0' } },
    {
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/schemas': { resolved: 'packages/schemas', link: true },
      },
    }
  );
  assert.deepEqual(violations, []);
  assert.deepEqual(unchecked, [], 'a link carries no version to compare and is not unreadable input');
});
