---
kind: milestone
date: 2026-11-25
---
# PayApps: retainage released per line before a mid-job start (bet #1)

Run of 2026-11-25, ventures/1. Private PR: Duncan-Haywood/private-monorepo#126. Private repository `Duncan-Haywood/private-monorepo`,
`apps/payapps`; ROADMAP Next item "Mid-job start, part 3: per-line retainage released
before the move" (claim `claim/payapps/mid-job-start-part-3-line-release`).

## What landed

- `SovLineInput.openingReleasedCents` in `src/shared/payapp-math.ts` seeds the per-line
  released-to-date total, so column I and line 5 of the first application here start from what
  is still held. `openingRetainageWarning` subtracts it and points to the new field.
- Column `sov_lines.opening_released_cents` (migration 0034), `releasedCents` per line on
  `PUT .../projects/:id/opening` (400 when a line has release but no work), DTO field
  `openingReleasedCents`, and a checkbox-revealed column on the opening balance form.
- Tests: an equivalence test (billing #1 to #3 here equals #1 and #2 elsewhere plus #3 here,
  with a release on #2), the warning with and without the release, an over-release flag, and a
  worker route test with the money worked through.

## For the next run

- Not done: filling the release from the continuation sheet. A sheet's retainage column cannot
  tell a release from a rate change, so it is not inferred.
- The CA lien waiver item is still blocked: leginfo.legislature.ca.gov and law.justia.com both
  answered 403 through the proxy on 2026-11-25.
