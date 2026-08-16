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
 * A provider API key must not sit in the environment of a step that runs an
 * agent with its confirmation gates disabled.
 *
 * On 2026-08-16, `ventures/local-site-studio/.github/workflows/claude-scheduled.yml`
 * declared `ANTHROPIC_API_KEY` in the `env:` of the step whose command is
 * `claude -p --dangerously-skip-permissions --permission-mode bypassPermissions`,
 * and the `unset` meant to remove it ran only inside
 * `if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]`. On the API-key fallback path — the
 * one the file's own header documented as supported — the key was live in a
 * process explicitly told not to ask before doing anything. The same key, plus
 * two more, went to a third-party agent action in `opencode-scheduled.yml`,
 * where no `unset` is even possible because the step body is somebody else's
 * code.
 *
 * Nothing in this repository failed on either.
 *
 * `scripts/ci/audit_exceptions.py` finds the bypass flags and requires an
 * entry in `platform/exception-register.yaml`, but it reads flags and never
 * looks at what the step is holding. `scripts/security-scan.sh` greps for
 * hardcoded credential *literals* — `AWS_SECRET_ACCESS_KEY=`, private-key
 * headers — and a `${{ secrets.X }}` reference is not one. `EXC-013` did
 * describe the exposure exactly, in prose, and from 2026-08-06 carried a
 * machine-checked claim confirming the unset was conditional; but a claim that
 * asserts the exposure is *recorded* is not a control that refuses it, and it
 * would have gone on passing for as long as the register kept describing it
 * accurately.
 *
 * So this file is the refusal. It is deliberately not scoped to the three
 * workflows the register names: the failure mode is a *new* scheduled agent
 * arriving with a key in its env, and a control that reads a hardcoded list of
 * today's files cannot see that.
 *
 * # What counts as a provider API key
 *
 * A name ending in `API_KEY` whose value comes from `secrets.`. That is
 * account-level, long-lived, and usable outside this repository, which is what
 * makes it worse than the run's own credentials.
 *
 * `CLAUDE_CODE_OAUTH_TOKEN`, `GH_TOKEN` and friends are deliberately out of
 * scope. Some credential has to be in the step or the agent cannot run, so a
 * rule covering every token would have no satisfiable state and would be
 * switched off within the week. The narrow rule has one: the Gemini, Grok and
 * Codex workflows already run on a seeded OAuth credential file with nothing
 * in `env:` at all, and Claude and OpenCode were moved onto that shape on
 * 2026-08-16.
 *
 * # What counts as a bypassed step
 *
 * Either an unmistakable bypass flag (`--dangerously-skip-permissions`,
 * `bypassPermissions`, `--yolo`, `--always-approve`, `--ask-for-approval never`,
 * `danger-full-access`), or one of the ambiguous ones (`--force`, `--trust`)
 * in a step that also invokes an agent CLI — `docker rm --force` is not an
 * agent bypassing a permission prompt — or a `uses:` naming a third-party
 * action that runs an agent unattended, where there is no command line to read
 * and no shell in which to unset anything.
 *
 * # The remaining sites
 *
 * `KNOWN_EXPOSURES` is compared with `deepEqual`, not treated as a skip list.
 * An entry that is fixed turns this red exactly as an entry that is added
 * does, so the list can only be changed deliberately and in the same commit as
 * the code. Both entries are `cursor-agent`, whose only credential is
 * `CURSOR_API_KEY` — the step exits 1 without it, so removing it stops the
 * workflow rather than hardening it. That is a stated position, and the way to
 * clear it is to give the Cursor CLI a seeded auth file the way the other five
 * agents have one.
 */

/** The two places this repository keeps workflows. Same roots as `workflow-action-pinning.test.mjs`. */
const WORKFLOW_PATHSPECS = ['.gitea/workflows', 'ventures'];

/**
 * Bypass markers that cannot mean anything else. `--sandbox danger-full-access`
 * and `--ask-for-approval never` are Codex's spelling of the same decision.
 */
const UNAMBIGUOUS_BYPASS = [
  /--dangerously-skip-permissions\b/,
  /bypassPermissions\b/,
  /--yolo\b/,
  /--always-approve\b/,
  /--ask-for-approval\s+never\b/,
  /danger-full-access\b/,
];

/**
 * Flags that mean "do not ask" to an agent CLI and something else entirely to
 * `docker rm` or `git switch`. Counted only alongside an agent invocation.
 */
