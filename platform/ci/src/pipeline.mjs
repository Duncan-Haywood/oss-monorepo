#!/usr/bin/env node

/**
 * Monorepo Unified Dagger CI Pipeline Engine
 * 
 * Provides programmable, containerized CI pipeline execution with BuildKit caching,
 * git-based affected-path monorepo change detection, security scanning, and seamless
 * host-fallback execution when container daemons are unavailable.
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * Venture & Component Registry Definition
 */
export const VENTURE_CATALOG = [
  {
    id: 'mat-470-real-analysis',
    name: 'MAT-470 Real Analysis',
    dir: 'ventures/mat-470-real-analysis',
    type: 'python',
    testDir: 'tests',
  },
  {
    id: 'ai-engineering-academy-site',
    name: 'AI Engineering Academy Site',
    dir: 'ventures/ai-engineering-academy/site',
    type: 'node',
    hasPrisma: false,
    scripts: ['test', 'build'],
  },
  {
    id: 'quick-pick-survey',
    name: 'Quick Pick Survey (Pairwise)',
    dir: 'ventures/quick-pick-survey',
    type: 'node',
    hasPrisma: true,
    scripts: ['typecheck', 'lint', 'test', 'build'],
  },
  {
    id: 'ai-first-markets',
    name: 'AI-First Markets',
    dir: 'ventures/ai-first-markets',
    type: 'node',
    hasPrisma: false,
    scripts: ['typecheck', 'lint', 'test', 'build'],
    // `cf:build` runs the Cloudflare Workers adapter over the Next output. It is
    // a required gate in .gitea/workflows/ai-first-markets-ci.yml, which reaches
    // it through scripts/ci/verify-component.sh, but it is deliberately kept out
    // of the monorepo pipeline and the pre-push hook: it rebuilds and rewrites
    // the whole output on top of `build`, for a deploy target only that workflow
    // publishes. Declared here so the difference is a recorded decision — the
    // verify-contract test fails closed if the two declarations differ any
    // other way.
    workflowOnlyScripts: ['cf:build'],
  },
  {
    id: 'local-site-studio',
    name: 'Local Site Studio',
    dir: 'ventures/local-site-studio',
    type: 'node',
    hasPrisma: false,
    scripts: ['typecheck', 'lint', 'test', 'build'],
  },
  {
    id: 'print-atelier',
    name: 'Print Atelier',
    dir: 'ventures/print-atelier',
    type: 'node',
    hasPrisma: false,
    // Kept in step with scripts/ci/verify-component.sh so the YAML gate and the
    // local developer gate do not diverge.
    scripts: ['typecheck', 'lint', 'test', 'build'],
  },
  {
    id: 'retail-pilot-intel',
    name: 'Retail Pilot Intel',
    dir: 'ventures/retail-pilot-intel',
    type: 'pnpm',
    ciScript: 'ci',
  },
  {
    id: 'real-estate-agent-photo-app',
    name: 'Real Estate Agent Photo App (Listing Lens)',
    dir: 'ventures/real-estate-agent-photo-app',
    // The Node package lives one level down; `dir` stays at the venture root so
    // any change in the venture still selects this component.
    packageDir: 'ventures/real-estate-agent-photo-app/pipeline',
    type: 'node',
    hasPrisma: false,
    scripts: ['test'],
  },
  {
    id: 'photos-import-tools',
    name: 'Photos Import Tools',
    dir: 'ventures/photos-import-tools',
    type: 'python',
    testDir: 'tests',
  },
  {
    id: 'photo-editing',
    name: 'Photo Editing Service',
    dir: 'ventures/photo-editing',
    type: 'python',
    testDir: 'tests',
  },
  {
    // The venture itself is a Python component; its documentation site is a
    // separate Node package that nothing verified until it was registered here.
    // A change under docs-site matches this entry and `photo-editing`, so both run.
    id: 'photo-editing-docs-site',
    name: 'Photo Editing Docs Site (ShootFlow)',
    dir: 'ventures/photo-editing/docs-site',
    type: 'node',
    hasPrisma: false,
    scripts: ['typecheck', 'test', 'build'],
  },
  {
    id: 'ubuntu-agent-server',
    name: 'Ubuntu Agent Server',
    dir: 'ventures/ubuntu-agent-server',
    type: 'python',
    testDir: 'tests',
  },
  {
    id: 'marisstella-homepage',
    name: 'Marisstella Homepage',
    dir: 'portfolio/marisstella-homepage',
    type: 'node',
    hasPrisma: false,
    // Was `['build']`, and that was the whole gate on a production UI: the
    // script it ran was `node -e 'console.log("Marisstella homepage build
    // verified")'`, which cannot fail, so the pipeline reported PASSED for a
    // component nothing had checked. `build` and `lint` were removed rather
    // than replaced — the build of a static site is the container image
    // .gitea/workflows/homepage-ci.yml builds, and there is no linter here.
    // `test` is real: see portfolio/marisstella-homepage/test/.
    scripts: ['test'],
  },
  {
    id: 'platform-terraform',
    name: 'Platform Terraform Infrastructure',
    dir: 'platform/terraform',
    type: 'terraform',
  },
  {
    id: 'portfolio-router',
    name: 'Portfolio Router & Ledger',
    dir: 'portfolio/router',
    type: 'python',
    testDir: '.',
  },
];

