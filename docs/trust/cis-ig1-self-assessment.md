# CIS Controls IG1 self-assessment

**Self-assessment by the company, 2026-11-24. Not an audit, not a certification.**

Implementation Group 1 (IG1) is the CIS Controls' baseline for small organizations. This assessment
covers Maris Stella Labs LLC: one owner, AI agents writing code, all hosting on Cloudflare, and the
owner's own devices.

**About the list.** The research step could not open cisecurity.org (network policy). The safeguard IDs
below are the 56 IG1 safeguards of **CIS Controls v8**, written from memory; a search summary said v8.1
is current (18 controls, 153 safeguards) but gave no IG1 list. The CIS Controls are published under a
Creative Commons licence that, per that summary, forbids derivatives, so the titles below are **our
own short descriptions**, not CIS text. Before relying on this: download v8.1 from CIS (under its
licence), check each ID and its wording, and add or drop rows that changed.

Status: **Yes** (implemented, evidence cited) · **Partial** · **No** · **NA** (not applicable, reason
given) · **3P** (done by a provider for the infrastructure it runs) · **Confirm** (depends on
[OWNER-CONFIRM.md](OWNER-CONFIRM.md); counts as No until ticked).

## Summary

| Status | Count |
| --- | --- |
| Yes | 18 |
| Partial | 14 |
| No | 10 |
| Confirm | 10 |
| NA / 3P | 4 |
| **Total** | **56** |

The biggest gaps: no security awareness routine (control 14), no automated dependency patching or
scanning (7.4), backups not isolated from production (11.4), and device controls not yet confirmed
(3.6, 4.3, 4.5, 10.x).

## 1. Inventory of enterprise assets

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 1.1 | Keep a detailed asset inventory | Partial | Cloud resources listed per environment (`apps/grants/docs/RUNBOOK.md`, resource table; `wrangler.jsonc` files). Devices: Confirm §2 |
| 1.2 | Deal with unauthorised assets | Partial | No unmanaged infrastructure (everything is IaC); device side not covered |

## 2. Inventory of software assets

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 2.1 | Keep a software inventory | Yes | `pnpm-lock.yaml`, `package.json` files; services in `docs/trust/subprocessors.md` |
| 2.2 | Use only supported software | Partial | Node 22, current Wrangler, `compatibility_date` set; no end-of-life check |
| 2.3 | Deal with unauthorised software | Yes | No dependency added without the owner's approval; `--frozen-lockfile` everywhere (CLAUDE.md, workflows) |

## 3. Data protection

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 3.1 | Data management process | Yes | `apps/grants/docs/DATA_POLICY.md`, `policies/data-retention-and-deletion.md` |
| 3.2 | Data inventory | Yes | DATA_POLICY "Where data lives"; DPA Annex I.B |
| 3.3 | Data access control lists | Yes | Org-scoped queries, roles, cross-tenant tests (`policies/access-control.md` §3) |
| 3.4 | Data retention | Yes | Retention sweep, export expiry, backup roll-off (`policies/data-retention-and-deletion.md`) |
| 3.5 | Secure data disposal | Yes | `privacy.delete_org` deletes rows, files and vectors (`apps/grants/src/worker/services/privacy/deletion.ts`). Seller Books: manual until built |
| 3.6 | Encrypt data on end-user devices | Confirm | Full-disk encryption: §2 |

## 4. Secure configuration

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 4.1 | Secure configuration process | Yes | IaC (`wrangler.jsonc`, `scripts/provision.mjs`), security headers module, `preview_urls: false` |
| 4.2 | Secure configuration of network infrastructure | 3P | No network equipment; Cloudflare runs the network |
| 4.3 | Automatic session locking on devices | Confirm | §2 |
| 4.4 | Firewall on servers | NA | No servers: Workers are serverless; only `/api/*` reaches code (`run_worker_first`) |
| 4.5 | Firewall on end-user devices | Confirm | §2 |
| 4.6 | Manage assets and software securely (IaC, secure protocols) | Yes | All changes through Git and workflows; HTTPS only |
| 4.7 | Manage default accounts | Yes | No default accounts; `AUTH_SECRET` / `INTERNAL_API_TOKEN` generated per deployment (`grants-deploy.yml`) |