const AGENT_SCOPED_BYPASS = [/(?:^|[\s(])--force(?=[\s)"']|$)/m, /(?:^|[\s(])--trust(?=[\s)"']|$)/m];

/** Agent CLIs this repository actually runs unattended. */
const AGENT_CLI = /\b(?:claude|cursor-agent|codex|gemini|grok|opencode|aider|AGENT_BIN)\b/;

/**
 * Third-party actions that run an agent for us. There is no command line here
 * to read a flag from and no shell to unset a variable in, so holding a
 * provider key is the whole of the exposure.
 */
const AGENT_ACTIONS = [/anomalyco\/opencode/, /anthropics\/claude-code-action/, /google-github-actions\/run-gemini-cli/];

/** A provider API key sourced from the secret store. */
const PROVIDER_KEY_ENV = /^([A-Z][A-Z0-9_]*API_KEY)\s*:\s*\$\{\{\s*secrets\./;

/**
 * Every site this repository has accepted, as `file :: step :: KEY`.
 * A ceiling, not an allowlist — see the header.
 */
const KNOWN_EXPOSURES = [
  'ventures/local-site-studio/.github/workflows/cursor-agent-grok.yml :: Run Cursor Agent :: CURSOR_API_KEY',
  'ventures/local-site-studio/.github/workflows/cursor-scheduled.yml :: Run Cursor Agent (headless) :: CURSOR_API_KEY',
];

/** Every tracked workflow file, discovered from the git index rather than a walk. */
function trackedWorkflowPaths() {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...WORKFLOW_PATHSPECS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  return listed
    .split('\0')
    .filter(Boolean)
    .filter((entry) => entry.startsWith('.gitea/workflows/') || entry.includes('.github/workflows/'))
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .sort();
}

function workflowFiles() {
  return trackedWorkflowPaths().map((relative) => ({
    relative,
    text: fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'),
  }));
}

const indentOf = (line) => line.length - line.trimStart().length;

/** The keys that can open a step in a `steps:` sequence. */
const STEP_OPENER = /^(\s*)-\s+(name|uses|run|id|shell|env|with|if|working-directory|continue-on-error|timeout-minutes):/;

/**
 * Split a workflow into its steps.
 *
 * Hand-rolled rather than pulled from a YAML library on purpose: `platform/ci`
 * has no dependencies, and every other workflow control here reads the text.
 * The unit of the rule is the step — `env:` is per-step and so is the command,
 * and a file-level grep cannot tell a key in the seeding step from a key in the
 * bypassed one, which is the exact distinction `EXC-013` had to draw in prose.
 */
export function parseSteps(text) {
  const lines = text.split('\n');
  const steps = [];
  let current = null;

  const close = () => {
    if (current) steps.push(current);
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const opener = STEP_OPENER.exec(line);

    if (opener) {
      const indent = opener[1].length;
      // A sibling step, or the first one. A deeper `- key:` belongs to the step
      // that is open (a nested list inside `with:`), so only same-or-shallower
      // openers close it.
      if (!current || indent <= current.indent) {
        close();
        current = { indent, startLine: index + 1, lines: [line] };
        continue;
      }
    }

    if (!current) continue;

    // A non-blank line at or left of the step's own indentation is the next
    // job/key, not part of this step.
    if (line.trim() !== '' && indentOf(line) <= current.indent) {
      close();
      continue;
    }
    current.lines.push(line);
  }
  close();

  return steps.map((step) => {
    const body = step.lines.join('\n');
    const name = /^\s*(?:-\s+)?name:\s*(.+?)\s*$/m.exec(body);
    const uses = /^\s*(?:-\s+)?uses:\s*(\S+)/m.exec(body);
    return {
      startLine: step.startLine,
      text: body,
      name: name ? name[1].replace(/^["']|["']$/g, '') : `step at line ${step.startLine}`,
      uses: uses ? uses[1] : null,
    };
  });
}

/**
 * The provider API keys a step declares in its own `env:` block, with the line
 * each is on. Only the `env:` block: a key named in a shell comparison, or in
 * an error message telling the operator which secret to set, is not a key the
 * step is holding.
 */
export function providerKeysInEnv(stepText) {
  const lines = stepText.split('\n');
  const found = [];
  let envIndent = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;

    if (envIndent !== null && indentOf(line) <= envIndent) envIndent = null;

    const opensEnv = /^(\s*)(?:-\s+)?env:\s*$/.exec(line);
    if (opensEnv) {
      // `- env:` puts the block's entries two columns right of the dash.
      envIndent = line.indexOf('env:');
      continue;
    }

    if (envIndent === null) continue;
    const match = PROVIDER_KEY_ENV.exec(line.trim());
    if (match) found.push({ key: match[1], line: index });
  }
  return found;
}

/** Why this step is unattended-with-gates-off, or null when it is not. */
export function bypassReason(step) {
  const { text, uses } = step;

  for (const pattern of UNAMBIGUOUS_BYPASS) {
    const hit = pattern.exec(text);
    if (hit) return `disables its confirmation gates (${hit[0].trim()})`;
  }

  if (AGENT_CLI.test(text)) {
    for (const pattern of AGENT_SCOPED_BYPASS) {
      const hit = pattern.exec(text);
      if (hit) return `runs an agent with ${hit[0].trim()}`;
    }
  }

  if (uses && AGENT_ACTIONS.some((pattern) => pattern.test(uses))) {
    return `hands control to the unattended agent action ${uses.split('@')[0]}`;
  }

  return null;
}

/**
 * `unset KEY` at the top level of the step's shell body, outside every `if`.
 * The whole defect this file exists for was an `unset` that was real, correct,
 * and inside an `if`, so presence is not the question — reachability is.
 */
export function unsetUnconditionally(stepText, key) {
  let depth = 0;
  for (const raw of stepText.split('\n')) {
    const line = raw.trim();
    if (/^(if|case)\b/.test(line)) depth += 1;
    else if (/^(fi|esac)\b/.test(line)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && new RegExp(`^unset\\s+(\\S+\\s+)*${key}\\b`).test(line)) return true;
  }
  return false;
}

/** `file :: step :: KEY` for every provider key left live in a bypassed step. */
export function exposures(relative, text) {
  const found = [];
  for (const step of parseSteps(text)) {
    const reason = bypassReason(step);
    if (!reason) continue;
    for (const { key } of providerKeysInEnv(step.text)) {
      if (unsetUnconditionally(step.text, key)) continue;
      found.push(`${relative} :: ${step.name} :: ${key}`);
    }
  }
  return found;
}

function allExposures() {
  return workflowFiles()
    .flatMap(({ relative, text }) => exposures(relative, text))
    .sort();
}

test('Agent credentials - no provider API key is live in a permission-bypassed step', () => {
  const found = allExposures();
  assert.deepEqual(
    found,
    KNOWN_EXPOSURES,
    'provider API keys reaching an agent that has been told not to ask:\n' +
      `  found:\n${found.map((line) => `    - ${line}`).join('\n') || '    (none)'}\n` +
      `  accepted:\n${KNOWN_EXPOSURES.map((line) => `    - ${line}`).join('\n')}\n` +
      'A new line here is an account-level credential readable by an unattended agent: move the ' +
      'workflow onto a seeded OAuth credential file, as the Gemini, Grok and Codex ones already are. ' +
      'A line that has DISAPPEARED means it was fixed — delete it from KNOWN_EXPOSURES in the same commit.'
  );
});

test('Agent credentials - the sweep reads every workflow, not an empty directory', () => {
  const files = workflowFiles();
  assert.ok(files.length >= 5, `expected tracked workflow files, found ${files.length}`);

  // Both halves of the subject. The venture workflows are where every agent
  // runs; a narrowing to `.gitea/workflows` alone would leave this green over
  // nothing while reporting a pass.
  for (const root of ['.gitea/workflows/', 'ventures/']) {
    assert.ok(
      files.some(({ relative }) => relative.startsWith(root)),
      `no workflow under '${root}' reached the sweep — the collection narrowed`
    );
  }

  // The parser has to actually find steps, and the detector has to actually
  // find the bypassed ones. Either returning nothing would make the assertion
  // above pass over an empty set.
  const steps = files.flatMap(({ text }) => parseSteps(text));
  assert.ok(steps.length >= 50, `expected the step parser to find steps, found ${steps.length}`);
  const bypassed = steps.filter((step) => bypassReason(step));
  assert.ok(
    bypassed.length >= 5,
    `expected the bypass detector to find the unattended agent steps, found ${bypassed.length}`
  );
  const withKeys = steps.filter((step) => providerKeysInEnv(step.text).length > 0);
  assert.ok(
    withKeys.length >= 2,
    `expected the env reader to find provider keys somewhere, found ${withKeys.length}`
  );
});

test('Agent credentials - a glob that matches nothing fails rather than passes', () => {
  // The vacuity this repository keeps rediscovering: an enumeration that
  // resolves to zero files is a green gate over no evidence.
  assert.equal(trackedWorkflowPaths().filter((entry) => entry.endsWith('.yml')).length > 0, true);
  assert.deepEqual(
    workflowFiles()
      .filter(({ relative }) => relative === 'this/path/does/not/exist.yml')
      .flatMap(({ relative, text }) => exposures(relative, text)),
    [],
    'sanity: an empty file set yields no findings, which is why the count assertions above exist'
  );
  assert.throws(
    () => {
      const empty = [];
      assert.ok(empty.length >= 5, 'an empty workflow set must not satisfy the sweep');
    },
    /must not satisfy/,
    'the anti-vacuity assertion is a real assertion'
  );
});

test('Agent credentials - the detector still detects', () => {
  const bypassed = [
    '      - name: Run Claude Code',
    '        env:',
    '          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}',
    '        run: |',
    '          claude -p --dangerously-skip-permissions "$PROMPT"',
    '',
  ].join('\n');
  assert.deepEqual(
    exposures('w.yml', bypassed),
    ['w.yml :: Run Claude Code :: ANTHROPIC_API_KEY'],
    'a key in the env of a step that skips permission checks is the whole subject'
  );

  // The exact shape that shipped: a real unset, correct, inside an `if`.
  const conditionalUnset = [
    '      - name: Run Claude Code',
    '        env:',
    '          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
    '          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}',
    '        run: |',
    '          if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then',
    '            unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN || true',
    '          else',
    '            unset ANTHROPIC_AUTH_TOKEN || true',
    '          fi',
    '          claude -p --permission-mode bypassPermissions "$PROMPT"',
    '',
  ].join('\n');
  assert.deepEqual(
    exposures('w.yml', conditionalUnset),
    ['w.yml :: Run Claude Code :: ANTHROPIC_API_KEY'],
    'an unset that only runs on one auth path leaves the key live on the other'
  );

  // The shape it was changed to, and the reason the check is on reachability
  // rather than presence: the two fixtures differ only by the `if`.
  assert.deepEqual(
    exposures(
      'w.yml',
      [
        '      - name: Run Claude Code',
        '        env:',
        '          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}',
        '        run: |',
        '          unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN || true',
        '          claude -p --permission-mode bypassPermissions "$PROMPT"',
        '',
      ].join('\n')
    ),
    [],
    'an unconditional unset clears the key before the agent starts'
  );
  assert.ok(
    conditionalUnset.includes('unset ANTHROPIC_API_KEY'),
    'the conditional fixture does contain the unset — presence is not what distinguishes them'
  );

  // A key in a step that is not bypassed is not this control's subject.
  assert.deepEqual(
    exposures(
      'w.yml',
      [
        '      - name: Seed credentials',
        '        env:',
        '          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}',
        '        run: |',
        '          echo "checking"',
        '',
      ].join('\n')
    ),
    [],
    'the seeding step runs no agent'
  );

  // `--force` on a plain shell command is not an agent bypass.
  assert.deepEqual(
    exposures(
      'w.yml',
      [
        '      - name: Smoke test',
        '        env:',
        '          SOME_API_KEY: ${{ secrets.SOME_API_KEY }}',
        '        run: |',
        '          docker rm --force smoke >/dev/null',
        '',
      ].join('\n')
    ),
    [],
    '`docker rm --force` is not an agent skipping a confirmation prompt'
  );

  // A third-party agent action has no shell to unset anything in.
  assert.deepEqual(
    exposures(
      'w.yml',
      [
        '      - name: Run OpenCode',
        '        uses: anomalyco/opencode/github@' + '0'.repeat(40) + ' # v1.18.13',
        '        env:',
        '          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}',
        '        with:',
        '          model: opencode/deepseek-v4-flash',
        '',
      ].join('\n')
    ),
    ['w.yml :: Run OpenCode :: ANTHROPIC_API_KEY'],
    'a key handed to a third-party agent action cannot be unset by anyone'
  );

  // The run credential is out of scope on purpose; see the header.
  assert.deepEqual(
    exposures(
      'w.yml',
      [
        '      - name: Run Claude Code',
        '        env:',
        '          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
        '          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
        '        run: |',
        '          claude -p --dangerously-skip-permissions "$PROMPT"',
        '',
      ].join('\n')
    ),
    [],
    'the agent needs one credential; the rule is about the account-level API keys beside it'
  );
});

test('Agent credentials - the step parser separates steps', () => {
  const workflow = [
    'jobs:',
    '  build:',
    '    steps:',
    '      - name: One',
    '        env:',
    '          A_API_KEY: ${{ secrets.A_API_KEY }}',
    '        run: echo one',
    '',
    '      - name: Two',
    '        run: |',
    '          claude -p --dangerously-skip-permissions "hi"',
    '  other:',
    '    runs-on: ubuntu-latest',
    '',
  ].join('\n');
  const steps = parseSteps(workflow);
  assert.deepEqual(
    steps.map((step) => step.name),
    ['One', 'Two'],
    'two steps, in order'
  );
  assert.deepEqual(
    providerKeysInEnv(steps[0].text).map(({ key }) => key),
    ['A_API_KEY'],
    "the first step's env is the first step's"
  );
  assert.deepEqual(providerKeysInEnv(steps[1].text), [], 'the key does not leak into the next step');
  assert.equal(bypassReason(steps[0]), null, 'a plain echo bypasses nothing');
  assert.ok(bypassReason(steps[1]), 'the second step is the bypassed one');
  assert.deepEqual(exposures('w.yml', workflow), [], 'and neither step holds a key it should not');
});
