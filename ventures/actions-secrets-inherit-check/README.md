# Actions secrets: inherit Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/actions-secrets-inherit-check/>

A free tool that scans GitHub Actions workflow files for two documented
`secrets: inherit` risks on a reusable-workflow call:

1. **`secrets-inherit-external-workflow`** — `secrets: inherit` on a job
   whose `uses:` calls a reusable workflow hosted in a *different*
   repository (`uses: OWNER/REPO/.github/workflows/file.yml@ref`, not a
   local `./…` path). Every secret this workflow can see is now reachable
   by whatever code lives at that other repository's ref — a compromised
   account, a force-pushed branch, or simply a maintainer decision at that
   other repository becomes a way to walk off with your secrets.
2. **`secrets-inherit-untrusted-trigger`** — `secrets: inherit` on a job
   reachable from a `pull_request_target` or `workflow_run` trigger, which
   runs with the base repository's context even though a stranger's fork
   raised the event. The fork-reachable job gets the entire secret set, not
   just the handful it might actually need.

GitHub's own documentation names `secrets: inherit` as something to use
with caution; this tool flags the two shapes where that caution most
concretely pays off. Both are checked independently — a call can trip
either, both, or neither.

**What it is not:** a security audit, a compliance attestation, or a
guarantee that a workflow is safe. It answers one narrow question for each
finding — does this line match one of two well-documented patterns — and it
makes no claim about a workflow's overall security.

## Why this exists

By default, a reusable-workflow call receives no secrets at all — the
caller names each one explicitly. `secrets: inherit` is the shortcut that
passes the whole set, and nothing in a workflow file makes that shortcut
look any different from the safe case: same one line, whether the called
workflow is a trusted local file or a third-party repository, and whether
the job runs on `push` or on a fork-triggered `pull_request_target`. This
portfolio's other `actions-*` checkers already cover an unpinned `uses:`
ref (`pinned-actions-check`), an overbroad `GITHUB_TOKEN` grant
(`actions-permissions-check`), and a secret leaking into a log
(`actions-secret-leak-check`) — none of them read `secrets: inherit` at
all.

## Why there is no automatic remediation

Privacy-first, on purpose: nothing this tool does ever leaves your device,
and it makes no network calls of its own. It flags the line and explains
the fix (name the specific secrets instead of inheriting all of them, pin
an external call to a commit SHA, or narrow a fork-reachable job's secret
set) — applying that fix is left to you.

## Try it without installing anything

[`index.html`](index.html) reads the same classification logic in a
browser page. Paste the contents of one or more files from
`.github/workflows/` and get every finding, each with its fix — nothing is
uploaded, and the page itself makes no network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-risk` into your own CI to block a newly-added
finding before it merges.

## Disclaimers

This tool checks for two specific, well-documented `secrets: inherit`
patterns. It does **not** tell you whether a workflow is secure overall,
and a clean scan is not a security or compliance claim about your
repository. It does not evaluate whether the called workflow is actually
trustworthy, and it does not follow a local reusable workflow to see what
it in turn calls. Verify its output before relying on it, the same as any
free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events in `localStorage` only —
never transmitted, never tied to a repository, a workflow, or a token. Do
Not Track and Global Privacy Control are honoured, and a button on the page
turns it off entirely. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py` and asserts the browser port produces byte-identical findings on
the same fixture, so the CLI and the page can never silently disagree about
what a line means — following `actions-cache-poisoning-check/classify.test.mjs`'s
discipline.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like [`actions-secret-leak-check`](../actions-secret-leak-check/),
[`actions-cache-poisoning-check`](../actions-cache-poisoning-check/), and
[`pinned-actions-check`](../pinned-actions-check/), this is a direct
graduation of an already-obvious, low-risk dev-tool idea. No external user
contact has happened yet — that is the next, non-code step (see
`kill_criteria` in `VENTURE.yaml`).
