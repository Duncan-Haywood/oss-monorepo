# Actions timeout-minutes Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/actions-timeout-check/>

A free tool that scans GitHub Actions workflow files for jobs that can hang
for GitHub's default six hours:

1. **`job-missing-timeout`** — a job on a runner (`runs-on:`) with no
   job-level `timeout-minutes`. GitHub cancels it only at its default limit
   of 360 minutes, so one deadlocked test or stalled download holds a runner
   — and, on a private repository, bills minutes — for six hours instead of
   a few.
2. **`job-timeout-at-default`** — a job whose `timeout-minutes` is 360 or
   more. That is the default restated; it looks like a guard and is not one.

Each finding prints the job, its runner, an upper bound on billed minutes
per hung run (using GitHub's documented Windows and macOS multipliers —
check GitHub's current billing page, they can change) and the fix.

**What it is not:** a cost audit, a security audit, or a prediction of what
any run bills. It does not pick the right timeout for you — too tight a
limit cancels healthy runs — and it makes no claim about a workflow beyond
this one pattern.

## Why this exists

None of the portfolio's other `actions-*` checkers read `timeout-minutes`:
`pinned-actions-check`, `actions-permissions-check` and
`actions-secret-leak-check` are about security, `deploy-concurrency-check`
about overlapping deploys. A missing timeout is the one CI-hygiene gap whose
price is a bill, which is why a maintainer on a metered plan has a reason to
look for it.

## Try it without installing anything

[`index.html`](index.html) runs the same logic in a browser page. Paste the
contents of one or more files from `.github/workflows/` and get every
finding — nothing is uploaded, and the page makes no network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan .github/workflows under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Zero dependencies — stdlib only, one file, no network calls. Wire
`--fail-on-risk` into your own CI to block a job added without a timeout.

## Limits

A line-oriented scan, not a YAML parser: block-style `jobs:` mappings only;
a `timeout-minutes` set through an expression (`${{ ... }}`) is trusted, not
evaluated; step-level timeouts are ignored; a job that calls a reusable
workflow is skipped because `timeout-minutes` is not accepted there.

## Disclaimers

Free, best-effort, no warranty. A clean scan means this one pattern was not
found, nothing more. Verify its output before relying on it. Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never changes
what the tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events in `localStorage` only —
never transmitted. Do Not Track and Global Privacy Control are honoured, and
a button on the page turns it off. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that runs `check.py` and asserts
the browser port produces identical findings on the same fixture.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). First visitor channel:
people searching "github actions timeout-minutes default" and "github
actions job stuck 6 hours" — the answer pages that rank for those are docs
and forum threads with no checker attached.