const ZERO_SHA = /^0+$/;

/**
 * Check that a revision names a commit that actually exists in this checkout.
 *
 * This is the guard that makes the shallow case honest. `actions/checkout`
 * clones with `fetch-depth: 1` unless told otherwise, and in that checkout
 * every revision below except `HEAD` itself is absent — including the `before`
 * SHA the push event names. Resolving a base we cannot reach and diffing
 * against it does not narrow the run, it throws, which is why the old code
 * appeared to work while never once selecting a component in CI.
 */
function commitExists(rev, repoRoot = REPO_ROOT) {
  const res = spawnSync('git', ['cat-file', '-e', `${rev}^{commit}`], {
    cwd: repoRoot,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    stdio: 'ignore',
  });
  return res.status === 0;
}

/**
 * Resolve the revision range whose changes this run must cover.
 *
 * Every branch either names a range that provably contains *all* commits under
 * verification, or returns null so the caller verifies everything. There is no
 * middle setting: a base we cannot resolve means we do not know what changed,
 * and the only safe reading of "unknown" is "could be anything".
 *
 * `HEAD~1` is deliberately not a fallback. It is a range of exactly one commit,
 * so on a push carrying several commits it silently drops every component
 * touched by all but the last — a change in the middle of a push followed by a
 * docs-only commit selected nothing at all.
 *
 * Returns `{ range, reason }`, or `{ range: null, reason }` to force a full run.
 */
export function resolveDiffRange(env = process.env, exists = commitExists) {
  // Pull requests: the full branch diff against the merge target.
  if (env.GITHUB_BASE_REF) {
    const base = `origin/${env.GITHUB_BASE_REF}`;
    if (!exists(base)) {
      return { range: null, reason: `pull-request base ${base} is not in this checkout` };
    }
    return { range: `${base}...HEAD`, reason: `pull request against ${env.GITHUB_BASE_REF}` };
  }

  // Pushes: the whole pushed range, not its final commit. Gitea sends the same
  // push payload shape as GitHub, so `before` is the tip the branch had before
  // this push; `before...HEAD` therefore spans every commit the push carried.
  const before = readPushBeforeSha(env);
  if (before) {
    if (ZERO_SHA.test(before)) {
      // A new branch or tag has no prior tip, so no range describes it.
      return { range: null, reason: 'push created a new ref, no prior tip to diff from' };
    }
    if (!exists(before)) {
      // Force-push whose old tip was discarded, or a shallow clone that never
      // fetched it. Both mean the range is unavailable, not empty.
      return { range: null, reason: `push base ${before.slice(0, 12)} is not in this checkout` };
    }
    return { range: `${before}...HEAD`, reason: `push range from ${before.slice(0, 12)}` };
  }

  return { range: null, reason: 'no pull-request or push base available' };
}

/**
 * Read the pre-push tip from the CI event.
 *
 * Gitea and GitHub both expose the push payload as a JSON file at
 * GITHUB_EVENT_PATH. GITHUB_EVENT_BEFORE is accepted first so a runner that
 * sets it directly, or a caller overriding the range, needs no event file.
 */
function readPushBeforeSha(env) {
  if (env.GITHUB_EVENT_BEFORE) return env.GITHUB_EVENT_BEFORE.trim();

  if (env.GITHUB_EVENT_NAME && env.GITHUB_EVENT_NAME !== 'push') return null;
  if (!env.GITHUB_EVENT_PATH) return null;

  try {
    const payload = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    return typeof payload.before === 'string' ? payload.before.trim() : null;
  } catch {
    // An unreadable or malformed event payload tells us nothing about the
    // range, so fall through to the full run rather than guessing at one.
    return null;
  }
}

