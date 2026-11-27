# Incident response policy

| | |
| --- | --- |
| Applies to | Every product and account of Maris Stella Labs LLC |
| Owner | The company owner; acts as incident lead for every incident |
| Reviewed | 2026-11-24 · next review by 2027-05-24, and after every SEV1/SEV2 |

The detailed playbooks are in `apps/grants/docs/RUNBOOK.md`. This policy is the short version that
applies to every product, including the ones that have no runbook yet.

## 1. What counts

A security incident is any event that might have exposed, changed or destroyed customer data or
credentials, or let someone use our systems without permission: a leaked secret, one organization
seeing another's data, an account takeover, a lost device with access, a provider telling us they had
a breach that touches our data.

Severity (from RUNBOOK.md):

| | Examples | Updates |
| --- | --- | --- |
| SEV1 | Site down, data loss, **any** cross-tenant exposure, a leaked credential | Every 30 min in the incident record |
| SEV2 | A core flow broken, spend out of control, a failed restore drill | Every 30 min |
| SEV3 | Degraded or delayed | As needed |

## 2. How we hear about it

- Monitoring: `grants-monitor.yml` probes health; Workers Logs and the alerts in
  `apps/grants/docs/MONITORING.md`.
- Reports from customers and researchers: the security contact in the vulnerability disclosure
  policy. *(Address not published yet: OWNER-CONFIRM.md §7.)*
- Providers' notices (Cloudflare, Anthropic, Paddle, GitHub, email provider).

## 3. Steps

1. **Record.** Open a private incident record (not a GitHub issue: issues are visible to every repo
   reader). Start a UTC timeline of every action.
2. **Contain.** Roll back the deploy, revert the feature, rotate the credential (RUNBOOK §8: update the
   GitHub secret first, then the Worker, then revoke at the provider), or turn on the LLM kill switch
   (`apps/grants/docs/OPERATIONS.md`, "Kill switch").
3. **Preserve evidence** before cleanup: stop backup pruning, bookmark D1 Time Travel, export the audit
   log and the relevant log lines, hash each evidence file (RUNBOOK §9, "Preserve evidence").
4. **Scope.** Which organizations, records, users and time window. Decide with counsel whether
   personal data was involved.
5. **Notify** (§4).
6. **Recover** from backups if needed (backup and recovery policy).
7. **Review** within 14 days: what happened, why, what changes; add a regression test (a cross-tenant
   exposure always gets one).

AI agents may help with diagnosis and fixes in their own sessions, but they get no production
credentials (access control policy §1); the owner runs anything that touches production.

## 4. Notification

- Customers: owners of affected organizations, by email, **as required by law**
  (`apps/grants/docs/legal/privacy.md`). Internal target for a confirmed cross-tenant exposure: 72 hours
  from discovery (RUNBOOK §9). Where a signed DPA applies, its deadline wins (the template says
  "without undue delay").
- Content: what happened, which data, the time window, what we did, what they should do, a contact.
- Regulators and individuals: as the applicable law requires. State breach laws differ; New Mexico's
  rule in RUNBOOK §9 is marked "verify with counsel". *(OWNER-CONFIRM.md §7.)*
- Providers: open a ticket with any subprocessor involved.

## 5. Testing

Walk through one scenario a year (a leaked token is the most likely) as a tabletop exercise and
record it in the incident log. The monthly restore drill (backup and recovery policy) also counts as
practice; a failed drill is a SEV2.
