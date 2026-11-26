# CMMC Workspace (`apps/cmmc`)

Helps small defense/aerospace machine shops **prepare** CMMC Level 1 and Level 2 self-assessment documents:
per-requirement implementation status, owners, notes and evidence; a System Security Plan (SSP); a POA&M with due
dates; and the DoD Assessment Methodology score to enter in SPRS. Same stack and conventions as `apps/grants`
(Cloudflare Worker + Hono + D1/Drizzle + R2 + React SPA, Better Auth, `ctx.llm` with FakeLlm).

## What it is not

- **Not a certification, not a C3PAO, not government-endorsed.** It produces self-assessment *working documents*.
  The organization's affirming official makes the self-assessment and affirmation in SPRS; the app never submits
  anything and never determines a CMMC status. Every page and generated document says so.
- **Not a CUI enclave.** Do not store Controlled Unclassified Information here. Evidence uploads require the
  uploader to attest the file contains no CUI. Upload policies, procedures and redacted screenshots.
- **Not a substitute for reading the sources.** The control library was checked word for word against NIST
  SP 800-171 Rev. 2, SP 800-171A, FAR 52.204-21 and 32 CFR 170.24 on 2026-11-25, and a unit test keeps it equal
  to them ([docs/SOURCES.md](docs/SOURCES.md)), but the regulations govern, not this app.
- **Not on sale yet.** Plans, checkout and limits exist but ship dark until the owner sets the Paddle
  secrets ([docs/BILLING.md](docs/BILLING.md)).

## Features

| Area | What it does |
| --- | --- |
| Control library | Level 1: 15 requirements of FAR 52.204-21(b)(1). Level 2: 110 NIST SP 800-171 Rev. 2 requirements with all 320 SP 800-171A objectives and DoD point values — static data in `src/shared/controls/`. |
| Per control | Status (not assessed / not implemented / partially / implemented / N/A), partial credit for 3.5.3 and 3.13.11, owner, notes, per-objective met/not met, accepted implementation statement. |
| Spreadsheet import | "Import CSV" on the Controls page: an existing self-assessment sheet saved as CSV. Requirement ids found by contents (AC.L2-3.1.1, 3.1.1, AC.L1-b.1.i, (b)(1)(i)); status, owner e-mail, notes and implementation statement by header. Preview first, then apply; blank cells never overwrite, unreadable rows are listed by line. Applying Level 2 needs the Level 2 plan. |
| Evidence | Uploads to R2 at `orgs/{orgId}/evidence/{id}`; 25 MB, PDF/image/text/CSV/DOCX/XLSX only; SHA-256 recorded; downloads are `attachment` with a sandbox CSP. |
| Score | 110 minus 5/3/1 per unmet requirement (range 110 to −203); no score without an SSP (3.12.4). Level 1 is pass/fail. |
| POA&M | Items with due dates, overdue flag, and live eligibility under 32 CFR 170.21 (score ≥ 88, 1-point items only, the six excluded requirements, 180-day closeout). CSV export with formula-injection guard. |
| SPRS affirmations | A record of each affirmation the affirming official enters in SPRS (32 CFR 170.22): level, why (after a self-assessment, annual, after a POA&M closeout), Final or Conditional status and its date, the score entered beside the score the workspace computed that day, and the official's name, title and contact. The Affirmations tab and the dashboard show when the next annual affirmation, the next self-assessment (Level 1 yearly, Level 2 every three years, § 170.15/170.16) and a Conditional status's 180-day closeout fall due, amber within 60 days and red when past. Admins and owners get a reminder email 60 and 7 days before each date, with a one-click stop link. Admins record and delete; Level 2 records need the Level 2 plan. Nothing is submitted to SPRS. Rules quoted in `src/shared/affirmation.ts`. |
| ISO 9001 checklist | The 47 requirement clauses of ISO 9001:2015 (4.1 to 10.3), each with status (not assessed / gap / partly in place / in place / not applicable), owner, notes and evidence. Evidence is shared, not re-uploaded: files on a related CMMC requirement (a training record on AT.L2-3.2.2 for 7.2, an internal audit on CA.L2-3.12.1 for 9.2) show under the clause, and any file the org holds can be linked to a clause. Not applicable needs a reason (the scope statement must give one). Readiness by section, clauses marked in place with no file, open clauses nobody owns, a dashboard card, and a Markdown gap report with an Owner column. Clause numbers and headings only, no ISO text; prompts are the app's own wording. Every member reads it; recording needs Level 2 + Quality. `src/shared/quality/`. |
| SSP | Markdown generated from the system profile and **accepted** statements only. |
| AI drafting | `POST /controls/:id/draft` via `ctx.llm` (purpose `cmmc.implementation_statement`). Uses only the org's notes and profile; unknowns become `[CONFIRM: …]`; numbers not in the inputs are flagged. Saved as an unreviewed draft that a person must edit/accept before it reaches the SSP. |
| Billing | Level 1 free; Level 2 $249 and Level 2 + Quality $399 a month through Paddle (dark). Limits: Level 2 recording, seats, AI drafts a month, evidence storage; reading and downloads never limited. On the free plan the Controls page shows Level 2 read only (requirements, objectives, anything already recorded) with a "See Level 2 plans" button for admins, instead of forms that fail with a 402. [docs/BILLING.md](docs/BILLING.md). |
| Legal | Terms, Privacy, Refund and Acceptable Use drafts (`docs/legal/`, counsel review pending) at `/legal/:key`; every user accepts the current version before the workspace opens, and creating an org is refused until then. |
| Tenancy | Every org route behind `requireOrg()` (404 for non-members), every query filtered by `tenant.orgId`, roles owner/admin/editor/viewer, audit log. |

