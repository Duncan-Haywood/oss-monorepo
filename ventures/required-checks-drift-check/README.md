# Required Checks Drift Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/required-checks-drift-check/>

A free tool that compares your branch-protection required status check
names against the job names your GitHub Actions workflows would currently
report, and flags every required check nothing can ever satisfy again —
the reason a pull request sits at *"Expected — Waiting for status to be
reported"* forever.

**What it is not:** a security audit, a compliance attestation, or a full
review of your branch-protection configuration. It answers one narrow
question — does this required check name still match a job that would
report on a pull request today — and it never reads your branch protection
settings or repository for you: you paste both inputs yourself.

## Why this exists

Branch protection's "Require status checks to pass" list is matched by
**exact name**, and GitHub never re-derives that list from your workflow
files. Three ordinary changes leave a name nothing will ever satisfy again:

1. **A job was renamed** (a `name:` added or changed, or the job id itself
   changed with no `name:` override).
2. **A job was removed.**
3. **The workflow dropped its `pull_request` (or `pull_request_target`)
   trigger** — GitHub can only post a status onto a PR from a run that PR
   triggered, so a workflow that only runs `on: push` can have a job with
   the exact right name and still never satisfy the check on a pull request.

Nothing in GitHub's own UI tells you this happened. The pull request itself
gives no reason — it just never becomes mergeable. After using this, you
can find every already-stuck required check in your branch protection,
which used to mean guessing from an unhelpful GitHub status message or
reading every workflow file by hand.

## What it cannot verify, and says so

A **dynamic matrix** (`matrix: ${{ fromJson(...) }}`, or one using
`include`/`exclude`) can't be enumerated statically, and a job that calls a
**reusable workflow** (`uses: <file>.yml`) uses a different naming
convention this tool doesn't compute. Both are reported as `unverifiable`
rather than silently matched or silently flagged stale.

Why tracing this by hand doesn't scale: [this checker vs. reading every
workflow file by hand](vs-reading-every-workflow-file-by-hand.html).

## Try it without installing anything

[`index.html`](index.html) reads the same comparison logic in a browser
page. Paste your required check names and one or more files from
`.github/workflows/` and get a full breakdown — nothing is uploaded, and the
page itself makes no network requests.

## Quickstart (CLI)

```sh
python3 check.py                                        # list computed check names for .github/workflows
python3 check.py --required-checks names.txt             # compare against a plain-text list
gh api repos/:owner/:repo/branches/:branch/protection > protection.json
python3 check.py --required-checks protection.json --format json
python3 check.py --required-checks protection.json --fail-on-stale   # exit 2 if any required check is stale
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-stale` into your own CI (run right after a workflow
or branch-protection change) to catch a required-check name drifting out of
sync before it silently blocks every future pull request.

## Disclaimers

This tool answers one question: does a required status check name match a
job that would currently report on a pull request. It does **not** audit
your branch protection rules or CI configuration as a whole, and a clean
result is not a completeness guarantee. Verify its output before relying on
it, the same as any free, best-effort tool.

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
node --test page.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py` and asserts the browser port produces identical findings on the
same fixture, so the CLI and the page can never silently disagree about
what a line means.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like [`pinned-actions-check`](../pinned-actions-check/) and
[`docker-base-image-pin-check`](../docker-base-image-pin-check/), this is a
direct graduation of an already-obvious, low-risk dev-tool idea. No external
user contact has happened yet — that is the next, non-code step (see
`kill_criteria` in `VENTURE.yaml`).
