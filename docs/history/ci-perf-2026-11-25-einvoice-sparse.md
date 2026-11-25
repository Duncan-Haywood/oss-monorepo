# einvoice-preflight CI: sparse checkout with `platform/billing` (2026-11-25)

Perf track, version 0. A follow-up to item 4 of
`ci-perf-2026-11-25-venture-workflow-sparse.md`, which rejected this workflow
for a sparse checkout ("browser suite 2332 tests to 2328, fails 1 to 2").
einvoice-preflight is the first subscription product in
`portfolio/monetization/transition.py` and bet 3 in `bets.md`, so its CI runs on
most of the product's PRs.

## Reading (before)

`python3 platform/ci/ci_profile.py --runs 600 --top 25`, window 03:48 to
04:21 UTC: `einvoice-preflight CI` ran 3 jobs, **median job 67 s, checkout
median 57 s (69% of job time)**, with a queue q50 of 196 s.

## Why the first try failed

`auditpack.test.mjs` imports `../../platform/billing/testkit.mjs`, which imports
`server.mjs` and `client.mjs` in the same folder. Without `platform/billing`, the
test file fails to load: one extra failure and four fewer tests. A grep of the
venture for `../..`, `platform/` and `portfolio/` finds nothing else it reads at
run time. The other hits are comments, generated-file headers, XPath text in
`plain-compile.mjs`, and relative site links in `rules/build.mjs`.

## Change

All three jobs (`cli-test`, `browser-test`, `examples`) check out:

```yaml
filter: blob:none
sparse-checkout: |
  .github
  platform/billing
  ventures/einvoice-preflight
```

## Verification

`python3 platform/ci/sparse_checkout_verify.py einvoice-preflight-ci.yml .github ventures/einvoice-preflight platform/billing`:
**exit 0, `same: true`**. Every step gave the same exit code and test-count lines in
both trees:

- cli-test: `Ran 440 tests`, OK.
- browser-test: `npm i` ok, then `node --test` with 2332 tests, 2315 pass,
  16 skipped (the `run build-schematron.mjs` skips) and 1 fail.
- examples: both steps ok.

The one failure happens in both trees and comes from this container:
`repair-facturx.test.mjs:115`, "poppler opens the repaired PDF". Here
`pdfdetach` is a wrapper with saving switched off. GitHub's runner has the real
poppler.

## After

This PR's own CI runs the changed workflow. Step timings are in the run record's
`notes`, taken from `actions/runs/<id>/jobs`. The 44 workflows changed the same
way earlier on 2026-11-25 went from a 43 s median checkout to 2 s.

## Not changed, ranked for the next run

1. The other rejected workflows from the 2026-11-25 pass: `mcp-supply-chain-watch`
   (reads `../../../platform/pages/build.mjs`; add `platform/pages`), plus
   `llm-spend-guard`, `devsec-toolkit` and `publish-kit`. A grep for `../` finds
   none of their outside reads, so they reach them some other way (spawned
   scripts, `process.cwd()` walks). Trace them with `strace -f -e openat` or a
   one-off `fs` hook before widening the list.
2. CodeQL (171 job-minutes in the window, the largest consumer) and the
   Security gate (114) are `priv-` workflows and only the owner can change them.
3. P063 and P064 stay owner-gated.
