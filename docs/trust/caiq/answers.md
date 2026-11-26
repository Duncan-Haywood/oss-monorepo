# CAIQ answer bank: Grant Autopilot

Our own wording, by CCM domain (see [README.md](README.md) for why there is no CSA question text and
no question IDs). Reviewed against the code on 2026-11-24.

Legend: **Yes** / **Partial** / **No** / **NA** · Owner: **CSP** (us), **CSC** (the customer),
**Shared**, **3P** (outsourced to a provider, named) · **Confirm** = depends on an
[OWNER-CONFIRM.md](../OWNER-CONFIRM.md) item; answer Yes only after it is ticked.

Paths without a prefix are under `apps/grants/`.

## A&A: Audit and assurance

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Audit and assurance policy | Partial | CSP | Policies adopted 2026-11-24 in `docs/trust/policies/`; no audit programme |
| Independent assessments / third-party audits | **No** | CSP | None held or performed. Providers publish their own reports for their services (Cloudflare, Anthropic, Paddle); they do not cover us |
| Risk-based audit planning | No | CSP | — |
| Requirements compliance (legal, contractual) | Partial | CSP | Privacy policy and data use policy drafts (`docs/legal/`), not yet reviewed by counsel (*Confirm* §7) |
| Remediation of findings | Partial | CSP | Gaps tracked as `not_in_place` on the trust page and in `docs/trust/README.md` follow-ups |

## AIS: Application and interface security

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Application security policy and baseline | Yes | CSP | `docs/trust/policies/secure-development.md`, root `CLAUDE.md`, `docs/ARCHITECTURE.md` |
| Security testing in the SDLC | Yes | CSP | Unit, workerd integration (incl. cross-tenant per router), e2e, fake-LLM evals on every PR: `.github/workflows/grants-ci.yml` |
| Automated deployment pipeline | Yes | CSP | `.github/workflows/grants-deploy.yml` (checks, migrations, deploy, smoke test) |
| Static analysis / dependency scanning | Partial | CSP | Biome lint and strict TypeScript; **no** dependency vulnerability or secret scanning in CI |
| Input validation, output encoding, headers | Yes | CSP | Request limits and schema validation (`src/worker/middleware/request-limits.ts`), CSP/HSTS/Origin check (`src/worker/middleware/security.ts`) |
| API authentication and authorisation | Yes | CSP | Session auth (Better Auth), per-org role checks (`src/worker/middleware/tenant.ts`), signed webhooks (Paddle, Slack) |
| Vulnerability remediation in applications | Partial | CSP | Fixed through the normal PR flow; no SLA defined |

## BCR: Business continuity and operational resilience

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Business continuity plan | Partial | CSP | Incident runbook (`docs/RUNBOOK.md`) and backup policy; no formal BCP; single-person company is a key-person risk |
| Risk assessment / impact analysis | No | CSP | — |
| Backups | Yes (*Confirm*) | Shared/3P Cloudflare | D1 Time Travel 30 days + nightly export to R2, newest 30 (`docs/RUNBOOK.md` §12, `.github/workflows/grants-backup.yml`). Uploaded files have **no** backup (*Confirm* §5 for plan and runs) |
| Restore testing | Partial (*Confirm*) | CSP | Monthly drill documented (RUNBOOK §12); whether run: §5 |
| Recovery objectives | Partial | CSP | Internal targets in `backup-and-recovery.md` §2; not contractual |
| Redundancy of infrastructure | 3P | Cloudflare | Serverless on Cloudflare; no multi-provider failover |
| Customer data export for their own continuity | Yes | CSC | Self-service export (`docs/DATA_POLICY.md`, "Export") |

## CCC: Change control and configuration management

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Change management policy | Yes | CSP | `docs/trust/policies/change-management.md` |
| Changes tested and approved before production | Yes (*Confirm* branch protection) | CSP | PR + CI; deploy re-runs checks (`grants-deploy.yml` "Checks") except the documented hotfix lane |
| Infrastructure as code / baseline configuration | Yes | CSP | `wrangler.jsonc`, `migrations/`, `scripts/provision.mjs`, `email-sending.json` |
| Unauthorised change detection | Partial | CSP | Git history and deploy versions (`wrangler deployments list`); dashboard changes not monitored |
| Emergency changes | Yes | CSP | Hotfix lane + follow-up PR rule (`change-management.md` §5) |
| Rollback | Yes | CSP | `wrangler rollback` (`docs/DEPLOY.md`, "Rollback") |

