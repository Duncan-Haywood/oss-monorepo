import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { VENTURE_CATALOG } from '../src/pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const VENTURES_DIR = path.join(REPO_ROOT, 'ventures');
const VERIFY_COMPONENT = path.join(REPO_ROOT, 'scripts/ci/verify-component.sh');
// The two places this repository keeps workflows: the monorepo's own Gitea CI,
// and the per-venture GitHub workflows that ship inside each venture directory.
// The `ventures` pathspec is deliberately the whole tree rather than a glob —
// the `.github/workflows/` filter below is what selects, so a venture that
// nests a package one level deeper is still found. Same shape in
// workflow-action-pinning, node-version-contract and ci-workflow-tooling.
const WORKFLOW_PATHSPECS = ['.gitea/workflows', 'ventures'];

/**
 * A venture's quality gates are declared in more than one place, and only some
 * of them execute. `VENTURE_CATALOG` below is what the Dagger pipeline actually
 * runs; `verify:` in a venture's VENTURE.yaml is what a developer is told to run
 * locally and what the engineering roadmap calls "the local and CI contract".
 *
 * Nothing used to compare them, so they drifted silently and in the direction
 * that flatters: five ventures documented a *weaker* command than CI ran.
 * quick-pick-survey documented `npm test` while CI ran typecheck, lint and test,
 * so the documented command passed locally and then failed in CI on the very
 * gates that were restored for it. Documentation that is weaker than the gate is
 * worse than no documentation, because it is trusted.
 *
 * These tests make VENTURE.yaml a checked mirror of the executed catalog rather
 * than prose that happens to sit next to it.
 *
 * `scripts/ci/verify-component.sh` is the third declaration, and the one
 * docs/CI-CD-ARCHITECTURE.md calls "the shared, fail-closed local/CI contract so
 * YAML and developer checks do not diverge". Nothing enforced that either, and
 * they had diverged: the script ran `npm run build` for local-site-studio and
 * `npm run cf:build` for ai-first-markets, neither of which the catalog ran.
 * local-site-studio's production build was the live hole — no workflow invokes
 * that arm, so the only declaration that executed was the catalog's, and the
 * build was verified nowhere.
 *
 * The fourth declaration is a venture workflow that spells its gates out inline
 * instead of calling the shared script. `.gitea/workflows/pairwise-ci.yml` does,
 * for the one venture that actually deploys to production on merge, so a step
 * deleted there is a release gate deleted with nothing else to catch it.
 */

function ventureRootOf(dir) {
  const parts = dir.split('/');
  return parts[0] === 'ventures' && parts[1] ? `ventures/${parts[1]}` : null;
}

/** The gate sequence one catalog entry executes, as shell a developer can run. */
function segmentsFor(component, ventureRoot) {
  const packageDir = component.packageDir || component.dir;
  const relative = path.relative(ventureRoot, packageDir);
  const prefix = relative && relative !== '.' ? `--prefix ${relative} ` : '';

  if (component.type === 'python') {
    const testDir = path.join(component.dir, component.testDir || 'tests');
    return [`pytest ${path.relative(ventureRoot, testDir)}`];
  }
  if (component.type === 'swift') {
    const pkgPath = relative && relative !== '.' ? ` --package-path ${relative}` : '';
    return [`swift test${pkgPath}`];
  }
  if (component.type === 'pnpm') {
    return [`pnpm run ${component.ciScript || 'ci'}`];
  }
  if (component.type === 'node') {
    // `npm test` is the idiomatic spelling of the `test` script; every other
    // script is only reachable through `npm run`.
    return (component.scripts || []).map((script) =>
      script === 'test' ? `npm ${prefix}test` : `npm ${prefix}run ${script}`
    );
  }
  return [];
}

