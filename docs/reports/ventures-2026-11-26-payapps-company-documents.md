---
kind: milestone
date: 2026-11-26
---
# PayApps: company documents (licenses, W-9, bonding letter), part 1

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`). This opens the
bets.md growth topic "subcontractor compliance documents", which had no claim on it. It was claimed
as `compliance-documents-licenses-w9` with `roadmap_claim.py payapps --slug`. The ROADMAP's Next list
had no free, ungated item on any bet: everything was claimed or waiting on demand or the owner.

## What landed (private repo)

- `src/shared/company-documents.ts` holds the pure rules. There are nine kinds: contractor's
  license, business license, W-9, bonding letter, safety program, EMR letter, OSHA 300A, DBE/MBE/WBE
  certification and other.
  - The expiry date is optional. A document without one gets the status `no_expiry` and is never
    warned about.
  - With a date, the insurance rules apply: expired on the expiry day and after, expiring within
    30 days before it.
  - `payAppDocumentWarnings`, `documentsNeedingRenewal`, and `prequalificationSummary` (the text a
    sub pastes into a GC's prequalification form; an expired document is listed and marked EXPIRED,
    never left out).
- Table `company_documents` (migration 0075, made by `pnpm db:generate`, so the snapshot and journal
  match). Service `services/company-documents.ts`. Routes `GET/POST /api/orgs/:orgId/documents` and
  `PATCH/DELETE /api/orgs/:orgId/documents/:id`: editors write, viewers read, every query filters by
  org, and a company keeps at most 200.
- **A W-9 never stores a number.** Its number is the company's EIN or a sole proprietor's SSN. The
  zod schema refuses one on create. The service also refuses one on an edit, including an edit that
  turns a numbered document into a W-9. The form hides the field and explains why.
- Client: the page `/orgs/:orgId/documents`, linked as "Licenses" on the Projects page. The Projects
  page shows `DocumentsAlert`, and a draft pay app shows `PayAppDocumentsNote` under the insurance
  note.
- The privacy policy names the new data, and its version is 2026-11-26.25. `documents.ts` was
  regenerated with `docs/legal/sync-documents.mjs`.
- payapps-site: one feature bullet under "The monthly pay app", saying that the app does not check a
  license with the state board.

## Verification

All of this was run in this session's clone:

- `pnpm typecheck` passed.
- `pnpm test:unit`: 1,217 passed, 1 skipped.
- `pnpm test:worker` ran in full; the run record has the result.
- `pnpm build` ran.
- payapps-site: `test:unit` passed 21 of 21, and its typecheck is clean.
- New tests:
  - `src/shared/company-documents.test.ts` (7 tests).
  - `test/worker/company-documents.test.ts` (6 tests: roles, the W-9 number refused, cross-tenant
    404s).
  - `test/unit/documents-note.test.tsx` (4 tests).

## For the next run

ROADMAP Next has "Company documents, part 2":

- files per document, offered as pay app backup (copy the insurance-files pattern: `services/insurance-files.ts`, the
  `from-insurance` copy route);
- a weekly-email line in `src/shared/cash-digest.ts`;
- holders per GC, if contractors ask.

The weekly-email line is the cheapest of the three and needs no new table.