## CEK: Cryptography, encryption and key management

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Encryption in transit | Yes | Shared/3P Cloudflare | HTTPS only; HSTS on API responses (`src/worker/middleware/security.ts`); TLS terminated by Cloudflare |
| Encryption at rest | *Confirm* | 3P Cloudflare | Provider-managed encryption for D1/R2 per Cloudflare's docs (§6, not yet verified) |
| Application-level encryption of sensitive fields | Yes | CSP | Integration webhook URLs: AES-256-GCM, HKDF-SHA-256 key, org/row-bound additional data (`src/worker/services/integrations/crypto.ts`) |
| Password storage | Yes | CSP | PBKDF2-SHA-256, 100k iterations, random salt (`src/worker/services/auth/password.ts`) |
| Key management and rotation | Partial | CSP | Keys are Worker/GitHub secrets (`docs/security/secrets-inventory.yaml`); manual rotation procedure (RUNBOOK §8); `INTEGRATIONS_KEY` rotation has no re-encryption step |
| Customer-managed keys | No | — | Not offered |

## DCS: Datacenter security

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Physical and environmental security of facilities | 3P | Cloudflare | We operate no servers or facilities; all hosting is Cloudflare |
| Asset and media disposal in facilities | 3P | Cloudflare | Provider's responsibility |
| Our own premises | NA | CSP | No office; the owner works from personal premises (device controls under UEM) |

## DSP: Data security and privacy lifecycle

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Data inventory and flows | Yes | CSP | `docs/DATA_POLICY.md` ("Where data lives"), `docs/trust/subprocessors.md` |
| Data classification | Partial | Shared | Customers can mark facts `restricted`; restricted facts never reach drafting prompts (`docs/DATA_POLICY.md`) |
| Privacy by design / minimisation | Yes | CSP | Hashed IPs, no content in logs or queue messages, chat messages carry counts and titles only (`docs/INTEGRATIONS.md`) |
| Retention and deletion | Yes | CSP | Org deletion, retention sweep, export expiry (`docs/trust/policies/data-retention-and-deletion.md`) |
| Data subject requests | Yes | Shared | Self-service export/correction/deletion; controller is the customer under a DPA |
| Consent for optional processing | Yes | CSC | Org-level consents for website crawl, voice recording, autopilot (`docs/DATA_POLICY.md`) |
| Data location / residency | Partial (*Confirm*) | 3P | No region pinned in `wrangler.jsonc`; actual region §5 |
| Use of data for model training | Yes (not used) | CSP/3P | We do not train models; Anthropic commercial API terms (*Confirm* §6 for the current wording) |
| Disclosure to authorities | Partial | CSP | Data use policy allows access "to comply with the law"; no law-enforcement request process written |

## GRC: Governance, risk and compliance

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Security policies, approved and reviewed | Yes | CSP | `docs/trust/policies/` (8 policies), each with a review date |
| Risk management programme / risk register | No | CSP | — |
| Exceptions process | Partial | CSP | Gaps are recorded as `not_in_place` on trust pages |
| Roles and responsibilities | Yes | CSP | One owner holds every role (stated in each policy) |
| Special interest groups / threat information | No | CSP | — |

## HRS: Human resources

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Background screening | NA | CSP | No employees besides the owner |
| Employment agreements / confidentiality | NA | CSP | No employees; contractors would sign one before access (`access-control.md` §5) |
| Security awareness training | No | CSP | — |
| Offboarding / return of assets | Yes | CSP | Same-day access removal rule (`access-control.md` §5) |
| Clean desk / remote work | Partial (*Confirm*) | CSP | Device controls §2 |

## IAM: Identity and access management

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Access control policy | Yes | CSP | `docs/trust/policies/access-control.md` |
| Least privilege / role-based access (customers) | Yes | Shared | Roles owner/admin/editor/reviewer/viewer (`src/shared/enums.ts`); customers assign them |
| Tenant isolation | Yes | CSP | Org filter on every query, `orgs/{orgId}/` R2 prefix, per-org Vectorize namespace; cross-tenant tests (`test/worker/tenant.test.ts`) |
| MFA for privileged (operator) access | *Confirm* | CSP | §1 |
| MFA for customer users | **No** | — | Not offered yet |
| Privileged access to production | Partial (*Confirm*) | CSP | Admin console needs an allow-listed email plus Cloudflare Access when configured (`docs/AUTH.md`, §5) |
| Access reviews | Partial | CSP | Six-monthly review rule (`access-control.md` §5); first review pending |
| Password policy | Yes | CSP | Minimum 10 characters, verified email in production, 14-day sessions, reset revokes sessions (`src/worker/services/auth/auth.ts`) |
| Credential and secret handling | Yes | CSP | `docs/security/secrets-inventory.yaml`; no secrets in code |

## IPY: Interoperability and portability

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Data export in a usable format | Yes | CSC | JSON per table + original files in a zip (`docs/DATA_POLICY.md`, "Export") |
| Documented APIs | Partial | CSP | `docs/api/`; no public API for customers |
| Secure transfer of exports | Yes | CSP | HTTPS download, admin+ only, expires after 7 days |
| Contract terms on portability at exit | Partial | CSP | Data use policy (draft); DPA template Clause on return/deletion |

