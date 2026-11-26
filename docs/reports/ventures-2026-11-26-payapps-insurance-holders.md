---
kind: milestone
date: 2026-11-26
---
# PayApps: insurance certificate holders (private PR 261)

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`). This is ROADMAP Next #7,
"Insurance certificates, part 3", claimed as `insurance-certificates-part-3`.

## What landed

- Table `insurance_certificate_projects` (migration 0046): one row per certificate and job, with an
  optional `sent_on`. A row is deleted when its job or its certificate is deleted.
- `PUT /api/orgs/:orgId/insurance/:id/holders` (editors only). It replaces the whole list in one D1
  batch. A job belonging to another company returns 404 and nothing is saved. Every certificate in
  the list endpoint now carries `holders`.
- Pure rules in `src/shared/insurance.ts`:
  - `holdersByGc` groups holders by GC, so each GC is listed once; the GC name is matched ignoring
    case and surrounding spaces.
  - `jobCertificates` says, for one pay app, which certificates its GC holds. It returns null while
    the company has recorded no holder on any certificate, so an unused feature never reads as
    "not on file".
- UI changes:
  - The insurance page has a "Sent to…" panel (`HoldersPanel`). A renewal is offered the jobs of the
    archived certificate of the same coverage.
  - Each certificate shows "Held by …", or "Send the renewal to …" while it is expired or expiring.
  - On a draft pay app, the backup offer marks what this job's GC holds and names the certificates
    not recorded as sent to that GC.
- The weekly email's renewal lines name the GCs (`digestCertificateText`).
- Privacy policy bumped to 2026-11-26.6, so every user is asked to accept it again on their next
  visit (the same precedent as parts 1 and 2).

## Verification

Run locally from the clone: `run_workflow_locally.py payapps-ci` passed 9/9 run steps and
payapps-site-ci passed 6/6.

## For the next run

The item now reads "part 4", and both remaining pieces are "if people ask":
- the GC's own coverage and endorsement requirements per job, checked against what is on file;
- a "send the renewal" email draft to every holder.

Both stay below the other Next items until there is usage. Don't restart part 3.
