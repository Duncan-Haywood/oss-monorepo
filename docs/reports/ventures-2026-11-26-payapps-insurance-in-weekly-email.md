# PayApps: insurance certificates in the weekly email (private PR 259)

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`). ROADMAP Next #7, the part
claimed as `insurance-certificates-expiring-in-weekly-email`.

## What landed

- The weekly "money to chase" email (`services/payapps/digest.ts`, rules in `src/shared/cash-digest.ts`)
  now lists the company's active certificates that are expired, or expire within 30 days of the
  report's date, under "Insurance certificates to renew". They are listed soonest first, at most 10
  (the rest counted), with a summary line and a link to `/orgs/:orgId/insurance`.
- **The send rule changed.** Before this PR, the email went out only when some job had a next step.
  Now a certificate to renew is enough on its own, because a certificate belongs to the company and
  not to any one job. Without this change, a company with no pay application due would never hear
  that a policy had lapsed. If nothing is due and nothing needs renewing, no email goes out, as
  before.
- The Cash page preview counts the certificates as well as the jobs (`digestPreviewText` in
  `pages/cash.tsx`).

## Verification

All run locally, because the private repo's CI runners were starved: run 45763815553 was confirmed
by `ci_starvation.py`, and its jobs went red within 3-7 s.

- Typecheck is clean.
- `pnpm test:unit` is green.
- `pnpm test:worker`: 51 files, 320 tests passed. The new worker test covers a company with only a
  lapsed certificate (it gets mailed), escaping of the certificate name, archived and current
  certificates left out, and no cross-company leak.

## For the next run

What is still open in item 7:
- The certificate PDF kept with each record. Another run claimed this as
  `insurance-certificates-part-2-pdf`.
- Which GCs or jobs hold each certificate.

When the PDF part lands, the email could link each certificate's file. Until then the link goes to
the insurance page.
