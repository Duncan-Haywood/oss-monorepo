---
kind: milestone
date: 2026-11-26
---
# PayApps: insurance requirements per job (insurance certificates, part 4)

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`). ROADMAP Next #7,
claimed as `insurance-certificates-part-4-requirements`.

## What landed

- Five columns on `insurance_certificates` (migration 0047): `each_occurrence_cents`,
  `aggregate_cents` (null when not typed), and `additional_insured`, `waiver_of_subrogation`,
  `primary_noncontributory` (what the certificate shows).
- Table `project_insurance_requirements` (same migration): one row per job and coverage, with
  optional minimum limits, the three endorsements and `umbrella_counts`. It is deleted with the job.
- `GET/PUT /api/orgs/:orgId/insurance/requirements/:projectId`. Every member can read it; only
  editors can replace it, and the whole list is replaced in one batch. Another company's job
  returns 404. The routes are registered before `/:id/...` so the literal segment is never read as
  a certificate id.
- Pure rules in `src/shared/insurance-requirements.ts` (`checkRequirements`). A certificate counts
  only while it is in force: not archived, on or after its effective date, and before its expiry
  day. A limit nobody typed is a gap, never assumed met. An umbrella adds to a limit only where the
  requirement allows it. When several certificates could meet a requirement, the one with the
  fewest gaps is reported.
- UI changes:
  - The certificate form has the limits (labelled per coverage) and three checkboxes.
  - The job page has an "Insurance the subcontract requires" panel
    (`components/insurance-requirements.tsx`).
  - A draft pay app's insurance note lists the job's gaps on its own date. A lapsed certificate
    is not repeated there.
- Privacy policy bumped to 2026-11-26.7. The marketing site's feature line and the customer post
  (`docs/posts/2026-11-24-pay-applications-...`) no longer say "does not check coverage or limits".

## Why this is part of the paid product

A COI that is current but short of the subcontract's limits or endorsements is a common reason a
pay app gets held. The free `coi-expiry-gap-checker` (public) does a one-off check for GCs. The
paid version keeps the check per job, so it runs on every pay app.

## Not done, on purpose

- No limits or endorsements are suggested. The user types what their own subcontract says, so the
  product never implies a "standard" requirement.
- Endorsements are recorded per certificate, not per holder.
- Nothing is read from the policy itself, and the copy says so.

## For the next run

ROADMAP now reads "Insurance certificates, part 5": an email draft that sends the renewal to every
holder; reading the requirements from the subcontract's insurance exhibit (a PDF), if people ask;
and per-holder endorsements, if needed.
