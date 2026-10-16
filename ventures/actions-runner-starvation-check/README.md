# Actions Runner Starvation Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/actions-runner-starvation-check/>

A free tool that tells you whether a red GitHub Actions check is a real
failure or a job GitHub never assigned a runner to — from the run's own
`runner_id` field, not a guess from how fast it failed.

**What it is not:** a way to fix your Actions minutes, or a substitute for
your GitHub billing page. It answers one narrow question — was this job
even scheduled — so you know whether the next few minutes are worth
spending on your code.

After using this, you can now **tell a real CI failure from a starved one
in one paste**, which used to take **opening the run in the GitHub UI,
guessing from how fast it failed, and being wrong in both directions**.

## Why this exists

When a GitHub account stops getting Actions runners — included minutes
spent, a spending limit, a payment problem, Actions disabled — every check
on every PR fails within a few seconds with an empty output body. It looks
exactly like a real, fast failure: a syntax error or an assertion that
fails on the first test also finishes in a few seconds. Reading the checks
list by eye cannot tell the two apart, and going by it makes two opposite
and equally expensive mistakes: "fixing" code that was never broken, and
waving through a real regression because it also failed fast.

The run's own `runner_id` field settles it without guessing. A job GitHub
actually scheduled carries a real, nonzero id. A job it never got to
reports `runner_id: 0` and an empty `runner_name` — proof no runner was
ever assigned, so no step in the job could have run, so the failure cannot
be about anything the job would have tested. This tool decides on that
field alone; duration and an empty output body are reported for context,
never as a vote.

This generalizes an internal tool
([`platform/ci/ci_starvation.py`](../../platform/ci/ci_starvation.py) in
this monorepo) built to answer exactly this question during a real,
repeated CI-starvation incident — `CLAUDE.md` documents it at length. The
classify/report logic here is a faithful, tested port; this venture makes
it usable against any GitHub repository, not just this one.

## Try it without installing anything

[`index.html`](index.html) reads the same logic in a browser page. Run
`gh api repos/OWNER/REPO/actions/runs/RUN_ID/jobs` (or open that same URL
against `api.github.com` with a token that has `Actions: read`), paste the
response in, and get a plain verdict — no fetch happens from the page
itself, so your token never has to touch it.

## Quickstart (CLI)

```sh
python3 check.py --run RUN_ID           # every job in a run; exits 1 if any was starved
python3 check.py JOB_ID                 # one job
python3 check.py --run RUN_ID --json    # machine-readable
python3 check.py --from-json jobs.json  # classify a payload you already fetched, no API call
```

Zero dependencies — stdlib only, one file, nothing to install. It reaches
the Actions API via the `gh` CLI if installed, otherwise a `GH_TOKEN` or
`GITHUB_TOKEN` it finds in the environment (the route a hosted CI step or
an agent session actually has).

## Disclaimers

This tool answers one question: was a specific job assigned a runner. It
does **not** tell you why your account stopped getting them — GitHub's own
run-timing API reports zero billable time for private repos regardless of
what ran, so it cannot attribute cost either. That answer is on your GitHub
billing page. Verify its output before relying on it, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
a run, a repo, or a token. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns it off entirely. The CLI records
nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The classify/report
logic and its test suite are a direct port of the internal tool's, already
exercised against this monorepo's own real starvation incidents. No
external user contact has happened yet — that is the next, non-code step
(see `kill_criteria` in `VENTURE.yaml`).
