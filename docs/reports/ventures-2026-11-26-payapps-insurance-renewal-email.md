---
kind: milestone
date: 2026-11-26
---
# PayApps: the renewal email to each GC holder (private PR 272)

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`). This is ROADMAP Next #8,
"Insurance certificates, part 5", claimed as `insurance-certificates-part-5-renewal-email`.

## What landed

- Pure rules in `src/shared/insurance-renewal-email.ts`:
  - `renewedCertificate` finds the certificate this one renews: same coverage, an earlier expiry
    date, at least one holder, archived or not.
  - `renewalEmails` writes one draft per GC (grouped with `holdersByGc`). The draft is a "renewal"
    when there is a renewed certificate and "current" otherwise. Archived or expired certificates
    get no draft.
  - `holdersAfterSend` builds the list for the existing `PUT /insurance/:id/holders`.
- `components/insurance-renewal-email.tsx` is the panel, opened from "Email GCs" on the insurance
  page (`canEmail` decides when the button shows). It offers Copy, "Open in my email" and
  "Record as sent today" (editors only).
- No server, schema, migration or privacy-policy change: nothing new is stored.

## Decisions a later run may revisit

- The recipient is the GC project manager (`gcPmEmail`), used only when all of that GC's jobs agree
  on one address. Otherwise the field is left blank and the panel lists the addresses it found.
  Some GCs route certificates to a compliance desk or a service such as myCOI or Billy. A per-GC
  compliance contact is listed in ROADMAP Next as part 6, "if PMs turn out to be the wrong recipient".
- The draft never mentions an attachment, the same rule as the change-order draft.

## Verification

From the private clone: `pnpm typecheck` was clean, and `pnpm test:unit` passed 755 tests, 12 of
them new.

## For the next run

ROADMAP Next #8 is now "part 6". Every piece of it is "if people ask".