/** Catalog entries grouped by venture; a venture may register several. */
function catalogByVenture() {
  const grouped = new Map();
  for (const component of VENTURE_CATALOG) {
    const ventureRoot = ventureRootOf(component.dir);
    if (!ventureRoot) continue;
    if (!grouped.has(ventureRoot)) grouped.set(ventureRoot, []);
    grouped.get(ventureRoot).push(component);
  }
  return grouped;
}

/**
 * The catalog grouped by the root each arm of verify-component.sh names.
 *
 * `catalogByVenture()` above is `ventures/` only on purpose: VENTURE.yaml is a
 * venture contract, and a portfolio component has none to compare a `verify:`
 * line against. The shared script gates those components all the same, though —
 * portfolio/marisstella-homepage is the live homepage and now has an arm — so
 * the arm-versus-catalog comparison needs the wider grouping or it would report
 * "no catalog entry" for a component the catalog does run.
 */
function catalogByComponentRoot() {
  const grouped = new Map();
  for (const component of VENTURE_CATALOG) {
    const root = ventureRootOf(component.dir) || component.packageDir || component.dir;
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(component);
  }
  return grouped;
}

function canonicalVerifyFor(ventureRoot, components) {
  const ordered = [...components].sort((a, b) =>
    (a.packageDir || a.dir).localeCompare(b.packageDir || b.dir)
  );
  return ordered.flatMap((component) => segmentsFor(component, ventureRoot)).join(' && ');
}

