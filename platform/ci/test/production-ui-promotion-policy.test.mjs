// Production UI promotion policy.
//
// docs/QUALITY-ENGINEERING.md blocks automatic promotion to a production UI
// until the surface has a candidate browser suite. Where that block is honoured
// it looks the same everywhere: the promoting job runs only on
// `workflow_dispatch` from `main`, requires an owner-approved exception with a
// tracked issue, evidence and a bounded expiry, and validates all four through
// `scripts/ci/validate-release-exception.sh` *before* it touches anything
// privileged.
//
// This file used to take a three-entry hardcoded list of
// `{workflow, job, privilegedMarker}` as its input:
//
//     .gitea/workflows/homepage-ci.yml         job `deploy`
//     .gitea/workflows/pairwise-ci.yml         job `promote`
//     .gitea/workflows/ai-first-markets-deploy.yml  job `verify-and-deploy`
//
// `docs/CONTROL-AUDIT-2026-08-04.md` finding 5 measured what that missed. In the
// same workflow the list already named, the `container` job pushed
// `git.marisstella.dev/giteaadmin/marisstella-homepage:latest` on every merge to
// `main` — no dispatch gate, no exception, no validation.
// `platform/k8s/apps/marisstella-homepage/kustomization.yaml` resolves that image
// at `newTag: latest`, and `platform/k8s/argocd-apps/marisstella-homepage.yaml`
// syncs that directory from `HEAD` with `automated: {prune: true, selfHeal: true}`.
// So every merge promoted a new build to the cluster behind the venture with the
// portfolio's only live public customer surface, through a job the policy control
// was not looking at. The list was not wrong about the jobs it named; it was the
// wrong *kind* of input.
//
// The input is now derived, in two directions, and neither of them is a list a
// person maintains:
//
//   * The workflows are every workflow file `git ls-files` tracks, the same
//     conversion `3f93986c` made for the four `uses:`-pinning controls and
//     `a658ed57` made for gate collection. A workflow added tomorrow is policed
//     without anyone remembering this file exists.
//   * What counts as a promotion is read out of the cluster manifests. An image
//     is "followed" when an ArgoCD Application with `automated:` sync points at
//     an app directory whose effective image reference is a mutable tag rather
//     than a digest. Pushing that exact tag *is* the promotion, whatever the job
//     is called. `pairwise-app` is digest-pinned in its kustomization, so
//     pairwise-ci.yml's `:latest` push moves nothing and is correctly not a
//     promotion; `marisstella-homepage` is not, so its `:latest` push was one.
//
// Two further defects from the same finding, both about checks that could not
// fail. `90645032` had already replaced the `indexOf(...) < indexOf(...)`
// comparison — satisfied by `-1 < n` when the step is absent — and the
// `?? ''` fallback on the step-block regex. What remained, and is fixed here, is
// that the ordering check trusted a hand-written `privilegedMarker` string per
// entry, and the shell-injection check read exactly one named step. Both now
// derive from the job: the privileged step is the *first* step in the job whose
// body does something to production, and the injection check reads every `run:`
// in the job rather than one of them.
//
// Declared scope, so the gap is a stated one rather than an implied one. The
// rules below cover promotion into this repository's own production cluster and
// container registry, plus any job that declares `environment: production`.
// Venture-owned publishes to third-party hosting are enumerated but not yet
// judged: `ventures/retail-pilot-intel/.github/workflows/deploy-docs.yml` ships
// a docs site to GitHub Pages and, behind a repository variable, to Vercel, with
// no exception gate at all. That is a real uncovered production publish path and
// it needs its own decision, not a silent extension of this one.
// `terraform-apply.yml` is out of scope for the same reason
// `deploy-gate-contract.test.mjs` excludes it: an infrastructure apply gates
// through plan review and the `production-infrastructure` environment, which is
// a different control rather than a weaker one.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

/** Tracked paths under `pathspecs`, from the git index rather than the disk. */
function gitLsFiles(pathspecs) {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
    env: GIT_ENV,
  });
  return listed.split('\0').filter(Boolean).sort();
}

/**
 * The two places this repository keeps workflows: the monorepo's own Gitea CI,
 * and the per-venture GitHub workflows that ship inside each venture directory.
 */
const WORKFLOW_PATHSPECS = ['.gitea/workflows', 'ventures'];

const isWorkflowPath = (entry) =>
  (entry.startsWith('.gitea/workflows/') || entry.includes('.github/workflows/')) &&
  (entry.endsWith('.yml') || entry.endsWith('.yaml'));

