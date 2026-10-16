# Actions Injection Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/actions-injection-check/>

A free tool that scans GitHub Actions workflow files for two documented
injection patterns:

1. **Pwn request checkout** — a `pull_request_target` or `workflow_run`
   workflow that checks out an untrusted head (`github.event.pull_request.head.sha`,
   `head.ref`, `github.head_ref`, or the `workflow_run` equivalents), so a
   later build/test/run step executes a stranger's fork with the base
   repository's secrets.
2. **Script injection** — a `run:` step that interpolates an untrusted
   `${{ github.event.* }}` expression (a PR title, issue body, commit
   message, or branch name) straight into a shell command, letting the
   attacker-controlled string splice its own commands into the script.

**What it is not:** a security audit, a compliance attestation, or a
guarantee that a workflow is safe from injection attacks. It answers one
narrow question for each finding — does this line match one of two
well-documented patterns — and it makes no claim about a workflow's overall
security.

## Why this exists

Both patterns are documented at length in GitHub's own security guidance
("Keeping your GitHub Actions and workflows secure, Part 1: Preventing pwn
requests" and "Understanding the risk of script injection"), and the first
was significant enough that `actions/checkout` v7 (June 2026) started
refusing the common form of it by default. Plenty of workflows still pin
older `checkout` versions or route around that default, and script injection
is unaffected by it entirely — so both patterns are still worth checking for
directly.

## Why there is no automatic remediation

Privacy-first, on purpose: nothing this tool does ever leaves your device,
and it makes no network calls of its own. It flags the line and explains the
fix (move the untrusted value through a step `env:` var and reference it as a
quoted shell variable; avoid checking out an untrusted head in a privileged
trigger) — applying that fix is left to you.

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
python3 check.py --format sarif   # SARIF 2.1.0, for GitHub code scanning
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-risk` into your own CI to block a newly-added finding
before it merges, or upload the SARIF output so findings show up as code
scanning alerts on the PR diff instead of only in a log:

```yaml
- run: python3 check.py --format sarif > results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

Every artifact path in the SARIF output is resolved relative to the scanned
directory (the default `.`, or the argument you pass), which is what
`upload-sarif` needs to attach a result to a line in the pull request diff
rather than dropping it silently.

## Disclaimers

This tool checks for two specific, well-documented injection patterns. It
does **not** tell you whether a workflow is secure overall, and a clean scan
is not a security or compliance claim about your repository. Both patterns
have off-list variants (a hand-rolled `git checkout` instead of
`actions/checkout`, an expression built with `format()` or string
concatenation) that this tool does not attempt to catch. Verify its output
before relying on it, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events in `localStorage` only —
never transmitted, never tied to a repository, a workflow, or a token. Do Not
Track and Global Privacy Control are honoured, and a button on the page
turns it off entirely. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py` and asserts the browser port produces byte-identical findings on
the same fixture, so the CLI and the page can never silently disagree about
what a line means — following `pinned-actions-check/classify.test.mjs`'s
discipline.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like
[`pinned-actions-check`](../pinned-actions-check/) and
[`actions-runner-starvation-check`](../actions-runner-starvation-check/),
this is a direct graduation of an already-obvious, low-risk dev-tool idea.
No external user contact has happened yet — that is the next, non-code step
(see `kill_criteria` in `VENTURE.yaml`).