function declaredVerifyFor(ventureRoot) {
  const yamlPath = path.join(REPO_ROOT, ventureRoot, 'VENTURE.yaml');
  if (!fs.existsSync(yamlPath)) return null;
  const match = fs.readFileSync(yamlPath, 'utf8').match(/^verify:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

test('Verify Contract - VENTURE.yaml verify matches the gates CI executes', () => {
  const drift = [];

  for (const [ventureRoot, components] of [...catalogByVenture()].sort()) {
    const canonical = canonicalVerifyFor(ventureRoot, components);
    if (!canonical) continue;

    const declared = declaredVerifyFor(ventureRoot);
    assert.ok(
      declared,
      `${ventureRoot}/VENTURE.yaml has no \`verify:\` command, but CI runs: ${canonical}`
    );

    if (declared !== canonical) {
      drift.push(`  ${ventureRoot}\n    declared: ${declared}\n    CI runs : ${canonical}`);
    }
  }

  assert.equal(
    drift.length,
    0,
    'VENTURE.yaml `verify:` drifted from the gates the CI catalog executes.\n' +
      'Update VENTURE.yaml to the CI command, or change the catalog if the gate itself is wrong.\n' +
      drift.join('\n')
  );
});

test('Verify Contract - every venture with a contract is registered in the catalog', () => {
  const registered = new Set(catalogByVenture().keys());
  const unregistered = fs
    .readdirSync(VENTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `ventures/${entry.name}`)
    .filter((ventureRoot) => fs.existsSync(path.join(REPO_ROOT, ventureRoot, 'VENTURE.yaml')))
    .filter((ventureRoot) => !registered.has(ventureRoot));

  assert.deepEqual(
    unregistered,
    [],
    'These ventures declare a VENTURE.yaml contract but no catalog entry executes it, ' +
      'so their gates never run and the build is green regardless:\n  ' +
      unregistered.join('\n  ')
  );
});

/**
 * A gate as `tool:script`. The two declarations spell the same gate differently
 * — the catalog runs `npm --prefix <pkg> run x`, the shared script `cd`s into the
 * package first — so comparing shell strings would report drift where there is
 * none. The tokens carry what actually differs: which gates run, in what order.
 */
function catalogGatesFor(component) {
  if (component.type === 'python') return ['pytest'];
  if (component.type === 'pnpm') return [`pnpm:${component.ciScript || 'ci'}`];
  if (component.type === 'swift') return ['swift:test'];
  if (component.type === 'node') {
    return [...(component.scripts || []), ...(component.workflowOnlyScripts || [])].map(
      (script) => `npm:${script}`
    );
  }
  return [];
}

/** Commands that prepare the tree so the gates can run. Not gates themselves. */
const SETUP_COMMANDS = [/^npm ci\b/, /^corepack pnpm install\b/, /^npx prisma generate$/];

/** Shell scaffolding inside a case arm: neither a gate nor a setup step. */
const SCAFFOLDING = [/^$/, /^\($/, /^\)$/, /^if\b/, /^fi$/, /^#/];

function gateTokenFor(command) {
  if (command === 'npm test') return 'npm:test';
  const npmRun = command.match(/^npm run (\S+)$/);
  if (npmRun) return `npm:${npmRun[1]}`;
  const pnpmRun = command.match(/^(?:corepack )?pnpm run (\S+)$/);
  if (pnpmRun) return `pnpm:${pnpmRun[1]}`;
  if (command.startsWith('swift test')) return 'swift:test';
  return null;
}

/**
 * Read the gate sequence out of each `case` arm of scripts/ci/verify-component.sh.
 *
 * An unrecognised command is thrown, never skipped. A parser that quietly
 * ignores what it does not understand would report agreement precisely when the
 * script grew the gate nobody checked.
 */
function parseVerifyComponentArms() {
  const arms = new Map();
  let inCase = false;
  let arm = null;
  let subshellDir = null;

  for (const raw of fs.readFileSync(VERIFY_COMPONENT, 'utf8').split('\n')) {
    const line = raw.trim();

    if (!inCase) {
      if (line === 'case "$component" in') inCase = true;
      continue;
    }
    if (arm === null) {
      // `*)` is the usage arm; it runs no gates.
      const opened = line.match(/^([a-z0-9-]+)\)$/);
      if (opened) {
        arm = { name: opened[1], ventureRoots: new Set(), gates: [], generatesPrisma: false };
        subshellDir = null;
      }
      continue;
    }
    if (line === ';;') {
      arms.set(arm.name, arm);
      arm = null;
      continue;
    }

    let directory = subshellDir;
    let command = line;
    const runNpm = line.match(/^run_npm\s+(\S+)\s+(.+)$/);
    if (runNpm) {
      directory = runNpm[1];
      command = runNpm[2];
    } else {
      const changeDir = line.match(/^cd "\$repo_root\/([^"]+)"$/);
      if (changeDir) {
        subshellDir = changeDir[1];
        continue;
      }
      if (SCAFFOLDING.some((pattern) => pattern.test(line))) continue;
    }

    if (command === 'npx prisma generate') arm.generatesPrisma = true;
    if (SETUP_COMMANDS.some((pattern) => pattern.test(command))) {
      if (directory) arm.ventureRoots.add(ventureRootOf(directory) || directory);
      continue;
    }

    const token = gateTokenFor(command);
    if (!token) {
      throw new Error(
        `scripts/ci/verify-component.sh arm '${arm.name}' runs a command this contract ` +
          `test cannot classify as a gate or a setup step: ${command}\n` +
          'Teach gateTokenFor/SETUP_COMMANDS about it rather than leaving it unchecked.'
      );
    }
    assert.ok(directory, `'${arm.name}' runs ${command} outside any package directory`);
    arm.ventureRoots.add(ventureRootOf(directory) || directory);
    arm.gates.push(token);
  }

  assert.equal(arm, null, 'scripts/ci/verify-component.sh has an unterminated case arm');
  return arms;
}

test('Verify Contract - verify-component.sh runs the same gates as the CI catalog', () => {
  const catalog = catalogByComponentRoot();
  const drift = [];

  for (const [name, componentArm] of parseVerifyComponentArms()) {
    const roots = [...componentArm.ventureRoots];
    assert.equal(
      roots.length,
      1,
      `verify-component.sh arm '${name}' spans several ventures (${roots.join(', ')}), ` +
        'which this contract cannot map onto a single catalog entry'
    );

    const [ventureRoot] = roots;
    const components = catalog.get(ventureRoot);
    assert.ok(
      components,
      `verify-component.sh arm '${name}' verifies ${ventureRoot}, which has no catalog entry, ` +
        'so the monorepo pipeline runs none of these gates'
    );

    const ordered = [...components].sort((a, b) =>
      (a.packageDir || a.dir).localeCompare(b.packageDir || b.dir)
    );
    const expected = ordered.flatMap(catalogGatesFor);
    if (componentArm.gates.join(' && ') !== expected.join(' && ')) {
      drift.push(
        `  ${name} (${ventureRoot})\n` +
          `    verify-component.sh: ${componentArm.gates.join(', ') || '(none)'}\n` +
          `    CI catalog         : ${expected.join(', ') || '(none)'}`
      );
    }

    const hasPrisma = ordered.some((component) => component.hasPrisma);
    assert.equal(
      componentArm.generatesPrisma,
      hasPrisma,
      `verify-component.sh arm '${name}' ${componentArm.generatesPrisma ? 'runs' : 'does not run'} ` +
        `\`npx prisma generate\`, but the catalog says hasPrisma: ${hasPrisma}. ` +
        'One of the two gates runs against a client the other regenerated.'
    );
  }

  assert.equal(
    drift.length,
    0,
    'scripts/ci/verify-component.sh drifted from the gates the CI catalog executes.\n' +
      'Strengthen the weaker declaration; if a gate is deliberately not in the monorepo ' +
      'pipeline, declare it as `workflowOnlyScripts` on the catalog entry with the reason.\n' +
      drift.join('\n')
  );
});

/**
 * Workflows that belong to exactly one venture. Anything they run inline is a
 * gate for that venture, so the catalog is the floor they have to clear.
 *
 * Two ways a workflow says which venture it is: a top-level
 * `defaults.run.working-directory` inside `.gitea/workflows`, or simply living
 * at `ventures/<name>/.github/workflows/`. Until 2026-08-04 only the first was
 * read, because the collection was a listing of `.gitea/workflows` —
 * `docs/CONTROL-AUDIT-2026-08-04.md` finding 2. Both halves of that miss
 * mattered: `ventures/print-atelier/.github/workflows/ci.yml` was outside the
 * directory *and* declares no `defaults:` block, so it stayed invisible on two
 * counts while running `npm ci && npm run build` for a venture whose catalog
 * declares typecheck, lint, test and build. Its 749 tests gated nothing on the
 * path that merges its own code.
 *
 * The list now comes from git across both roots, and a venture-local workflow
 * takes its venture from its own path. No directory is exempt: this contract
 * asks whether a workflow that runs *some* of a venture's gates runs all of
 * them, and that question is identical wherever the file lives.
 */

/** Whether a venture's package.json generates the Prisma client on install. */
function prismaOnPostinstall(ventureRoot) {
  const manifest = path.join(REPO_ROOT, ventureRoot, 'package.json');
  if (!fs.existsSync(manifest)) return false;
  const scripts = JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts || {};
  return /(?:^|\s|&&\s*)(?:npx )?prisma generate\b/.test(scripts.postinstall || '');
}

function ventureWorkflows() {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...WORKFLOW_PATHSPECS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  const files = listed
    .split('\0')
    .filter(Boolean)
    .filter((name) => name.startsWith('.gitea/workflows/') || name.includes('.github/workflows/'))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));

  return files
    .map((relative) => {
      const fullPath = path.join(REPO_ROOT, relative);
      // The repository-relative path, not the basename: six ventures name their
      // workflow `ci.yml`, and a drift report has to say which one.
      const name = relative;
      const source = fs.readFileSync(fullPath, 'utf8');
      const pinned = source.match(/^defaults:\n\s+run:\n\s+working-directory:\s*(\S+)\s*$/m);
      let ventureRoot = pinned ? ventureRootOf(pinned[1]) : null;
      if (!ventureRoot && relative.startsWith('ventures/')) {
        const parts = relative.split('/');
        ventureRoot = ventureRootOf(path.join(parts[0], parts[1]));
      }
      if (!ventureRoot) return null;

      // A `run:` step, single line or block scalar opener. Steps that delegate
      // to scripts/ci/verify-component.sh are already held to the catalog by the
      // contract above, so the workflow inherits that guarantee.
      const gates = [];
      let delegatesToSharedScript = false;
      let generatesPrisma = false;
      let installsDependencies = false;
      for (const line of source.split('\n')) {
        const step = line.trim().match(/^(?:- )?run:\s*(.+)$/);
        if (!step) continue;
        const command = step[1].trim();
        if (/verify-component\.sh\s/.test(command)) delegatesToSharedScript = true;
        if (/(?:^|\s)(?:npx )?prisma generate\b/.test(command)) generatesPrisma = true;
        if (/^npm ci\b/.test(command)) installsDependencies = true;
        const token = gateTokenFor(command);
        if (token) gates.push(token);
      }

      return { name, ventureRoot, gates, delegatesToSharedScript, generatesPrisma, installsDependencies };
    })
    .filter(Boolean);
}