## 5. Account management

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 5.1 | Inventory of accounts | Partial | Secrets inventory exists (`docs/security/secrets-inventory.yaml`); human/app accounts: Confirm §3 |
| 5.2 | Unique passwords | Confirm | Password manager: §1 |
| 5.3 | Disable dormant accounts | Partial | Six-monthly review rule (`access-control.md` §5); first review pending |
| 5.4 | Admin rights only on dedicated admin accounts | No | One person uses one account per provider for everything; acceptable at this size, recorded as a gap |

## 6. Access control management

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 6.1 | Process for granting access | Yes | `access-control.md` §5 |
| 6.2 | Process for revoking access | Yes | `access-control.md` §5 (same day) |
| 6.3 | MFA on externally exposed applications | No | Customers cannot use MFA in either product yet; operator accounts: Confirm §1 |
| 6.4 | MFA for remote network access | NA | No VPN or private network |
| 6.5 | MFA for administrative access | Confirm | §1, and Cloudflare Access on the admin console §5 |

## 7. Continuous vulnerability management

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 7.1 | Vulnerability management process | Partial | `secure-development.md` §3; no scanning yet |
| 7.2 | Remediation process | Partial | Fixes go through PRs; no target times |
| 7.3 | Automatic OS patching | Confirm | Servers: 3P (Cloudflare). Devices: §2 |
| 7.4 | Automatic application patching | No | No Dependabot or update bot; dependencies updated by hand |

## 8. Audit log management

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 8.1 | Audit log process | Yes | `apps/grants/docs/OPERATIONS.md` "Logs"; `audit_log` (`DATA_POLICY.md`) |
| 8.2 | Collect audit logs | Yes | Workers Logs (`observability.enabled`), app audit log. Seller Books has request logs but no audit log |
| 8.3 | Enough log storage | Partial | Workers Logs retention per plan (Confirm §5); no long-term store (no Logpush) |

## 9. Email and web browser protections

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 9.1 | Supported browsers and email clients only | Confirm | §2 (OS/browser updates) |
| 9.2 | DNS filtering | No | Not used on the owner's devices |

## 10. Malware defences

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 10.1 | Anti-malware software | Confirm | Devices: §2 |
| 10.2 | Automatic anti-malware updates | Confirm | As 10.1 |
| 10.3 | Disable autorun of removable media | Confirm | As 10.1 |

## 11. Data recovery

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 11.1 | Data recovery process | Yes | `policies/backup-and-recovery.md`, RUNBOOK §12 |
| 11.2 | Automated backups | Partial | D1 nightly export + Time Travel (runs: Confirm §5); **no backup of uploaded files**; Seller Books has no export job |
| 11.3 | Protect recovery data | Partial | Dumps kept out of the repository and logs redact the download URL; backups sit in a bucket the Worker can write unless `GRANTS_BACKUP_BUCKET` is set |
| 11.4 | Isolated copy of recovery data | No | Backups are in the same Cloudflare account; no offline or second-provider copy |

## 12. Network infrastructure management

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 12.1 | Keep network infrastructure up to date | 3P | Cloudflare's network |

## 14. Security awareness and skills training

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 14.1 | Security awareness programme | No | One person; no routine yet. Proposal: one hour a quarter on the topics below, logged |
| 14.2 | Recognising social engineering | No | |
| 14.3 | Authentication good practice | Partial | MFA and password-manager rules in `access-control.md` §2 |
| 14.4 | Data handling good practice | Partial | Dump handling rules (RUNBOOK §12), no-content-in-logs rule |
| 14.5 | Causes of accidental data exposure | No | |
| 14.6 | Recognising and reporting incidents | Partial | `policies/incident-response.md` |
| 14.7 | Recognising missing security updates | No | |
| 14.8 | Risks of insecure networks | No | |

## 15. Service provider management

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 15.1 | Inventory of service providers | Yes | `docs/trust/subprocessors.md`; vendor policy |

## 17. Incident response management

| ID | Our description | Status | Evidence / gap |
| --- | --- | --- | --- |
| 17.1 | Named person for incident handling | Yes | The owner (`policies/incident-response.md`) |
| 17.2 | Contact details for reporting incidents | Partial | Provider contacts known; public security contact not published (Confirm §7) |
| 17.3 | Process for reporting incidents | Yes | `policies/incident-response.md` §2–4 |
