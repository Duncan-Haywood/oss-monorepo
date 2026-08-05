// A `docker push` of a tag nothing in the job ever built.
//
// `.gitea/workflows/homepage-ci.yml` job `container` did this. It built with
// `docker/setup-buildx-action` followed by `docker/build-push-action`:
//
//     push: false
//     tags: git.marisstella.dev/giteaadmin/marisstella-homepage:${{ github.sha }}
//
// with no `load: true` and no `outputs:`. setup-buildx-action's default driver
// is `docker-container`, which is not the local docker image store; with no
// output specified BuildKit exports the result to the build cache and says so
// ("No output specified with docker-container driver. Build result will only be
// stored in build cache."). The tag above therefore existed nowhere the next
// step could reach. The next step, "Publish immutable main image", was
// `docker login && docker push "$IMAGE"` — a push with nothing to push.
//
// So the homepage had no immutable `:${sha}` candidate. That artifact is what
// the release comment in the `deploy` job promises is promoted "byte-for-byte",
// what `docs/QUALITY-ENGINEERING.md`'s second browser run is supposed to be
// pointed at through `PLAYWRIGHT_BASE_URL`, and what
// `scripts/ci/image_release_path.py` counts as this venture's build path —
// because its `BUILD_DIRECTIVE` accepts the mere presence of
// `docker/build-push-action` as evidence that something produces the image.
// Every one of those rested on a tag that was never created.
//
// This is the repository's "a publish that cannot publish" class, and it is
// generalizable in a way the specific fix is not: the shape of the defect is a
// job that pushes a reference no step in the same job put into the local image
// store. So that is what is asserted, over every tracked workflow.
//
// Declared scope, stated rather than implied:
//
//   * The rule is about `docker push`, which requires the reference to be in
//     the local store. `docker buildx imagetools create` is a registry-side
//     operation that needs no local image and is deliberately not covered here;
//     `production-ui-promotion-policy.test.mjs` is the control that watches it
//     as a promotion.
//   * Production of a local image means `docker build` (which loads by
//     definition), `docker buildx build` with `--load` or an `--output` of
//     `type=docker`, `docker/build-push-action` with `load: true` or the same
//     output, `docker tag`, `docker pull`, or `docker load`. A
//     build-push-action with `push: true` publishes from the builder without
//     ever populating the local store, so it does not satisfy a later
//     `docker push` — which is exactly the confusion that produced the defect.
//   * References are resolved through the step's and the job's `env:` maps,
//     because every publish step in this repository writes `docker push
//     "$IMAGE"`. A reference this file cannot resolve is a failure rather than
//     a skip: an unresolvable reference is how the rule would be evaded.
//
// Vacuity: the subjects are re-derived independently in the first test. Every
// tracked workflow whose text contains `docker push` must contribute at least
// one resolved push, and there must be at least four pushes in total, so a
// parser regression or a narrowed pathspec fails here instead of quietly
// turning the rule below into an assertion about nothing.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

/** The two places this repository keeps workflows. */
const WORKFLOW_PATHSPECS = ['.gitea/workflows', 'ventures'];

/** Tracked workflow paths, from the git index rather than a directory walk. */
function trackedWorkflowPaths() {
  return execFileSync('git', ['ls-files', '-z', '--', ...WORKFLOW_PATHSPECS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
    env: GIT_ENV,
  })
    .split('\0')
    .filter(Boolean)
    .filter(
      (entry) => entry.startsWith('.gitea/workflows/') || entry.includes('.github/workflows/'),
    )
    .filter((entry) => /\.ya?ml$/.test(entry))
    .sort();
}

const readRepoFile = (relative) => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');

// ---------------------------------------------------------------------------
// Workflow structure
// ---------------------------------------------------------------------------

