---
kind: note
topics: [security-alerts, ci]
date: 2026-11-25
---
# The security queue listed 1,243 alerts that were mostly already fixed

Date: 2026-11-25, about 02:15 UTC. Found by a scheduled run that took alert #1 from
`origin/security-alerts:QUEUE.md`, as `prompt.md` step 0 says.

## What happened

- `QUEUE.md` listed 1,243 open alerts. PR 18676 (merged 2026-11-25 01:12 UTC) had cut the
  findings on main from 1,231 to 40 the day before.
- The only completed CodeQL run on `main` was run 45521750254, on commit `e98ec5cbb`
  (started 00:54, finished 01:58 UTC: **64 minutes**). That commit is older than PR 18676.
- The 12 runs on main after it all ended `cancelled`. `priv-codeql.yml` uses one concurrency
  group per ref, so while a scan runs, each new merge's run waits as *pending*, and the
  next merge cancels it. Nothing is lost: when the running scan finishes, the newest pending
  run starts. But at a merge every few minutes and an hour per scan, the queue lags main
  by one to two hours.
- `git diff --name-only e98ec5cbb origin/main`: **1,189 of the 1,243 queued alerts are in
  files changed since that scan.** Alert #1 (`research/cell-fidelity/experiments/solver/run.py`)
  and alerts #2–#4 (`einvoice-preflight/tests/test_*.py`) had already been fixed in PR 18676.

A session that followed the queue as written would have redone fixes already on main.

## What changed (this PR)

`platform/ci/security_alerts.py` now reads each alert's `most_recent_instance.commit_sha`:

- `QUEUE.md` says which commit(s) the scan ran on, and warns that main may have moved on.
- Each `alerts/<n>.md` names the commit and starts with **step 0**:
  `git fetch -q --depth=1 origin <sha> && git diff --stat <sha> origin/main -- <path>`.
  If the file changed, read the flagged line on main before fixing anything. This works in the
  shallow cloud clone (checked here on `e98ec5cbb`).

Tests: `platform/ci/test_security_alerts.py`, three new cases (16 pass).

## Not fixed in unchanged files, for the next run

These 54 queued alerts are in files that have not changed since `e98ec5cbb`. Most are the
documented left-open ones in `docs/reports/2026-11-24-codeql-backlog-cleared.md`. These are
not listed there:

- `js/incomplete-hostname-regexp`: `sshd-config-check/scan.test.mjs:146`,
  `subpath-robots-check/analyze.test.mjs:305-307`, `einvoice-preflight/sdi-receipt.test.mjs:10`,
  `einvoice-preflight/facturae-signature.test.mjs:44-49`, `platform/pages/audio-cdn.mjs:23`.
  The flagged lines are test inputs (`"acme.github.io"`), XML namespace URIs and a CDN origin
  constant. They are probably false positives, but read how each value is used before you
  dismiss one.
- `js/insecure-download`: `ventures/source-map-leak-check/probe.mjs:44`.
- `py/clear-text-*`: `platform/security/risk_review.py:451,457,458` (a CODEOWNERS path).

Wait for the next completed scan on main before you take any of these. If they are still
open after it, they are real queue items.

## A follow-up worth doing

A 64-minute scan sets the queue's lag. `actions` and `python` are small, so the
`javascript-typescript` leg is the likely cost. `paths-ignore` for generated `site/` copies,
or a split by top-level directory, could cut it. Measure each leg's time before you change
anything. This is a `priv-*` workflow, which is control plane.
