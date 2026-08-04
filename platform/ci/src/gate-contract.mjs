/**
 * Gate contract: keep the two executable definitions of a component's quality
 * gates from drifting apart.
 *
 * A component's gate sequence is declared twice, and both declarations run for
 * real:
 *
 * - `VENTURE_CATALOG[].scripts` in `pipeline.mjs` is what the monorepo-wide
 *   Dagger engine runs (`.gitea/workflows/ci-cd.yml`, `scripts/verify-all.sh`,
 *   and the pre-push hook).
 * - `scripts/ci/verify-component.sh` is what the per-venture Gitea workflows
 *   run.
 *
 * `pipeline.mjs` already carries a comment asking that print-atelier's two
 * declarations be "kept in step". A comment is not a gate. When the two drift,
 * the failure is silent and asymmetric: a gate present in one place and absent
 * in the other still reports green from whichever pipeline happens to run, so
 * the missing gate looks like a passing gate. That is the same failure mode the
 * catalog registration tests already fail closed on, one layer up.
 *
 * This module makes the drift detectable in both directions:
 *
 * - a gate the catalog runs must also run in the shell script, otherwise the
 *   per-venture workflow merges changes the monorepo pipeline would have caught;
 * - a gate the shell script runs must either be in the catalog or be explicitly
 *   declared below as CI-only, with a reason.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const VERIFY_COMPONENT_SCRIPT = 'scripts/ci/verify-component.sh';

/**
 * Gates the per-venture Gitea workflows run that the monorepo Dagger engine
 * deliberately does not. Each entry needs a reason, because "CI runs more than
 * local" is a developer-experience defect unless it is a considered exception:
 * a developer running the documented local gate has to be able to predict CI.
 *
 * Anything not listed here is drift, not an exception.
 */
export const CI_ONLY_GATES = {
  // `cf:build` is a Cloudflare OpenNext packaging step that only means
  // something on the deploy path; the plain `build` is in the catalog.
  'ai-first-markets': ['cf:build'],
};

/**
 * Parse the case arms of `scripts/ci/verify-component.sh` into the ordered list
 * of gates each one runs, keyed by the directory the gate runs in.
 *
 * Parsing the shell script rather than restating its contents is the point: a
 * restatement is a third declaration that can itself drift.
 */
export function parseVerifyComponentScript(repoRoot = REPO_ROOT) {
  const source = fs.readFileSync(path.join(repoRoot, VERIFY_COMPONENT_SCRIPT), 'utf8');
  const lines = source.split('\n');

  const arms = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();

    // `  pairwise)` opens an arm; `  *)` is the usage fallback, not a component.
    const armStart = /^([A-Za-z][\w-]*)\)$/.exec(line);
    if (armStart && current === null) {
      current = { label: armStart[1], gates: [] };
      continue;
    }

    if (current === null) continue;

    if (line === ';;') {
      arms.push(current);
      current = null;
      continue;
    }

    // `run_npm <dir> npm run <script>` / `run_npm <dir> npm test`
    const runNpm = /^run_npm\s+(\S+)\s+npm\s+(?:run\s+)?(\S+)$/.exec(line);
    if (runNpm) {
      current.gates.push({ dir: runNpm[1], gate: runNpm[2], kind: 'npm' });
      continue;
    }

    // `run_npm <dir> npx prisma generate` — a prerequisite, not a quality gate.
    const runNpx = /^run_npm\s+(\S+)\s+npx\s+prisma\s+generate$/.exec(line);
    if (runNpx) {
      current.gates.push({ dir: runNpx[1], gate: 'prisma-generate', kind: 'prisma' });
      continue;
    }

    // pnpm workspaces run their own gate sequence from a subshell that cds in.
    const cd = /^cd\s+"\$repo_root\/(\S+?)"$/.exec(line);
    if (cd) {
      current.workspaceDir = cd[1];
      continue;
    }

    const pnpmRun = /^corepack\s+pnpm\s+run\s+(\S+)$/.exec(line);
    if (pnpmRun && current.workspaceDir) {
      current.gates.push({ dir: current.workspaceDir, gate: pnpmRun[1], kind: 'pnpm' });
      continue;
    }

    // The same subshell shape, running npm directly. A component with no
    // dependencies and no lockfile cannot go through `run_npm`, which would
    // run `npm ci` and fail for want of one. Without this branch such an arm
    // parses to zero gates, and an arm that appears to run nothing is exactly
    // what the findings below are meant to catch — it must not be produced by
    // the parser itself.
    const npmRun = /^npm\s+(?:run\s+)?(\S+)$/.exec(line);
    if (npmRun && current.workspaceDir) {
      current.gates.push({ dir: current.workspaceDir, gate: npmRun[1], kind: 'npm' });
      continue;
    }
  }

  return arms;
}

/**
 * The gates the catalog runs for a component, in catalog order.
 */
export function catalogGates(component) {
  if (component.type === 'pnpm') return [component.ciScript || 'ci'];
  return component.scripts || [];
}

/**
 * Match a shell arm to the catalog entry that owns the directory it verifies.
 *
 * Matching on directory rather than on name is deliberate: the shell arm for
 * `ventures/quick-pick-survey` is spelled `pairwise`, and a hand-maintained
 * alias table would be a fourth thing to keep in step.
 */
export function resolveArmComponent(arm, catalog) {
  const dirs = [...new Set(arm.gates.map((g) => g.dir))];
  if (dirs.length !== 1) return { dirs, component: null };

  const dir = dirs[0];
  const component = catalog.find((c) => (c.packageDir || c.dir) === dir) || null;
  return { dirs, component, dir };
}