/**
 * Determine changed files for this run, or null to verify everything.
 */
export function getChangedFiles(env = process.env, repoRoot = REPO_ROOT) {
  const { range, reason } = resolveDiffRange(env, rev => commitExists(rev, repoRoot));

  if (!range) {
    console.log(`ℹ Change detection unavailable (${reason}) — verifying all components.`);
    return null;
  }

  try {
    const output = execSync(`git diff --name-only ${range}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    console.log(`ℹ Change detection: ${reason}.`);
    return output.trim().split('\n').filter(Boolean);
  } catch {
    // The range resolved but git still refused it. Widen rather than narrow.
    console.log(`ℹ Change detection failed to diff ${range} — verifying all components.`);
    return null;
  }
}

/**
 * Resolve which components are affected based on changed file paths.
 */
export function resolveAffectedComponents(changedFiles, catalog = VENTURE_CATALOG) {
  if (!changedFiles || changedFiles.length === 0) {
    // Default to all components if no diff could be determined or forced
    return catalog.map(c => c.id);
  }

  // Paths that change how every component is verified, so a change to one of
  // them cannot be attributed to a subset. This list only started to matter
  // once detection could actually resolve a range: while it always failed open
  // the whole catalog ran regardless, and a gap here was invisible. A repo-wide
  // gate input missing from this list now selects nothing at all.
  const isGlobalChange = changedFiles.some(f =>
    f.startsWith('.github/') ||
    f.startsWith('.gitea/') ||
    f.startsWith('scripts/') ||
    f.startsWith('platform/ci/') ||
    // The repository-wide pytest suite and its configuration and dependencies.
    f.startsWith('tests/') ||
    f === 'pytest.ini' ||
    f === 'requirements-ci.txt' ||
    // Inputs the coverage ratchet and exception audit gates read for every
    // component; a threshold or expiry edit here changes every verdict.
    f === 'platform/coverage-baseline.yaml' ||
    f === 'platform/exception-register.yaml' ||
    f === 'package.json' ||
    f === 'README.md'
  );

  if (isGlobalChange) {
    return catalog.map(c => c.id);
  }

  const affected = new Set();
  for (const file of changedFiles) {
    for (const item of catalog) {
      if (file.startsWith(`${item.dir}/`)) {
        affected.add(item.id);
      }
    }
  }

  return Array.from(affected);
}

/**
 * Run Security Audit Suite
 */
export function runSecuritySuite(repoRoot = REPO_ROOT) {
  console.log('\n============================================================');
  console.log('🔒 RUNNING MONOREPO SECURITY SUITE');
  console.log('============================================================');

  let passed = true;

  // 1. Repository policy scan
  //
  // A missing scanner used to be indistinguishable from a passing one: both
  // arms below were `if (fs.existsSync(script))` with no else, so renaming or
  // deleting either file left this suite returning true having scanned nothing.
  // These two scripts are tracked repository fixtures, not optional tooling —
  // their absence is a broken checkout or a bad rename, and both should stop
  // the run rather than quietly shrink the security suite.
  const scanPolicyScript = path.join(repoRoot, 'scripts/security/scan-repository.sh');
  if (!fs.existsSync(scanPolicyScript)) {
    console.error(`✖ Security Policy Scan MISSING: ${scanPolicyScript}`);
    passed = false;
  } else {
    console.log('\n▶ Running Security Policy Scan...');
    const res = spawnSync('bash', [scanPolicyScript], { cwd: repoRoot, stdio: 'inherit' });
    if (res.status !== 0) {
      console.error('✖ Security Policy Scan FAILED');
      passed = false;
    } else {
      console.log('✔ Security Policy Scan PASSED');
    }
  }

  // 2. Secret & Vulnerability Audit
  const secScanScript = path.join(repoRoot, 'scripts/security-scan.sh');
  if (!fs.existsSync(secScanScript)) {
    console.error(`✖ Vulnerability & Secret Audit MISSING: ${secScanScript}`);
    passed = false;
  } else {
    console.log('\n▶ Running Monorepo Vulnerability & Secret Audit...');
    // Inherited, never forced. Waiving the dependency audit is a policy
    // exception: it has to be set where a reviewer can see it (the workflow
    // file) rather than applied silently to every run from here.
    if (process.env.SECURITY_SCAN_ALLOW_OFFLINE === '1') {
      console.warn(
        '⚠ SECURITY_SCAN_ALLOW_OFFLINE=1 — the dependency audit may be skipped. ' +
          'A pass is not evidence that recorded vulnerabilities are resolved.',
      );
    }
    const res = spawnSync('bash', [secScanScript], { cwd: repoRoot, stdio: 'inherit' });
    if (res.status !== 0) {
      console.error('✖ Vulnerability & Secret Audit FAILED');
      passed = false;
    } else {
      console.log('✔ Vulnerability & Secret Audit PASSED');
    }
  }

  return passed;
}

/**
 * Execute verification for a single Node component on host
 */
export function verifyNodeHost(component, repoRoot = REPO_ROOT) {
  // `dir` is the affected-path prefix; `packageDir` is where package.json lives.
  // They differ when a venture keeps its Node package in a subdirectory, so a
  // change anywhere in the venture still selects the component for verification.
  const fullDir = path.join(repoRoot, component.packageDir || component.dir);
  // Fail closed, for the reason already stated below about catalog-claimed
  // scripts: a stale registry entry must not become a green run that verified
  // nothing. A catalog entry naming a directory that does not exist is the same
  // defect one level up, and it used to return true.
  if (!fs.existsSync(fullDir) || !fs.existsSync(path.join(fullDir, 'package.json'))) {
    console.error(
      `✖ ${component.id}: catalog claims a Node package at ${component.packageDir || component.dir}, which has no package.json`
    );
    return false;
  }

  console.log(`\n▶ Verifying Node Component: ${component.name} (${component.dir})`);

  try {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(fullDir, 'package.json'), 'utf8'));
    const availableScripts = pkgJson.scripts || {};

    // Install dependencies when they are absent, exactly as verifyPnpmHost has
    // always done for the pnpm workspace. Until this existed the asymmetry was
    // the whole story: `.gitea/workflows/ci-cd.yml` installs node_modules for
    // quick-pick-survey and print-atelier only, because those two are needed by
    // gates in scripts/test-ci.sh that run before this engine. Every other Node
    // component in VENTURE_CATALOG reached `npm run <script>` on a clean runner
    // with no node_modules and died on ERR_MODULE_NOT_FOUND — not a code
    // failure, a missing-dependency one. Affected-path detection meant that fired
    // precisely when a venture changed, so the tests of ai-first-markets,
    // local-site-studio, photo-editing/docs-site, ai-engineering-academy/site and
    // real-estate-agent-photo-app could never have run in CI. local-site-studio
    // alone is 1214 passing tests that no CI run has ever executed.
    //
    // Gated on declared dependencies rather than on a lockfile: portfolio/
    // marisstella-homepage declares none and needs no install, and running
    // `npm ci` there would fail for want of a lockfile it has no reason to have.
    const declaresDependencies =
      Object.keys(pkgJson.dependencies || {}).length > 0 ||
      Object.keys(pkgJson.devDependencies || {}).length > 0;
    if (declaresDependencies && !fs.existsSync(path.join(fullDir, 'node_modules'))) {
      const hasLockfile = fs.existsSync(path.join(fullDir, 'package-lock.json'));
      // `npm ci` is the reproducible form and matches scripts/ci/verify-component.sh.
      // A component with dependencies and no lockfile is a reproducibility defect
      // in its own right; install it rather than failing the run, and say so.
      if (!hasLockfile) {
        console.log(
          `  ⚠ ${component.id} declares dependencies but has no package-lock.json; installing unpinned.`
        );
      }
      // The command is logged, not just the intent, so a contract test can hold
      // a lockfile-bearing component to the reproducible form.
      const installCommand = `npm ${hasLockfile ? 'ci' : 'install'} --ignore-scripts --no-audit --fund=false`;
      console.log(`  Installing component dependencies: ${installCommand}`);
      execSync(installCommand, { cwd: fullDir, stdio: 'inherit' });
    }

    // Prisma generate after the install, since the generator is a dependency.
    if (component.hasPrisma && fs.existsSync(path.join(fullDir, 'prisma/schema.prisma'))) {
      console.log('  Generating Prisma schema...');
      execSync('npx prisma generate', { cwd: fullDir, stdio: 'inherit' });
    }

    // Fail closed. Silently skipping a catalog-claimed script turns a stale
    // registry entry into a green run that verified nothing.
    const undefinedScripts = component.scripts.filter((script) => !availableScripts[script]);
    if (undefinedScripts.length > 0) {
      throw new Error(
        `${component.id}: catalog claims script(s) not defined in ${component.packageDir || component.dir}/package.json: ${undefinedScripts.join(', ')}`
      );
    }

    // Clean stale Next.js build cache before verification starts
    if (fs.existsSync(path.join(fullDir, '.next'))) {
      fs.rmSync(path.join(fullDir, '.next'), { recursive: true, force: true });
    }

    for (const script of component.scripts) {
      if (script === 'build' && fs.existsSync(path.join(fullDir, '.next'))) {
        fs.rmSync(path.join(fullDir, '.next'), { recursive: true, force: true });
      }
      console.log(`  Running: npm run ${script}...`);
      execSync(`npm run ${script}`, { cwd: fullDir, stdio: 'inherit' });
    }

    console.log(`✔ ${component.name} PASSED`);
    return true;
  } catch (err) {
    console.error(`✖ ${component.name} FAILED`);
    return false;
  }
}

/**
 * Execute verification for a pnpm-workspace component on host.
 *
 * These ventures own their gate sequence in their own `ci` script rather than
 * exposing a flat list of npm scripts, so the catalog defers to it.
 */
export function verifyPnpmHost(component, repoRoot = REPO_ROOT) {
  const fullDir = path.join(repoRoot, component.dir);
  if (!fs.existsSync(fullDir) || !fs.existsSync(path.join(fullDir, 'package.json'))) {
    console.error(
      `✖ ${component.id}: catalog claims a pnpm workspace at ${component.dir}, which has no package.json`
    );
    return false;
  }

  console.log(`\n▶ Verifying pnpm Workspace: ${component.name} (${component.dir})`);

  try {
    const defaultCorepackHome = fs.existsSync('/Users/duncan/.cache/node/corepack')
      ? '/Users/duncan/.cache/node/corepack'
      : path.join(os.homedir(), '.cache/node/corepack');
    const env = {
      ...process.env,
      COREPACK_ENABLE_NETWORK: '0',
      COREPACK_HOME: process.env.COREPACK_HOME || defaultCorepackHome,
    };
    if (!fs.existsSync(path.join(fullDir, 'node_modules'))) {
      console.log('  Installing workspace dependencies...');
      execSync('pnpm install --frozen-lockfile --ignore-scripts', {
        cwd: fullDir,
        env,
        stdio: 'inherit',
      });
    }

    const script = component.ciScript || 'ci';
    console.log(`  Running: pnpm run ${script}...`);
    execSync(`pnpm run ${script}`, { cwd: fullDir, env, stdio: 'inherit' });

    console.log(`✔ ${component.name} PASSED`);
    return true;
  } catch (err) {
    console.error(`✖ ${component.name} FAILED`);
    return false;
  }
}

/**
 * Execute verification for a single Python component on host
 */
export function verifyPythonHost(component, repoRoot = REPO_ROOT) {
  const fullDir = path.join(repoRoot, component.dir);
  if (!fs.existsSync(fullDir)) {
    console.error(`✖ ${component.id}: catalog claims a Python component at ${component.dir}, which does not exist`);
    return false;
  }

  console.log(`\n▶ Verifying Python Component: ${component.name} (${component.dir})`);
  try {
    const targetPath = component.testDir || 'tests';
    const checkPath = path.join(fullDir, targetPath);
    // The `if` below had no `else`, so a catalog entry pointing at a test
    // directory that had been moved or never created ran nothing and printed
    // PASSED. A Python component registered here exists to have its suite run;
    // no suite is a failure, not a pass.
    if (!fs.existsSync(checkPath) && targetPath !== '.' && !targetPath.endsWith('.py')) {
      console.error(
        `✖ ${component.id}: catalog claims a test path at ${path.join(component.dir, targetPath)}, which does not exist`
      );
      return false;
    }
    {
      console.log('  Running Python test suite...');
      if (fs.existsSync(path.join(fullDir, 'test_router.py'))) {
        execSync('TMPDIR="/private/tmp" python3 test_router.py', {
          cwd: fullDir,
          stdio: 'inherit',
        });
      } else {
        execSync(`TMPDIR="/private/tmp" PYTHONPATH="src:." pytest ${targetPath} -v -q --tb=short`, {
          cwd: fullDir,
          stdio: 'inherit',
        });
      }
    }
    console.log(`✔ ${component.name} PASSED`);
    return true;
  } catch (err) {
    console.error(`✖ ${component.name} FAILED`);
    return false;
  }
}

/**
 * Execute Terraform verification on host
 */
export function verifyTerraformHost(component, repoRoot = REPO_ROOT) {
  const fullDir = path.join(repoRoot, component.dir);
  console.log(`\n▶ Verifying Terraform Configuration: ${component.name}`);
  try {
    const hasTf = spawnSync('command', ['-v', 'terraform'], { shell: true }).status === 0;
    if (!hasTf) {
      // Still returns true — a host without the CLI cannot verify, and failing
      // every developer machine that lacks Terraform would only teach people to
      // skip the pipeline. But it must not print PASSED. It did, and since
      // .gitea/workflows/ci-cd.yml installs no Terraform either, this component
      // reported success in CI on every run while checking nothing.
      console.warn(
        `⚠ ${component.name} NOT VERIFIED: Terraform CLI not installed on this host. ` +
          'This run proves nothing about platform/terraform.'
      );
      return true;
    }
    const env = { ...process.env, TF_CLI_CONFIG_FILE: '/dev/null' };
    execSync('terraform fmt -check -recursive', { cwd: fullDir, env, stdio: 'inherit' });
    if (fs.existsSync(path.join(fullDir, '.terraform'))) {
      // `validate` is only reached when .terraform exists, so the directory is
      // already initialized and a failure here is an invalid configuration, not
      // an offline environment. Catching it and printing "skipped" turned the
      // one real Terraform gate in the pipeline into a message.
      execSync('terraform validate', { cwd: fullDir, env, stdio: 'inherit' });
    } else {
      console.log('ℹ Terraform backend not initialized; verified formatting only.');
    }
    console.log(`✔ ${component.name} PASSED`);
    return true;
  } catch (err) {
    console.error(`✖ ${component.name} FAILED`);
    return false;
  }
}

/**
 * Dagger Engine Containerized Execution Entrypoint
 */
export async function runDaggerContainerizedPipeline(affectedIds, catalog = VENTURE_CATALOG, repoRoot = REPO_ROOT) {
  console.log('\n🐳 Attempting Dagger Engine Containerized Pipeline Execution...');

  try {
    const { connect } = await import('@dagger.io/dagger');

    return await connect(async (client) => {
      console.log('✔ Connected to Dagger Engine session.');

      const hostSource = client.host().directory(repoRoot, {
        exclude: ['node_modules', '.git', 'dist', '.next', '.pytest_cache', '__pycache__'],
      });

      let allPassed = true;

      for (const id of affectedIds) {
        const component = catalog.find(c => c.id === id);
        if (!component) continue;

        console.log(`\n🚀 [Dagger Engine] Running containerized pipeline job for: ${component.name}`);

        if (component.type === 'node') {
          let container = client
            .container()
            .from('node:22-alpine')
            .withDirectory('/app', hostSource)
            .withWorkdir(`/app/${component.packageDir || component.dir}`)
            .withExec(['npm', 'ci', '--ignore-scripts']);

          if (component.hasPrisma) {
            container = container.withExec(['npx', 'prisma', 'generate']);
          }

          for (const script of component.scripts || []) {
            container = container.withExec(['npm', 'run', script]);
          }

          await container.sync();
          console.log(`✔ [Dagger Engine] ${component.name} completed successfully.`);
        } else if (component.type === 'python') {
          const testPath = component.testDir || 'tests';
          const container = client
            .container()
            .from('python:3.11-slim')
            .withDirectory('/app', hostSource)
            .withWorkdir(`/app/${component.dir}`)
            .withExec(['pip', 'install', 'pytest', 'pyyaml'])
            .withExec(['pytest', testPath]);

          await container.sync();
          console.log(`✔ [Dagger Engine] ${component.name} completed successfully.`);
        } else if (component.type === 'pnpm') {
          const container = client
            .container()
            .from('node:22-alpine')
            .withDirectory('/app', hostSource)
            .withWorkdir(`/app/${component.dir}`)
            .withExec(['corepack', 'pnpm', 'install', '--frozen-lockfile', '--ignore-scripts'])
            .withExec(['corepack', 'pnpm', 'run', component.ciScript || 'ci']);

          await container.sync();
          console.log(`✔ [Dagger Engine] ${component.name} completed successfully.`);
        } else if (component.type === 'terraform') {
          // Terraform verification is host-side; run it rather than letting the
          // container path report an unverified component as successful.
          if (!verifyTerraformHost(component, repoRoot)) {
            allPassed = false;
          }
        } else {
          // Never let an unhandled type report success from the container path.
          throw new Error(
            `[Dagger Engine] ${component.id}: unsupported component type "${component.type}"`
          );
        }
      }

      return allPassed;
    }, { LogOutput: process.stdout });
  } catch (daggerErr) {
    console.log(`ℹ Dagger Engine container daemon not available (${daggerErr.message}).`);
    console.log('🔄 Seamlessly falling back to isolated host verification execution...');
    return null; // Signals caller to run host verification fallback
  }
}

/**
 * Main Pipeline CLI Execution
 */
export async function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes('--all');
  const skipSecurity = args.includes('--skip-security');
  const ventureArgIdx = args.indexOf('--venture');
  const targetVenture = ventureArgIdx !== -1 ? args[ventureArgIdx + 1] : null;

  console.log('============================================================');
  console.log('🚀 MONOREPO UNIFIED DAGGER CI/CD ENGINE');
  console.log('============================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Repo Root: ${REPO_ROOT}`);

  let affectedIds;

  if (targetVenture) {
    console.log(`🎯 Targeted Execution Mode: ${targetVenture}`);
    affectedIds = [targetVenture];
  } else if (runAll) {
    console.log('🌐 Full Verification Mode (--all specified)');
    affectedIds = VENTURE_CATALOG.map(c => c.id);
  } else {
    const changedFiles = getChangedFiles();
    affectedIds = resolveAffectedComponents(changedFiles, VENTURE_CATALOG);
    if (changedFiles === null) {
      // Saying "found N affected" here read as a considered selection when it
      // was the opposite: detection had failed and N was simply the catalog.
      console.log(`🌐 Full Verification Mode: ${affectedIds.length} component(s), change detection unavailable.`);
    } else {
      console.log(
        `🎯 Affected Path Detection: ${changedFiles.length} changed file(s) → ` +
        `${affectedIds.length} affected component(s).`
      );
    }
  }

  console.log('Components to verify:', affectedIds.join(', ') || 'None');

  let totalFailures = 0;

  // 1. Run Security Suite
  if (!skipSecurity) {
    const secPassed = runSecuritySuite(REPO_ROOT);
    if (!secPassed) totalFailures++;
  }

  // 2. Try Containerized Dagger Pipeline
  const daggerResult = await runDaggerContainerizedPipeline(affectedIds, VENTURE_CATALOG, REPO_ROOT);

  if (daggerResult === false) {
    totalFailures++;
  } else if (daggerResult === null) {
    // Dagger engine was unavailable, perform Host Verification Fallback
    console.log('\n============================================================');
    console.log('💻 RUNNING HOST VERIFICATION SUITE');
    console.log('============================================================');

    for (const id of affectedIds) {
      const component = VENTURE_CATALOG.find(c => c.id === id);
      if (!component) continue;

      let passed = true;
      if (component.type === 'node') {
        passed = verifyNodeHost(component, REPO_ROOT);
      } else if (component.type === 'pnpm') {
        passed = verifyPnpmHost(component, REPO_ROOT);
      } else if (component.type === 'python') {
        passed = verifyPythonHost(component, REPO_ROOT);
      } else if (component.type === 'terraform') {
        passed = verifyTerraformHost(component, REPO_ROOT);
      } else {
        // An unrecognized type must not count as a pass.
        console.error(`✖ ${component.id}: unknown component type "${component.type}"`);
        passed = false;
      }

      if (!passed) totalFailures++;
    }
  }

  console.log('\n============================================================');
  if (totalFailures === 0) {
    console.log('🎉 ALL CI VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('============================================================');
    process.exit(0);
  } else {
    console.error(`🚨 CI VERIFICATION FAILED WITH ${totalFailures} COMPONENT FAILURE(S).`);
    console.log('============================================================');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Unhandled pipeline exception:', err);
    process.exit(1);
  });
}
