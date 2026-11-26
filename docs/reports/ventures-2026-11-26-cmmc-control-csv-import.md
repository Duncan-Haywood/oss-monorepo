---
kind: milestone
date: 2026-11-26
---
# CMMC Workspace: import an existing self-assessment spreadsheet (2026-11-26)

Bet #4 (`portfolio/monetization/bets.md`). Private-monorepo PR #229, merged; claim
`claim/cmmc/control-status-csv-import`.

## Why this, this run
payapps (bet #1) and jobshop-quote (bet #2) had a dozen or more parallel runs on 2026-11-26 and
their free ROADMAP items were mostly "once a customer asks" or need sources this environment can't
reach. The CMMC ROADMAP had two Next items left. Neither moved the workspace closer to a first
paying shop. Most small defense shops that have ever answered a prime's DFARS 7012 / SPRS request
already keep a NIST SP 800-171 spreadsheet. Asking them to retype 110 rows is the switching cost
that stops a trial from converting. So this run built an import, which `prompts/ventures/prompt-2.md`
names as "an import or integration buyers need".

Regulatory hosts (ecfr.gov, nist.gov, govinfo, federalregister, dodcio, law.cornell.edu) all
answered 403 through the proxy this run, so I left work that needs new official text (asset
categories under 32 CFR 170.19, for example) alone.

## What landed
- `apps/cmmc/src/shared/controls/csv-import.ts` (pure): CSV parsing (BOM, CRLF, `,` `;` tab,
  quoted newlines). The requirement column is found **by its contents** (CMMC ids, bare NIST numbers,
  Level 1 FAR items and the NIST numbers behind them). Title and family-heading rows are skipped.
  Status, owner e-mail, notes and statement columns are found by header, and status falls back to
  contents. Only listed phrases count as a status. Anything else is reported by line and left out,
  and a blank cell never overwrites.
- `POST /api/orgs/:orgId/controls/import {level, csv, apply}`: editors can preview on any plan.
  Applying Level 2 needs the Level 2 plan (402), so the free plan sees what it would get. The import
  writes in D1 batches (flat query count) with one `control.import` audit entry.
- The "Import CSV" panel on the Controls page, plus README, ROADMAP and a bullet on cmmc-site's
  "what it does" page.

## Verification
`run_workflow_locally.py --repo-root /home/user/private-monorepo cmmc-ci`: 8/8 `run:` steps passed.
The GitHub job never got a runner (`ci_starvation.py --run 45748888977`). New tests: 11 parser,
2 component, 3 worker (preview/apply/idempotent re-import, free-plan 402, viewer 403, cross-tenant
404). Nobody drove the panel in a real browser; the happy-dom component test is the only UI check.

## Next
- Import part 2 (on the ROADMAP): read .xlsx directly, import the POA&M sheet, and check the header
  phrases against a real NIST SSP template or prime questionnaire once a shop sends one. The
  phrase lists are the run's judgment, not taken from a published template.
