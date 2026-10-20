# Actions Artifact Poisoning Check

A free tool that scans GitHub Actions workflow files for two documented
"artifact poisoning" patterns in `workflow_run`-triggered jobs:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/actions-artifact-poisoning-check/

1. **An artifact is executed after being downloaded** — a `workflow_run` job
   downloads an artifact (`actions/download-artifact` or the third-party
   `dawidd6/action-download-artifact`) and a later step in the same job runs
   something that looks like it executes a file from disk (`chmod +x`,
   `./something`, or `bash`/`sh`/`source`/`python`/`node`/`eval`). The
   artifact's contents came from the fork-triggered run this workflow reacts
   to, not just its event payload, so executing anything from it hands that
   fork code execution in the base repository's privileged context.
2. **An unscoped artifact download** — a `download-artifact` step with no
   `name:` input, which pulls in every artifact the triggering run uploaded
   rather than one specific, expected one.

**What it is not:** a security audit, a compliance attestation, or a
guarantee that a `workflow_run` job is safe. It answers one narrow question
for each finding, and it makes no claim about a workflow's overall security.

## Why this exists

`workflow_run` is a documented, legitimate pattern for letting a privileged
workflow react to an unprivileged `pull_request` build without inheriting the
fork's ability to change what that workflow does. GitHub's own Actions
Security Lab, and independent research from Wiz, Legit Security and Orca
Security, document the risk this creates when the privileged handler trusts
the *contents* of what the fork-triggered run uploaded: it is the same
trigger-gate-plus-sink shape this portfolio's
[`actions-injection-check`](../actions-injection-check/) (checkout and shell
interpolation) and
[`actions-cache-poisoning-check`](../actions-cache-poisoning-check/) (the
Actions cache) already cover, applied to a downloaded artifact's file
contents.

## Why there is no automatic remediation

Privacy-first, on purpose: nothing this tool does ever leaves your device,
and it makes no network calls of its own. It flags the line and explains the
fix — never execute anything from a downloaded artifact, pin `name:` on every
download — applying that fix is left to you.

## Try it without installing anything

[`index.html`](index.html) reads the same classification logic in a browser
page. Paste the contents of one or more files from `.github/workflows/` and
get every finding, each with its fix — nothing is uploaded, and the page
itself makes no network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-risk` into your own CI to block a newly-added finding
before it merges.

## Disclaimers

This tool checks for two specific, narrow patterns in a single workflow file
at a time. It does **not** tell you whether a `workflow_run` job is secure
overall, and a clean scan is not a security or compliance claim about your
repository. It is not a YAML parser — it tracks step and job boundaries with
a small indentation-aware line scan, the same design choice its siblings
make — and it assumes a `workflow_run` download is reading the triggering
run's own artifacts rather than correlating an upload in one workflow file
with a download in another. Verify its output before relying on it, the same
as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events in `localStorage` only —
never transmitted, never tied to a repository, a workflow, or a token. Do Not
Track and Global Privacy Control are honoured, and a button on the page turns
it off entirely. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py` and asserts the browser port produces byte-identical findings on
the same fixture, so the CLI and the page can never silently disagree about
what a line means — following `actions-cache-poisoning-check`'s discipline.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like
[`actions-cache-poisoning-check`](../actions-cache-poisoning-check/),
[`actions-injection-check`](../actions-injection-check/), and
[`pinned-actions-check`](../pinned-actions-check/), this is a direct
graduation of an already-obvious, low-risk dev-tool idea grounded in
documented, published research rather than a scored pipeline write-up. No
external user contact has happened yet — that is the next, non-code step
(see `kill_criteria` in `VENTURE.yaml`).
