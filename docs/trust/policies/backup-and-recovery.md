# Backup and recovery policy

| | |
| --- | --- |
| Applies to | Every product's production data |
| Owner | The company owner |
| Reviewed | 2026-11-24 · next review by 2027-05-24 |

## 1. What is backed up today

### Grant Autopilot (live)

From `apps/grants/docs/RUNBOOK.md` §12 and `.github/workflows/grants-backup.yml`:

| Data | Backup | Recovery point | Kept |
| --- | --- | --- | --- |
| D1 database | Cloudflare D1 Time Travel (automatic on Workers Paid) | Any minute | 30 days |
| D1 database | Nightly `wrangler d1 export` at 09:43 UTC → gzip → R2 `backups/d1/` | 24 h | Newest 30 copies |
| D1 before a migration | Manual Time Travel bookmark | The migration | 30 days |
| R2 files (uploads, audio, exports, submission packages) | **None** | — | — |
| Vectorize index | Rebuilt from D1 (reprocess) | — | — |
| Secrets | Owner secrets in GitHub; generated ones are write-only | — | Lost = rotate |

*(Whether the plan is Workers Paid and whether nightly runs are green: OWNER-CONFIRM.md §5.)*

Known gaps, stated on the trust page:
- **R2 has no backup copy.** A deleted upload is gone; the extracted text stays in D1 and the customer
  can upload again (RUNBOOK §7). Versioning or a second bucket would conflict with real deletion of an
  organization's files, so any fix must still honour deletion.
- The backups live in the same Cloudflare account, and by default in the same bucket the Worker can
  write to. RUNBOOK §12 recommends a dedicated bucket with a 45-day lifecycle rule.

### Seller Books (not yet live)

One D1 database. Time Travel depends on the plan at launch. **No nightly export yet**: add one
(copy `grants-backup.yml`) before the first paying customer.

### Marketing sites

Early-access lists in D1; Time Travel only. Acceptable: the data is an email list that can be rebuilt
from confirmations.

## 2. Targets

| Product | Recovery point objective | Recovery time objective |
| --- | --- | --- |
| Grant Autopilot | Minutes (Time Travel); 24 h if Time Travel is unavailable | 4 h for the database |
| Others | Set at launch | Set at launch |

These are targets, not promises to customers; nothing contractual refers to them.

## 3. Rules

- A dump holds every tenant's data. Download it only for a drill or an incident, keep it outside the
  repository (the backup script refuses a path inside the checkout), delete it afterwards.
- Do not keep backups longer than 30 days without changing the privacy policy: deleted organizations
  live on in backups for that long, and the privacy policy says backups "roll off on their normal
  schedules".
- A restore brings deleted organizations back. After any restore, re-run their deletions (RUNBOOK §7).

## 4. Testing

- **Monthly restore drill** (RUNBOOK §12): restore the latest nightly export into a scratch database,
  check counts and the last migration, delete the scratch database. Record date, timings and problems.
  A failed drill is a SEV2. *(Whether it has been run: OWNER-CONFIRM.md §5.)*
- **Quarterly**: rehearse an in-place Time Travel restore and its undo on the demo database.