/** Every job in a workflow, as `{ name, block }`. */
function jobsOf(source) {
  const lines = source.split('\n');
  const jobsAt = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (jobsAt === -1) return [];

  const jobs = [];
  let current = null;
  for (let index = jobsAt + 1; index < lines.length; index += 1) {
    const line = lines[index];
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
    if (line.trim() !== '' && !/^ {6}/.test(line)) break;
    if (current) current.lines.push(line);
  }

  return steps.map(({ lines: body }, index) => {
    const text = body.join('\n');
    const named = /^ {6}- (?:name|uses):\s*(.+?)\s*$/.exec(body[0]);
    return { index, text, name: named ? named[1] : '(unnamed step)' };
  });
}

/** The part of a job block above `steps:`, where job-level `env:` lives. */
function jobPreamble(block) {
  const lines = block.split('\n');
  const stepsAt = lines.findIndex((line) => /^ {4}steps:\s*(?:#.*)?$/.test(line));
  return (stepsAt === -1 ? lines : lines.slice(0, stepsAt)).join('\n');
}

const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/s, '$2');

/**
 * `${{ github.sha }}` collapsed to `${{github.sha}}`.
 *
 * Every reference in this repository is a tag ending in one of these
 * expressions, and the spaces inside it are the only whitespace in an image
 * reference. Shell-splitting on whitespace without this truncates
 * `...:${{ github.sha }}` to `...:${{`, which is how a scan silently stops
 * matching the very references it exists to compare.
 */
const canonical = (value) =>
  value.replace(/\$\{\{\s*([^}]*?)\s*\}\}/g, (all, inner) => `\${{${inner.replace(/\s+/g, '')}}}`);

/**
 * The `env:` mapping declared directly in a block, as `NAME -> value`.
 *
 * Only the first indentation level under `env:` is read, so a nested
 * `valueFrom:` cannot be mistaken for a literal.
 */
function envOf(text) {
  const lines = text.split('\n');
  const env = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const opener = /^(\s*)env:\s*(?:#.*)?$/.exec(lines[index]);
    if (!opener) continue;
    const outer = opener[1].length;
    let entryIndent = null;
    for (let inner = index + 1; inner < lines.length; inner += 1) {
      const line = lines[inner];
      if (line.trim() === '') continue;
      const indent = /^\s*/.exec(line)[0].length;
      if (indent <= outer) break;
      if (entryIndent === null) entryIndent = indent;
      if (indent !== entryIndent) continue;
      const entry = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
      if (entry) env.set(entry[1], canonical(unquote(entry[2])));
    }
  }
  return env;
}

/**
 * The shell a step runs, normalized to one command per line.
 *
 * Both block scalar styles are in use in this repository and they normalize
 * differently: `run: |` keeps its line breaks, `run: >-` folds them into
 * spaces. pairwise-ci.yml's build is a folded scalar and print-atelier's is a
 * literal one with backslash continuations, so getting this wrong would hide
 * either venture's `--tag` from the scan.
 */
function runBodyOf(stepText) {
  const lines = stepText.split('\n');
  // `- run:` as the first line of a step is as common as `run:` on its own, so
  // the optional list dash is part of the pattern rather than an afterthought.
  const runAt = lines.findIndex((line) => /^\s*-?\s*run:/.test(line));
  if (runAt === -1) return '';

  const opener = /^(\s*-?\s*)run:\s*(.*?)\s*$/.exec(lines[runAt]);
  const indent = opener[1].length;
  const inline = opener[2];

  const style = /^[|>][+-]?$/.test(inline) ? inline[0] : null;
  if (style === null) return canonical(inline);

  const body = [];
  for (let index = runAt + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (/^\s*/.exec(line)[0].length <= indent) break;
    body.push(line.trim());
  }
  return canonical(style === '>' ? body.join(' ') : body.join('\n'));
}