/**
 * Compare both declarations and return every divergence.
 *
 * Returns an array of `{ severity, code, label, message }`. An empty array
 * means the monorepo gate and the per-venture gate run the same checks.
 */
export function findGateDrift(catalog, repoRoot = REPO_ROOT, ciOnlyGates = CI_ONLY_GATES) {
  const findings = [];
  const arms = parseVerifyComponentScript(repoRoot);

  if (arms.length === 0) {
    findings.push({
      severity: 'error',
      code: 'no-arms-parsed',
      label: VERIFY_COMPONENT_SCRIPT,
      message:
        `Parsed no component arms out of ${VERIFY_COMPONENT_SCRIPT}. Either the ` +
        'script no longer defines its gates as a case statement, or this parser ' +
        'is stale — both mean the drift check is no longer checking anything.',
    });
    return findings;
  }

  for (const arm of arms) {
    const { dirs, dir, component } = resolveArmComponent(arm, catalog);

    if (dirs.length > 1) {
      findings.push({
        severity: 'error',
        code: 'arm-spans-directories',
        label: arm.label,
        message:
          `The '${arm.label}' arm verifies more than one directory ` +
          `(${dirs.join(', ')}), so its gates cannot be attributed to a single ` +
          'catalog entry. Split it, or extend this check to handle it.',
      });
      continue;
    }

    if (!component) {
      findings.push({
        severity: 'error',
        code: 'arm-without-catalog-entry',
        label: arm.label,
        message:
          `The '${arm.label}' arm verifies ${dir}, which no VENTURE_CATALOG entry ` +
          'owns. The per-venture workflow gates a component the monorepo pipeline ' +
          'never runs, so a change that skips the venture workflow is unverified.',
      });
      continue;
    }

    const shellGates = arm.gates.filter((g) => g.kind !== 'prisma').map((g) => g.gate);
    const declared = catalogGates(component);
    const ciOnly = ciOnlyGates[component.id] || [];

    const missingInShell = declared.filter((g) => !shellGates.includes(g));
    if (missingInShell.length > 0) {
      findings.push({
        severity: 'error',
        code: 'gate-missing-from-ci-workflow',
        label: arm.label,
        message:
          `${component.id}: the catalog runs ${missingInShell.join(', ')} but the ` +
          `'${arm.label}' arm of ${VERIFY_COMPONENT_SCRIPT} does not. The venture's ` +
          'own Gitea workflow is weaker than the monorepo gate, so a failure it ' +
          'would have caught can merge. Add the gate to the script.',
      });
    }

    const undeclaredExtras = shellGates.filter(
      (g) => !declared.includes(g) && !ciOnly.includes(g),
    );
    if (undeclaredExtras.length > 0) {
      findings.push({
        severity: 'error',
        code: 'undeclared-ci-only-gate',
        label: arm.label,
        message:
          `${component.id}: the '${arm.label}' arm runs ${undeclaredExtras.join(', ')}, ` +
          'which the catalog does not run and CI_ONLY_GATES does not justify. Either ' +
          'add it to the catalog so local verification matches CI, or declare it in ' +
          'CI_ONLY_GATES with the reason it is deliberately CI-only.',
      });
    }

    const redundantExceptions = ciOnly.filter((g) => declared.includes(g));
    if (redundantExceptions.length > 0) {
      findings.push({
        severity: 'error',
        code: 'redundant-ci-only-exception',
        label: arm.label,
        message:
          `${component.id}: CI_ONLY_GATES excuses ${redundantExceptions.join(', ')} ` +
          'from the catalog, but the catalog runs it. Remove the exception — an ' +
          'exception list that accumulates entries it does not need stops being read.',
      });
    }

    const staleExceptions = ciOnly.filter((g) => !shellGates.includes(g));
    if (staleExceptions.length > 0) {
      findings.push({
        severity: 'error',
        code: 'stale-ci-only-exception',
        label: arm.label,
        message:
          `${component.id}: CI_ONLY_GATES claims ${staleExceptions.join(', ')} runs ` +
          'in CI, but the script no longer runs it. An exception that no longer ' +
          'describes anything hides the gate going missing from both places.',
      });
    }

    if (component.hasPrisma) {
      const generates = arm.gates.some((g) => g.kind === 'prisma');
      if (!generates) {
        findings.push({
          severity: 'error',
          code: 'missing-prisma-generate',
          label: arm.label,
          message:
            `${component.id}: the catalog generates the Prisma client before ` +
            `verifying, but the '${arm.label}' arm does not. Typecheck and tests ` +
            'run against a stale or absent generated client.',
        });
      }
    }
  }

  // An exception for a component with no arm at all describes nothing.
  const armedIds = new Set(
    arms.map((arm) => resolveArmComponent(arm, catalog).component?.id).filter(Boolean),
  );
  for (const id of Object.keys(ciOnlyGates)) {
    if (!armedIds.has(id)) {
      findings.push({
        severity: 'error',
        code: 'orphaned-ci-only-exception',
        label: id,
        message:
          `CI_ONLY_GATES declares exceptions for '${id}', but ${VERIFY_COMPONENT_SCRIPT} ` +
          'has no arm for it. Remove the stale exception.',
      });
    }
  }

  return findings;
}

export function formatFindings(findings) {
  return findings.map((f) => `  [${f.severity}] ${f.code} (${f.label})\n    ${f.message}`).join('\n\n');
}
