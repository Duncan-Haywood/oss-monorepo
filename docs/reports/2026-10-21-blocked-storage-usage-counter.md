# `typeof localStorage` throws when a visitor blocks site data

**Date:** 2026-10-21. **Track:** explore (free choice). **Method:** a node
script that defines `globalThis.localStorage` as a getter throwing
`SecurityError` (what Chrome's "block all cookies" and cookie-blocking Safari
do), then calls each export of `usage.mjs`.

## Finding

The usage counter vendored in venture pages checked `typeof localStorage ===
"undefined"` outside any `try`. Reading the global itself throws when site data
is blocked, `typeof` included. On `401k-plan-fee-calculator/usage.mjs`, before
the change, `record`, `readUsage` and `setUsageOptOut` all threw `SecurityError`
in that simulation; after it, all three return quietly. In the click handlers
the throw came after the result was rendered, so the visible damage was an
uncaught error and a skipped opt-out write, not a blank page. That is a
reading from a simulation, not from a real browser: nothing here could observe
one.

## Change

- 990 `ventures/*/usage.mjs` files now go through one `noStorage()` helper
  that wraps the bare read in `try`; four odd copies were fixed by hand
  (`fleet-repair-or-replace-planner`, `repository-branch-hygiene`, and the
  two one-line `count()` copies in `duplicate-payment-audit` and
  `payment-reconciliation-workbench`).
- `platform/ci/check_storage_guard.py` fails on any `localStorage` read outside
  `try` in `usage.mjs`, wired into `portfolio-validate.yml` with unit tests.
- Tests: `node --test` in 4 hand-fixed and 3 sampled ventures plus a random
  sample of 60 changed ones, all passing; `platform/privacy` suites pass.

## Not covered

18 ventures take storage as a parameter (`storage = globalThis.localStorage`)
and their pages pass the bare `localStorage` in `index.html`; the same failure
sits at those call sites. The checker skips them and does not look at
`index.html`. That is the next sweep.