/** Shell comments removed, backslash continuations joined. */
function normalizeShell(script) {
  return script
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

/** `$NAME` and `${NAME}` replaced from the supplied scopes, innermost first. */
function expand(text, ...scopes) {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all, a, b) => {
    const name = a ?? b;
    for (const scope of scopes) {
      if (scope.has(name)) return scope.get(name);
    }
    return all;
  });
}

// ---------------------------------------------------------------------------
// What a step does to the local image store
// ---------------------------------------------------------------------------

/** `--tag X` / `-t X` references on one command line. */
function tagArguments(line) {
  return [...line.matchAll(/(?:--tag[= ]|(?<![\w-])-t\s+)(\S+)/g)].map((match) =>
    unquote(match[1]),
  );
}

const LOADS_LOCALLY = /(?:^|\s)(?:--load\b|--output[= ]\S*type=docker|-o\s+\S*type=docker)/;

/**
 * The lines a `docker/build-push-action` step contributes, as if it were shell.
 *
 * `load: true` (or an `outputs:` of `type=docker`) is the only configuration
 * that puts the result where a later `docker push` can find it. `push: true`
 * publishes straight from the builder and leaves the local store empty, so it
 * is deliberately not translated into a local build here.
 */
function buildPushActionLines(stepText) {
  if (!/^\s+-?\s*uses:\s*docker\/build-push-action@/m.test(stepText)) return [];
  const loads =
    /^\s+load:\s*true\s*$/m.test(stepText) || /^\s+outputs:[^\n]*type=docker/m.test(stepText);
  if (!loads) return [];

  const tagsAt = stepText.split('\n').findIndex((line) => /^\s+tags:/.test(line));
  if (tagsAt === -1) return [];
  const lines = stepText.split('\n');
  const opener = /^(\s*)tags:\s*(.*?)\s*$/.exec(lines[tagsAt]);
  const values = [];
  if (opener[2] !== '' && !/^[|>][+-]?$/.test(opener[2])) {
    values.push(...opener[2].split(',').map(unquote));
  } else {
    for (let index = tagsAt + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim() === '') continue;
      if (/^\s*/.exec(line)[0].length <= opener[1].length) break;
      values.push(unquote(line.trim().replace(/^-\s*/, '')));
    }
  }
  return values.filter(Boolean).map((tag) => `docker build --load --tag ${canonical(tag)} .`);
}

/**
 * Ordered `{ kind, reference }` events for a job: what enters the local image
 * store, and what is pushed out of it, in the order the job would run them.
 */
function imageEventsOf(block) {
  const jobEnv = envOf(jobPreamble(block));
  const events = [];

  for (const step of stepsOf(block)) {
    const stepEnv = envOf(step.text);
    const script = normalizeShell(expand(runBodyOf(step.text), stepEnv, jobEnv));
    const synthetic = buildPushActionLines(step.text).map((line) =>
      expand(line, stepEnv, jobEnv),
    );

    for (const line of [...synthetic, ...script.split('\n')]) {
      if (/docker\s+(?:buildx\s+)?build\b/.test(line)) {
        const buildx = /docker\s+buildx\s+build\b/.test(line);
        if (!buildx || LOADS_LOCALLY.test(line)) {
          for (const reference of tagArguments(line)) {
            events.push({ kind: 'produces', reference, step: step.name });
          }
        }
      }
      const tagged = /docker\s+tag\s+(\S+)\s+(\S+)/.exec(line);
      if (tagged) {
        events.push({ kind: 'produces', reference: unquote(tagged[2]), step: step.name });
      }
      const pulled = /docker\s+pull\s+(\S+)/.exec(line);
      if (pulled) {
        events.push({ kind: 'produces', reference: unquote(pulled[1]), step: step.name });
      }
      if (/docker\s+load\b/.test(line)) {
        events.push({ kind: 'loads-unknown', reference: null, step: step.name });
      }
      for (const pushed of line.matchAll(/docker\s+push\s+(\S+)/g)) {
        events.push({ kind: 'pushes', reference: unquote(pushed[1]), step: step.name });
      }
    }
  }
  return events;
}