Model: `claude-haiku-5-5` by default (`LLM_MODEL` in `wrangler.jsonc`), per the repo rule to use the cheapest
model that does the job; move `cmmc.implementation_statement` up only when an eval shows Haiku gets it wrong.

## Commands (from `apps/cmmc`)

```
pnpm typecheck · pnpm test:unit · pnpm test:worker · pnpm build
cp .dev.vars.example .dev.vars && pnpm db:migrate:local && pnpm dev   # offline, FakeLlm
node --test scripts/provision.test.mjs                                  # deploy provisioning
```

Deploy: the `cmmc-deploy` workflow, by hand only, provisions D1 and R2, migrates, syncs the Paddle
catalog and smoke-tests `/api/health` ([docs/DEPLOY.md](docs/DEPLOY.md)). It has not run yet.

## API (all JSON; `/api/orgs/:orgId/*` is tenant-scoped)

- `GET /api/health` (`billing`, `email`), `ALL /api/auth/*` (Better Auth email+password, email verification and password reset: [docs/EMAIL.md](docs/EMAIL.md)), `GET /api/me` (with `legal`), `POST /api/me/legal/accept {version}`, `GET|POST /api/orgs` (POST needs the current legal version accepted)
- Public: `GET /api/legal`, `GET /api/legal/:key` (terms, privacy, refunds, acceptable-use)
- `GET /` (org, role, profile and the plan whose limits apply) · `PATCH /profile` (admin)
- `GET /members` · `POST /members {email, role}` · `PATCH|DELETE /members/:memberId` (admin)
- `GET /controls?level=1|2` · `GET /controls/:controlId` · `PATCH /controls/:controlId` (editor)
- `POST /controls/import {level, csv, apply}` (editor; preview when `apply` is false, Level 2 apply needs the Level 2 plan)
- `POST /controls/:controlId/draft` · `POST /controls/:controlId/draft/accept {statement?}` (editor)
- `GET /evidence?controlId=` · `POST /evidence` multipart `file, title?, controlId?, noCui=true` · `GET /evidence/:id/download` · `DELETE /evidence/:id`
- `GET /poam` · `POST /poam` · `PATCH|DELETE /poam/:id` · `GET /poam/export.csv`
- `GET /billing` · `POST /billing/checkout {plan, interval}` · `POST /billing/portal` (admin); public `GET /api/billing/plans`, `POST /api/billing/webhook`
- `GET /affirmations` (records plus each level's due dates) · `POST /affirmations` · `DELETE /affirmations/:id` (admin) · `GET|PUT /affirmations/reminders {on}` (the member's own reminder email switch); public `GET|POST /api/unsubscribe/affirmation-reminders?o=&u=&t=` (signed stop link)
- `GET /quality` (clauses, evidence, readiness) · `GET /quality/report` (Markdown) · `PATCH /quality/:clauseId` · `POST /quality/:clauseId/evidence {evidenceId}` · `DELETE /quality/links/:linkId` (editor; recording needs Level 2 + Quality)
- `GET /score?level=` · `GET /ssp?level=` · `GET /ssp/download?level=` · `GET /audit-log` (admin)

See also [ROADMAP.md](ROADMAP.md), [docs/BILLING.md](docs/BILLING.md), [docs/SECURITY.md](docs/SECURITY.md) and [docs/SOURCES.md](docs/SOURCES.md).
