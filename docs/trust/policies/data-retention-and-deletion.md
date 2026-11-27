# Data retention and deletion policy

| | |
| --- | --- |
| Applies to | Customer data in every product, and the backups and logs that contain it |
| Owner | The company owner |
| Reviewed | 2026-11-24 · next review by 2027-05-24 |

Principle: keep customer data only while the customer uses the product, let them take it with them,
and make deletion real.

## 1. Grant Autopilot (implemented)

Source: `apps/grants/docs/DATA_POLICY.md`, `apps/grants/docs/legal/privacy.md`, RUNBOOK §7 and §12.

| Data | Kept | Deleted by |
| --- | --- | --- |
| Organization data (D1 rows, R2 files, vectors) | While the organization exists | Owner deletes the org (`DELETE /api/orgs/:orgId/privacy/org`): job `privacy.delete_org` removes files, vectors and every row, leaving a receipt with ids and counts only |
| Original uploads, stored voice audio | Until the org's `raw_file_retention_days`, if set | Daily `privacy.retention_sweep`; extracted text and transcripts are kept |
| Data exports | 7 days | Retention sweep |
| A user account | Until the user deletes it | Self-service, with re-authentication; refused while the user is the last owner of an org (`services/auth/account.ts`) |
| Newsletter sign-ups never confirmed | 30 days | Scheduled cleanup |
| Unsubscribed newsletter addresses | Kept on a suppression list so we never mail them again; removed on request | Manual |
| Database backups | Up to 30 days (Time Travel; newest 30 nightly copies) | Roll off automatically |
| Workers Logs | Cloudflare's retention for the plan *(OWNER-CONFIRM.md §5)* | Automatic; they hold ids, routes and status only (`docs/OPERATIONS.md`) |
| Billing records | As the merchant of record and the law require | Paddle |
| Audit log | Append-only while the org exists; deleted with it | Org deletion |

Rules:
- Never restore a deleted organization from a backup, except after an attacker deleted it, with the
  verified owner's agreement and counsel's (RUNBOOK §7).
- After any restore, re-run deletions that happened after the backup.
- Do not keep backups longer than 30 days without changing the privacy policy.

## 2. Seller Books (gaps before launch)

Records are tied to the organization with `ON DELETE CASCADE`
(`apps/seller-books/src/worker/db/schema/books.ts`), and users can delete individual imports and
entries. There is **no self-service export or organization deletion yet**. Until there is, the owner
handles requests by hand within 30 days: export with a tenant-filtered query, delete the
`organization` row (cascade), confirm to the customer. Build the self-service endpoints before launch
(follow-up in [../README.md](../README.md)).

## 3. Requests from customers

- Export, correction and deletion are self-service in grants. Anything else (for example a request to
  remove a suppressed address) goes to the customer contact address and is answered within 30 days.
- Under a signed DPA, the customer is the controller: we act on its instructions and help it answer
  its own data subjects (DPA template, Clause 4).
