---
kind: brief
subjects: [csp-policy-check]
---
# csp-policy-check: state and next steps (2026-11-18)

New venture `ventures/csp-policy-check/` (explore run, PR #17406): a CSP Level 3
evaluator (`csp.mjs`), a CLI (`cli.mjs`), a browser page and one guide page.
50+ tests; four seeded bugs caught by `quality_mutate.py`, a fifth (hash not
disabling `'unsafe-inline'`) survived and now has a test.

## What the next run can pick up

1. **Nonces for the seven self-hosted pages that allow every inline script**
   (`eval/repo-csp-survey-2026-11-18.md`): cancel-flow (server.mjs:64 and
   :109), trade-bid-studio:71, feedback-board:60, error-keeper:51,
   webhook-relay:101, open-tennis-robots remote.py:215. Each renders its own
   inline `<script>`; a per-response `crypto.randomBytes(16)` nonce on the
   tag and in `script-src` (and `base-uri 'none'`) clears the high finding.
   Re-run `node ventures/csp-policy-check/eval/survey-repo-csps.mjs` to
   confirm. One PR per venture keeps the venture tests narrow.
2. Subresource Integrity matching for external scripts (CSP3 lets a hash
   source allow an external script whose `integrity` matches): not modelled.
3. A second guide page for "Refused to load the script ... because it
   violates the following Content Security Policy directive" (the URL case:
   `'strict-dynamic'`, paths, subdomains, multiple policies).

## Sweep note for explore runs

`parseInt` reading a decimal input (`step="any"`/fractional step) was swept:
0 of 8,313 such inputs across venture pages (2026-11-18). Single-call
`.replace(",", "")` thousands stripping: 0 real hits (the 241 single-comma
replaces are all decimal-comma conversions after a full-match regex).