test('Verify Contract - workflows that inline a venture gate run the whole catalog', () => {
  const catalog = catalogByVenture();
  const drift = [];
  const workflows = ventureWorkflows();

  // The collection must keep spanning both roots. `.gitea/workflows` alone
  // satisfied every other assertion in this test for as long as it was the only
  // input, which is exactly how print-atelier's workflow went unread.
  for (const root of ['.gitea/workflows/', 'ventures/']) {
    assert.ok(
      workflows.some((workflow) => workflow.name.startsWith(root)),
      `no venture-scoped workflow under '${root}' reached this contract — the collection narrowed`
    );
  }

  for (const workflow of workflows) {
    const components = catalog.get(workflow.ventureRoot);
    if (!components || workflow.delegatesToSharedScript) continue;

    const expected = new Set(
      components.flatMap(catalogGatesFor).filter((gate) => !gate.startsWith('pytest'))
    );
    // A workflow that runs none of the catalog gates is a deploy or publish
    // workflow, not an application gate; only a partial sequence is drift.
    const runs = workflow.gates.filter((gate) => expected.has(gate));
    if (runs.length === 0) continue;

    const missing = [...expected].filter((gate) => !workflow.gates.includes(gate));
    if (missing.length > 0) {
      drift.push(
        `  ${workflow.name} (${workflow.ventureRoot})\n` +
          `    runs   : ${workflow.gates.join(', ')}\n` +
          `    missing: ${missing.join(', ')}`
      );
    }

    const hasPrisma = components.some((component) => component.hasPrisma);
    if (hasPrisma) {
      // Two ways the client is generated before the gates run, and both are
      // real: an explicit `prisma generate` step, or `npm ci` in a package
      // whose `postinstall` runs it. Only the first was recognised until
      // 2026-08-04, which was invisible while this contract read
      // `.gitea/workflows` alone — the venture's own CI installs and lets
      // postinstall generate, and would have been reported as checking an
      // absent client that it in fact generates.
      assert.ok(
        workflow.generatesPrisma || (workflow.installsDependencies && prismaOnPostinstall(workflow.ventureRoot)),
        `${workflow.name} runs ${workflow.ventureRoot} gates inline but never generates the ` +
          'Prisma client — no `prisma generate` step and no `postinstall` that runs it, so the ' +
          'gates check a stale or absent client'
      );
    }
  }

  assert.equal(
    drift.length,
    0,
    'A workflow runs part of a venture\'s catalog gate sequence inline and drops the rest.\n' +
      'A gate deleted from a venture workflow is deleted from the release path: this workflow ' +
      'is what runs on a merge to main, and nothing else re-checks it.\n' +
      drift.join('\n')
  );
});
