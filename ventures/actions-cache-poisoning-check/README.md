# Actions Cache Poisoning Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/actions-cache-poisoning-check/>

A free tool that scans GitHub Actions workflow files for two documented
cache-poisoning patterns:

1. **Cache write reachable from an untrusted trigger** — a `pull_request_target`
   or `workflow_run` job runs with the base repository's secrets even though
   a stranger's fork raised the event. If that job writes to `actions/cache`
   (or `actions/cache/save`), the fork controls what lands in a repository-
   scoped cache namespace a later, privileged workflow may restore. This is
   the root cause behind the TanStack Router incident (May 2026).
2. **Unscoped `restore-keys`** — a fallback list on `actions/cache` or
   `actions/cache/restore` that lets a miss on the exact key still restore a
   *different* entry sharing only the key prefix. Independent research
   (AdnaneKhan's `ActionsCacheBlasting`, Hive Security's cache-poisoning
   writeup) documents this as the mechanism that lets a near-collision key
   get adopted.

**What it is not:** a security audit, a compliance attestation, or a
guarantee that a workflow is safe from cache poisoning. It answers one narrow
question for each finding — does this line match one of two well-documented
patterns — and it makes no claim about a workflow's overall security.

## Why this exists

Actions caches are scoped to the whole repository, not to a branch, a
workflow, or a trust level — a fact GitHub's own docs state but do not flag
as risky on their own. The TanStack Router incident showed the consequence:
a fork PR poisoned a cache entry the project's release pipeline later
restored and executed. Both patterns here are the same shape this
portfolio's [`actions-injection-check`](../actions-injection-check/) already
covers for checkouts and shell interpolation — trigger gate plus a specific
sink — applied to the cache instead.

## Why there is no automatic remediation

Privacy-first, on purpose: nothing this tool does ever leaves your device,
and it makes no network calls of its own. It flags the line and explains the
fix (don't cache from a job reachable by an untrusted trigger; scope or drop
`restore-keys`) — applying that fix is left to you.

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

This tool checks for two specific, well-documented cache-poisoning patterns.
It does **not** tell you whether a workflow is secure overall, and a clean
scan is not a security or compliance claim about your repository. It does not
catch the `cache:` input on `actions/setup-node`, `actions/setup-python`,
`actions/setup-java`, or `actions/setup-go`, and it does not correlate a
cache write in one workflow file with a restore in another. Verify its
output before relying on it, the same as any free, best-effort tool.

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
what a line means — following `actions-injection-check/classify.test.mjs`'s
discipline.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like
[`actions-injection-check`](../actions-injection-check/),
[`pinned-actions-check`](../pinned-actions-check/), and
[`actions-runner-starvation-check`](../actions-runner-starvation-check/),
this is a direct graduation of an already-obvious, low-risk dev-tool idea
tied to a dated, verifiable incident. No external user contact has happened
yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