/** Every push in a workflow, with whether the same job produced it first. */
function pushAudit(source, workflow = '(inline)') {
  const audited = [];
  for (const { name, block } of jobsOf(source)) {
    const local = new Set();
    let opaqueLoad = false;
    for (const event of imageEventsOf(block)) {
      if (event.kind === 'produces') {
        local.add(event.reference);
        continue;
      }
      if (event.kind === 'loads-unknown') {
        opaqueLoad = true;
        continue;
      }
      audited.push({
        workflow,
        job: name,
        step: event.step,
        reference: event.reference,
        // A `${{ ... }}` workflow expression is a resolved reference: the runner
        // substitutes it identically on both the build side and the push side.
        // A surviving `$NAME` is not — it means an `env:` entry this scan could
        // not find, and comparing it to anything would be guesswork.
        resolved: !/\$(?!\{\{)/.test(event.reference),
        produced: local.has(event.reference) || opaqueLoad,
        producedBy: [...local],
      });
    }
  }
  return audited;
}

function repositoryPushes() {
  return trackedWorkflowPaths().flatMap((relative) =>
    pushAudit(readRepoFile(relative), relative),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('Image publish provenance - every workflow that pushes an image is read', () => {
  const pushes = repositoryPushes();

  // Re-derived from the file text with no parsing at all, so a regression in
  // `jobsOf`/`stepsOf`/`runBodyOf` fails here rather than emptying the rule.
  const workflowsWithPush = trackedWorkflowPaths().filter((relative) =>
    /docker\s+push\b/.test(readRepoFile(relative)),
  );
  assert.ok(
    workflowsWithPush.length > 0,
    'no tracked workflow contains `docker push`; this control has no subject',
  );

  const seen = new Set(pushes.map((entry) => entry.workflow));
  for (const relative of workflowsWithPush) {
    assert.ok(
      seen.has(relative),
      `${relative} contains \`docker push\` but the scan extracted no push from it — ` +
        'the workflow parser has broken and this control would assert nothing',
    );
  }

  assert.ok(
    pushes.length >= 4,
    `only ${pushes.length} image push(es) were found across ${workflowsWithPush.length} ` +
      'workflow(s). Four venture image workflows publish here (homepage, pairwise, ' +
      'print-atelier, local-site-studio); a count below four means the scan lost one.',
  );
});

test('Image publish provenance - every pushed reference is resolvable', () => {
  for (const entry of repositoryPushes()) {
    assert.ok(
      entry.resolved,
      `${entry.workflow} job \`${entry.job}\` step "${entry.step}" pushes ` +
        `\`${entry.reference}\`, which this control cannot resolve to a concrete ` +
        'reference. An unresolvable reference is how the provenance rule below gets ' +
        'evaded, so it fails rather than skipping: declare the reference in the ' +
        "step's or the job's `env:`.",
    );
  }
});

test('Image publish provenance - a job pushes only images it built locally', () => {
  for (const entry of repositoryPushes()) {
    assert.ok(
      entry.produced,
      `${entry.workflow} job \`${entry.job}\` step "${entry.step}" runs ` +
        `\`docker push ${entry.reference}\`, but no step in that job puts that ` +
        'reference in the local docker image store. `docker push` can only publish ' +
        'from the local store, so this pushes nothing and the tag is never created. ' +
        `The job produces: ${entry.producedBy.length ? entry.producedBy.join(', ') : '(nothing)'}. ` +
        'Build with `docker build --tag`, or `docker buildx build --load`, or give ' +
        'docker/build-push-action `load: true` — a `push: false` build on the ' +
        'default docker-container driver goes to the build cache and nowhere else.',
    );
  }
});

test('Image publish provenance - the provenance detector still detects', () => {
  const header = ['name: synthetic', 'jobs:', '  container:', '    runs-on: ubuntu-latest'];

  // The exact shape homepage-ci.yml had: buildx, push:false, no load, then a
  // separate `docker push` of the tag the action never materialised.
  const unbuilt = [
    ...header,
    '    steps:',
    '      - uses: docker/setup-buildx-action@0000000000000000000000000000000000000000 # v3',
    '      - uses: docker/build-push-action@0000000000000000000000000000000000000000 # v6',
    '        with:',
    '          push: false',
    '          tags: example.dev/app:abc123',
    '      - name: Publish',
    '        env:',
    '          IMAGE: example.dev/app:abc123',
    '        run: docker push "$IMAGE"',
  ].join('\n');
  const unbuiltAudit = pushAudit(unbuilt);
  assert.equal(unbuiltAudit.length, 1, 'the synthetic push was not extracted');
  assert.equal(
    unbuiltAudit[0].produced,
    false,
    'a `push: false` build-push-action with no `load: true` must not count as ' +
      'producing a local image; if it does, the defect this file exists for passes',
  );

  // `load: true` is the minimal repair, and must be recognised as one.
  const loaded = unbuilt.replace('          push: false', '          load: true');
  assert.equal(pushAudit(loaded)[0].produced, true, '`load: true` must satisfy the rule');

  // Plain `docker build` — what the repository actually does — likewise.
  const built = [
    ...header,
    '    steps:',
    '      - name: Build',
    '        env:',
    '          IMAGE: example.dev/app:abc123',
    '        run: docker build --file Dockerfile --tag "$IMAGE" .',
    '      - name: Publish',
    '        env:',
    '          IMAGE: example.dev/app:abc123',
    '        run: docker push "$IMAGE"',
  ].join('\n');
  assert.equal(pushAudit(built)[0].produced, true, '`docker build --tag` must satisfy the rule');

  // A folded scalar and a backslash continuation must both be read, because
  // pairwise-ci.yml uses the first and print-atelier-image.yml the second.
  const folded = [
    ...header,
    '    steps:',
    '      - name: Build',
    '        env:',
    '          IMAGE: example.dev/app:abc123',
    '        run: >-',
    '          docker build',
    '          --file Dockerfile',
    '          --tag "$IMAGE"',
    '          .',
    '      - name: Publish',
    '        env:',
    '          IMAGE: example.dev/app:abc123',
    '        run: docker push "$IMAGE"',
  ].join('\n');
  assert.equal(pushAudit(folded)[0].produced, true, 'a folded `run: >-` build must be read');

  const continued = [
    ...header,
    '    steps:',
    '      - name: Build',
    '        env:',
    '          IMAGE: example.dev/app:abc123',
    '        run: |',
    '          docker build \\',
    '            --file Dockerfile \\',
    '            --tag "$IMAGE" .',
    '      - name: Publish',
    '        env:',
    '          IMAGE: example.dev/app:abc123',
    '        run: docker push "$IMAGE"',
  ].join('\n');
  assert.equal(pushAudit(continued)[0].produced, true, 'a continued build line must be read');

  // A build in a *different* job does not make the push valid: the local image
  // store does not survive the runner.
  const otherJob = [
    'name: synthetic',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: docker build --tag example.dev/app:abc123 .',
    '  publish:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: docker push example.dev/app:abc123',
  ].join('\n');
  const crossJob = pushAudit(otherJob);
  assert.equal(crossJob.length, 1, 'the cross-job push was not extracted');
  assert.equal(crossJob[0].produced, false, 'a build in another job must not satisfy the rule');

  // Order matters within a job: pushing before the build is still pushing
  // nothing.
  const outOfOrder = [
    ...header,
    '    steps:',
    '      - run: docker push example.dev/app:abc123',
    '      - run: docker build --tag example.dev/app:abc123 .',
  ].join('\n');
  assert.equal(
    pushAudit(outOfOrder)[0].produced,
    false,
    'a push before the build that produces it must not satisfy the rule',
  );
});