## IVS: Infrastructure and virtualisation security

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Hypervisor / host / network hardening | 3P | Cloudflare | Serverless Workers; no VMs or networks we operate |
| Segmentation between environments | Yes | CSP | Separate production and demo Worker, D1, R2, Vectorize, queues (RUNBOOK resource table); `preview_urls: false` |
| Capacity and resource planning | Partial | CSP | Rate limits, LLM spend caps (`docs/OPERATIONS.md`); performance notes (`docs/PERFORMANCE.md`) |
| Network protection (DDoS, bots) | Shared/3P | Cloudflare | Cloudflare network; Turnstile on auth forms when configured (*Confirm* §5) |

## LOG: Logging and monitoring

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Logging policy and what is logged | Yes | CSP | One JSON line per request with route, status, ids; never bodies, raw paths or IPs (`docs/OPERATIONS.md`, "Logs") |
| Audit log of consequential actions | Yes | CSP | Append-only `audit_log` (`docs/DATA_POLICY.md`) |
| Log retention and protection | Partial (*Confirm*) | 3P Cloudflare | Workers Logs retention per plan (§5); no Logpush / long-term store (`wrangler.jsonc` comment) |
| Monitoring and alerting | Partial | CSP | `grants-monitor.yml` health probes; suggested alerts in `docs/MONITORING.md` (whether enabled: §5) |
| Clock synchronisation | 3P | Cloudflare | Platform time |
| Encryption-key and access-event logging at provider level | 3P | Cloudflare/GitHub | Providers' audit logs; reviewed after incidents (RUNBOOK §8) |

## SEF: Security incident management, e-discovery and cloud forensics

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Incident response policy and plan | Yes | CSP | `docs/trust/policies/incident-response.md`, `docs/RUNBOOK.md` |
| Severity levels and escalation | Yes | CSP | SEV1–3 (RUNBOOK) |
| Customer notification | Yes | CSP | As required by law; internal 72 h target for cross-tenant exposure (RUNBOOK §9) |
| Evidence preservation / forensics | Yes | CSP | RUNBOOK §9 "Preserve evidence" (hashes, Time Travel bookmark, log export) |
| Incident response testing | Partial | CSP | Annual tabletop rule; monthly restore drill; none recorded yet |
| Security contact for reports | *Confirm* | CSP | Not published yet (§7); `vulnerability-disclosure.md` ready |

## STA: Supply chain management, transparency and accountability

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Shared responsibility model documented | Partial | CSP | This bank's Owner column and the trust page; no standalone SSRM document |
| Supplier inventory | Yes | CSP | `docs/trust/subprocessors.md` |
| Supplier risk review before onboarding | Yes | CSP | `docs/trust/policies/vendor-management.md` §2 |
| Supplier agreements / DPAs | *Confirm* | CSP | Providers' DPAs accepted (§6) |
| Periodic supplier review | Partial | CSP | Annual rule (`vendor-management.md` §3); first review pending |
| Customer DPA available | Partial | CSP | Template in `docs/trust/dpa/`, pending legal review |

## TVM: Threat and vulnerability management

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Vulnerability management policy | Partial | CSP | `secure-development.md` §3 lists the gaps |
| Dependency / vulnerability scanning | **No** | CSP | Not set up (Dependabot alerts: *Confirm* §4) |
| Penetration testing | **No** | CSP | None performed |
| Vulnerability disclosure programme | Partial | CSP | Policy written, not published (needs contact §7) |
| Malware protection | 3P/NA | Cloudflare | Serverless; uploads are parsed, never executed; stored downloads served with a sandbox CSP (`src/worker/middleware/security.ts` comment) |
| Patch management of dependencies | Partial | CSP | Lockfile-pinned, updated through PRs; no cadence defined |

## UEM: Universal endpoint management

| Topic | Answer | Owner | Implementation / evidence |
| --- | --- | --- | --- |
| Endpoint inventory | *Confirm* | CSP | §2 (one laptop, one phone expected) |
| Disk encryption, screen lock, OS updates | *Confirm* | CSP | §2 |
| Anti-malware on endpoints | *Confirm* | CSP | §2 |
| Mobile device management | No | CSP | Not used |
| Remote wipe / lost device | Partial | CSP | Lost device = incident; rotate credentials (incident response policy) |

## Seller Books differences

D1 only (no R2, Vectorize, LLM, email or billing); no email verification, no audit log, no export or
org-deletion endpoint, no backup job. Answer the corresponding rows **No** for Seller Books until those
exist (`packages/trust-page/src/profiles/seller-books.ts`).
