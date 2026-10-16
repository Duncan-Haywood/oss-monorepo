# Pinned Actions Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pinned-actions-check/>

A free tool that scans GitHub Actions workflow files and flags every
third-party action referenced by a mutable tag or branch (`@v4`, `@main`)
instead of a pinned 40-character commit SHA — a documented GitHub Actions
supply-chain hardening practice, not a novel claim.

**What it is not:** a security audit, a compliance attestation, or a
guarantee that your CI is safe from supply-chain attacks. It answers one
narrow question — is this specific `uses:` reference pinned to a fixed
commit — and it does not resolve anything on your behalf: it prints the exact
`git ls-remote` command so you can look up the SHA yourself.

## Why this exists

A workflow step like `uses: some-org/some-action@v4` trusts whatever commit
the tag `v4` currently points to. Nothing stops the action's owner — or an
attacker who compromises their account — from repointing that tag at
different code tomorrow, and the next time your workflow runs, it runs that
new code with whatever permissions and secrets the workflow has. This
happened for real in March 2025: `tj-actions/changed-files`'s version tags
were repointed at a malicious commit that dumped CI secrets into logs for
any workflow that referenced it by tag. A workflow pinned to a commit SHA was
never affected, because a SHA cannot be silently repointed.

## Why there is no automatic SHA resolution

Privacy-first, on purpose: nothing this tool does ever leaves your device,
and it makes no network calls of its own — not even to look up a SHA for
you. Resolving a mutable ref to a commit means asking GitHub something, and
this tool would either need to be a server that sees every workflow pasted
into it, or fetch on your behalf, neither of which is worth the convenience
next to printing the one command you can run yourself with your own network
access and your own judgment about whether to trust the result. Every
mutable finding therefore comes with the exact `git ls-remote` command to run
instead of a resolved answer.

## Try it without installing anything

[`index.html`](index.html) reads the same classification logic in a browser
page. Paste the contents of one or more files from `.github/workflows/` and
get every unpinned third-party action, each with its remediation command —
nothing is uploaded, and the page itself makes no network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --format sarif   # SARIF 2.1.0, for GitHub code scanning
python3 check.py --fail-on-risk   # exit 2 if any mutable (unpinned) action is found
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-risk` into your own CI to block a newly-added unpinned
action before it merges, or upload the SARIF output so a mutable reference
shows up as a code scanning alert on the PR diff instead of only in a log:

```yaml
- run: python3 check.py --format sarif > results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

Only `mutable` findings become SARIF results — a `pinned`, `local`, or
`docker` reference is not a finding to report, and every artifact path is
resolved relative to the scanned directory (the default `.`, or the argument
you pass), which is what `upload-sarif` needs to attach a result to a line in
the pull request diff rather than dropping it silently.

## Disclaimers

This tool answers one question: is a given `uses:` reference pinned to a
commit SHA. It does **not** tell you whether the code at that commit is
itself safe, and a clean scan is not a security or compliance claim about
your repository. Verify its output before relying on it, the same as any
free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
a repository, a workflow, or a token. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns it off entirely. The
CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py` and asserts the browser port produces byte-identical findings on
the same fixture, so the CLI and the page can never silently disagree about
what a line means.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like
[`actions-runner-starvation-check`](../actions-runner-starvation-check/),
this is a direct graduation of an already-obvious, low-risk dev-tool idea.
No external user contact has happened yet — that is the next, non-code step
(see `kill_criteria` in `VENTURE.yaml`).