function trackedWorkflowPaths() {
  return gitLsFiles(WORKFLOW_PATHSPECS).filter(isWorkflowPath);
}

function readRepoFile(relative) {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Workflow structure
// ---------------------------------------------------------------------------

/** Every job in a workflow, as `{ name, block }`, discovered from the source. */
function jobsOf(source) {
  const lines = source.split('\n');
  const jobsAt = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (jobsAt === -1) return [];

  const jobs = [];
  let current = null;
  for (let index = jobsAt + 1; index < lines.length; index += 1) {
    const line = lines[index];
    // A non-blank line back at column 0 ends the `jobs:` mapping.
    if (line.trim() !== '' && !/^\s/.test(line)) break;

    const heading = /^ {2}([A-Za-z0-9_.-]+):\s*(?:#.*)?$/.exec(line);
    if (heading) {
      current = { name: heading[1], lines: [] };
      jobs.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return jobs.map(({ name, lines: body }) => ({ name, block: body.join('\n') }));
}

/** Every step in a job block, in declaration order. */
function stepsOf(block) {
  const lines = block.split('\n');
  const stepsAt = lines.findIndex((line) => /^ {4}steps:\s*(?:#.*)?$/.test(line));
  if (stepsAt === -1) return [];

  const steps = [];
  let current = null;
  for (let index = stepsAt + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^ {6}- /.test(line)) {
      current = { lines: [line] };
      steps.push(current);
      continue;
    }
    // A non-blank line shallower than the list items ends `steps:`.
    if (line.trim() !== '' && !/^ {6}/.test(line)) break;
    if (current) current.lines.push(line);
  }

  return steps.map(({ lines: body }, index) => {
    const text = body.join('\n');
    const named = /^ {6}- (?:name|uses):\s*(.+?)\s*$/.exec(body[0]);
    return { index, text, name: named ? named[1] : '(unnamed step)' };
  });
}

/** The `run:` payload of a step, or `''` when the step runs no shell. */
function runBodyOf(stepText) {
  const at = stepText.search(/^\s+run:/m);
  return at === -1 ? '' : stepText.slice(at);
}

/**
 * What it looks like for a step to do something to production.
 *
 * This replaces the per-entry `privilegedMarker` string the control used to be
 * handed. A marker somebody types is a marker somebody can retype: renaming the
 * step it named left the old check comparing against a step that no longer
 * existed. These match what the step *does*.
 */
const PRODUCTION_MUTATION = [
  /docker\s+push\b/,
  /docker\s+buildx\s+imagetools\s+create\b/,
  /kubectl[^\n]*\b(?:apply|create|patch|annotate|replace|delete|rollout|set)\b/,
  /\bgit\s+push\b/,
  /npm\s+run\s+(?:deploy|upload|cf:deploy)\b/,
  /(?:wrangler|opennextjs-cloudflare)\s+(?:deploy|upload)\b/,
  /platform\/ci\/(?:deploy|promote)[a-z0-9-]*\.sh/,
  /secrets\.HETZNER_KUBECONFIG_B64/,
  /persist-credentials:\s*true/,
];

const mutatesProduction = (text) => PRODUCTION_MUTATION.some((pattern) => pattern.test(text));

/**
 * Interpolations that must not reach a shell.
 *
 * `${{ inputs.x }}` and the `github.event` payload are caller-controlled text.
 * Spliced into `run:` they are command injection into a job holding production
 * credentials; passed through `env:` they are shell variables and are inert.
 */
const SHELL_INTERPOLATION = /\$\{\{\s*(?:inputs\.|github\.event|github\.head_ref)/;

// ---------------------------------------------------------------------------
// What the cluster actually follows
// ---------------------------------------------------------------------------

/** App directories an ArgoCD Application syncs automatically. */
function autoSyncedAppDirectories() {
  const directories = new Set();
  for (const relative of gitLsFiles(['platform/k8s/argocd-apps'])) {
    if (!/\.ya?ml$/.test(relative)) continue;
    const source = readRepoFile(relative);
    if (!/^kind:\s*Application\s*$/m.test(source)) continue;
    if (!/^\s+automated:\s*$/m.test(source)) continue;
    const declaredPath = /^\s+path:\s*(\S+)\s*$/m.exec(source);
    if (declaredPath) directories.add(declaredPath[1].replace(/\/+$/, ''));
  }
  return directories;
}

/** `images:` overrides in a kustomization, keyed by the image name they replace. */
function kustomizeImageOverrides(source) {
  const overrides = new Map();
  const imagesAt = source.search(/^images:\s*$/m);
  if (imagesAt === -1) return overrides;

  const lines = source.slice(imagesAt).split('\n').slice(1);
  let current = null;
  for (const line of lines) {
    // The list items sit at column 0 under `images:`, so "back at column 0"
    // cannot be the end condition — only a non-list key there is.
    if (line.trim() !== '' && !/^\s/.test(line) && !/^-\s/.test(line)) break;
    const entry = /^-\s+name:\s*(\S+)\s*$/.exec(line);
    if (entry) {
      current = { name: entry[1], newName: null, newTag: null, digest: null };
      overrides.set(entry[1], current);
      continue;
    }
    if (!current) continue;
    const field = /^\s+(newName|newTag|digest):\s*(\S+)\s*$/.exec(line);
    if (field) current[field[1]] = field[2];
  }
  return overrides;
}

/**
 * Every image reference the cluster follows at a *mutable tag*, as
 * `imageName -> { tag, app }`.
 *
 * Pushing one of these tags moves what production runs on the next sync or pod
 * restart, with no commit and no review. Digest-pinned references are excluded:
 * a push cannot move them, which is exactly why the pin is worth having.
 */
function floatingProductionImages() {
  const autoSynced = autoSyncedAppDirectories();
  const floating = new Map();

  for (const directory of autoSynced) {
    const tracked = gitLsFiles([directory]);
    const deployments = tracked.filter((entry) => /\/deployment\.ya?ml$/.test(entry));
    if (deployments.length === 0) continue;

    const kustomization = tracked.find((entry) => /\/kustomization\.ya?ml$/.test(entry));
    const overrides = kustomization
      ? kustomizeImageOverrides(readRepoFile(kustomization))
      : new Map();

    for (const deployment of deployments) {
      const source = readRepoFile(deployment);
      for (const match of source.matchAll(/^\s+image:\s*(\S+)/gm)) {
        const reference = match[1];
        if (reference.includes('@sha256:')) continue;
        const [declaredName, declaredTag] = [
          reference.replace(/:[^:/]+$/, ''),
          /:([^:/]+)$/.exec(reference)?.[1] ?? null,
        ];

        const override = overrides.get(declaredName);
        if (override?.digest) continue; // immutable: a push cannot move it
        const name = override?.newName ?? declaredName;
        const tag = override?.newTag ?? declaredTag;
        if (!tag) continue;
        floating.set(name, { tag, app: path.basename(directory) });
      }
    }
  }
  return floating;
}

/** The floating production tags a job pushes, if any. */
function floatingTagPushes(block, floating) {
  const pushed = [];
  const pushLines = block
    .split('\n')
    .filter((line) => /docker\s+push\b|docker\s+buildx\s+imagetools\s+create\b/.test(line));

  for (const [name, { tag, app }] of floating) {
    const reference = new RegExp(`${escapeRegExp(`${name}:${tag}`)}(?![\\w.-])`);
    if (pushLines.some((line) => reference.test(line))) pushed.push({ name, tag, app });
  }
  return pushed;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Every job that can promote to a production UI, derived rather than listed.
 *
 * Two independent ways in, because the homepage came in through the second one
 * while the control was watching the first:
 *   1. the job declares `environment: production` and mutates something, or
 *   2. the job pushes a mutable tag an auto-synced cluster manifest follows.
 */
function promotionJobs() {
  const floating = floatingProductionImages();
  const found = [];

  for (const relative of trackedWorkflowPaths()) {
    const source = readRepoFile(relative);
    for (const { name, block } of jobsOf(source)) {
      const pushes = floatingTagPushes(block, floating);
      const declaresProduction = /^\s+environment:\s*production\s*$/m.test(block);
      const reasons = [];
      if (declaresProduction && mutatesProduction(block)) {
        reasons.push('declares `environment: production` and mutates production');
      }
      for (const push of pushes) {
        reasons.push(
          `pushes ${push.name}:${push.tag}, which platform/k8s/apps/${push.app} follows ` +
            'under an ArgoCD Application with automated sync',
        );
      }
      if (reasons.length > 0) found.push({ workflow: relative, job: name, block, reasons });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('Production UI Promotion Policy - the input is every tracked workflow', () => {
  const enumerated = new Set(trackedWorkflowPaths());
  assert.ok(enumerated.size > 0, 'no tracked workflow files were enumerated');

  // Re-derived from git with a pathspec of its own, so narrowing
  // WORKFLOW_PATHSPECS or filtering a file out of the enumeration is a failure
  // here rather than a quiet reduction in what this control can see.
  const mustBePoliced = [
    ...gitLsFiles(['.gitea/workflows']),
    ...gitLsFiles(['ventures']).filter((entry) => entry.includes('.github/workflows/')),
  ].filter((entry) => /\.ya?ml$/.test(entry));

  assert.ok(mustBePoliced.length > 0, 'no tracked workflow files found to police');
  for (const relative of mustBePoliced) {
    assert.ok(
      enumerated.has(relative),
      `${relative} is a tracked workflow file that this control does not read`,
    );
  }
});

test('Production UI Promotion Policy - the cluster manifests are readable', () => {
  const autoSynced = autoSyncedAppDirectories();
  assert.ok(
    autoSynced.size > 0,
    'no auto-synced ArgoCD Application was found; the manifest reader is broken and ' +
      'every mutable-tag promotion would be invisible',
  );
  const floating = floatingProductionImages();
  assert.ok(
    floating.size > 0,
    'no auto-synced app resolves to a mutable tag; if that is genuinely true this ' +
      'assertion should be replaced by the digest contract, not deleted',
  );
});

test('Production UI Promotion Policy - promotion jobs are found where they are declared', () => {
  const promotions = promotionJobs();

  // A workflow that declares the release-exception dispatch inputs was written
  // to promote behind the gate. If classification finds no promoting job in one
  // of them, classification has broken and every assertion below it is vacuous.
  const declaresException = trackedWorkflowPaths().filter((relative) =>
    /^\s+quality_exception:\s*$/m.test(readRepoFile(relative)),
  );
  assert.ok(
    declaresException.length > 0,
    'no workflow declares a quality_exception input; the promotion policy has no subject',
  );
  for (const relative of declaresException) {
    assert.ok(
      promotions.some((entry) => entry.workflow === relative),
      `${relative} declares the release-exception inputs but no job in it was classified ` +
        'as a promotion',
    );
  }
});

test('Production UI Promotion Policy - missing browser gates fail closed', () => {
  const promotions = promotionJobs();
  assert.ok(promotions.length > 0, 'no production promotion job was classified');

  for (const entry of promotions) {
    const where = `${entry.workflow} ${entry.job}`;
    const { block } = entry;

    assert.match(
      block,
      /github\.event_name == 'workflow_dispatch'/,
      `${where} ${entry.reasons[0]}, so it must not run automatically while its ` +
        'candidate browser gate is missing',
    );
    assert.match(
      block,
      /github\.ref == 'refs\/heads\/main'/,
      `${where} must reject production dispatches from feature branches`,
    );
    assert.match(
      block,
      /inputs\.quality_exception == 'APPROVED'/,
      `${where} must require explicit owner exception approval`,
    );
    assert.match(
      block,
      /inputs\.exception_issue != ''/,
      `${where} must require a tracked exception issue`,
    );
    assert.match(
      block,
      /inputs\.exception_evidence != ''/,
      `${where} must require review, exploratory test and rollback evidence`,
    );
    assert.match(
      block,
      /inputs\.exception_expires != ''/,
      `${where} must require a bounded expiry`,
    );

    const steps = stepsOf(block);
    assert.ok(steps.length > 0, `${where} has no parseable steps`);

    // Keyed on the script the step runs, not on a name, so a rename cannot move
    // the validation out of view of this check.
    const validateAt = steps.findIndex((step) =>
      /scripts\/ci\/validate-release-exception\.sh/.test(step.text),
    );
    assert.notEqual(
      validateAt,
      -1,
      `${where} must run scripts/ci/validate-release-exception.sh before it promotes`,
    );

    // The name is a separate contract: it is what a reviewer greps for in a run
    // log, and every promoting job in the repository uses it.
    assert.equal(
      steps[validateAt].name,
      'Validate the bounded release exception',
      `${where} must name its validation step "Validate the bounded release exception"`,
    );

    const privilegedAt = steps.findIndex((step) => mutatesProduction(step.text));
    assert.notEqual(
      privilegedAt,
      -1,
      `${where} was classified as a promotion but no step in it mutates production; ` +
        'the classifier and the step scanner disagree',
    );
    assert.ok(
      validateAt < privilegedAt,
      `${where} must validate the bounded release exception before its first ` +
        `privileged step ("${steps[privilegedAt].name}"), and validation is step ` +
        `${validateAt} against privileged step ${privilegedAt}`,
    );

    // Every step, not one named step. The old check read only the validation
    // step, so an injection in the step that actually held the cluster
    // credentials was not looked at.
    for (const step of steps) {
      assert.doesNotMatch(
        runBodyOf(step.text),
        SHELL_INTERPOLATION,
        `${where} step "${step.name}" must pass dispatch input through env, not shell source`,
      );
    }
  }
});
