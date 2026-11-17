---
kind: polish
topics: [seo]
date: 2026-11-17
---
# Polish: "parents" and "job-changers" audience pages

Date: 2026-11-17. Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-17-retirees-audience.md` (other household audiences). Open PRs searched
(`list_pull_requests`, open, 50): none touch `audiences.mjs`.

## What changed

- `platform/pages/audiences.mjs`: `parents` (9 tools: child-tax-credit, eitc, dependent-care-fsa-vs-credit,
  nanny-tax, 529-to-roth-rollover, uk-child-benefit-charge, uk-shared-parental-pay, uk-statutory-maternity-pay,
  uk-tax-free-childcare) and `job-changers` (8: severance-package, cobra-vs-marketplace,
  401k-loan-vs-withdrawal, final-paycheck-deadline, uk- and au-redundancy-pay, job-offer-total-comp,
  job-application-tracker). Titles 60 and 59 chars, descriptions under 160.
- Overlap: `nanny-tax-calculator` is also claimed by `childcare` (its `/nanny/` rule). Left as is: the tool
  shows a nanny's take-home too, and audiences are tested independently by design.
- Left out on purpose: `which-job-first` (a work-order tool), `pto-accrual-liability` (employer),
  `rsu-withholding-gap` (still employed), childcare business tools. `audiences.test.mjs` pins both sides.
- Root `README.md` links both pages (a test requires it).

## Verification

See the PR's run record `notes`.

## Still weakest, and what I would do next

1. **Federal employees** (FERS, TSP) is too thin today: only `fers-retirement-planner` matches. Not
   worth a page until there are four real tools.
2. **Students / new graduates**: `student-loan-rap-ibr-standard`, `uk-student-loan-repayment`,
   `job-offer-total-comp`, `529-to-roth` might clear the bar of four; check each is aimed at the student.
3. Carried over: the `starting` note styling still reads as a business call-out; household tools in business
   sections; a test that fails when a `roth|ira|rmd|social-security` slug lands outside `personal-tax`.
