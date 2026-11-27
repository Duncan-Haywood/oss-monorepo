# PayApps — Architecture (v0.1, in development)

PayApps does pay-application billing for specialty subcontractors (mechanical, electrical, plumbing,
drywall, steel, ...): a project's schedule of values, change orders, monthly billing with stored
materials and retainage, and an "application and certificate for payment" summary with a continuation
sheet as PDF and CSV. It is the first module of a contractor suite (see ROADMAP.md). It is not
deployed and not offered for sale yet.

**Not an AIA document.** PayApps computes the standard pay-application fields (the ones on AIA
G702/G703-style forms) in its own layout and wording. It does not reproduce AIA form text or layout,
and every export says it is not an AIA document and not affiliated with or endorsed by the AIA.

## Stack (same as apps/grants, trimmed to what the MVP needs)

| Concern         | Choice                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- |
| Runtime         | One Cloudflare Worker: Hono API at `/api/*` + static SPA assets                         |
| UI              | React 19 SPA, TanStack Router (code-based routes) + TanStack Query, Tailwind 4          |
| Relational data | D1 (SQLite) via Drizzle ORM. Every tenant row keyed by `org_id`, cascade from `organization` |
| Auth            | Better Auth (email + password, PBKDF2 hashing copied from apps/grants); email verification and password reset ([EMAIL.md](EMAIL.md)); our own org/member tables |
| Email           | `ctx.email` (`ports/email.ts`): Cloudflare Email Service via the `EMAIL` binding, an in-memory fake in tests and the demo, else logged only |
| Documents       | Dependency-free PDF writer (`services/export/pdf.ts`, standard Helvetica) + RFC 4180 CSV; dependency-free PDF reader (`src/shared/pdf/`) shared by the backup-packet merger (`services/export/pdf-merge/`) and the PDF schedule-of-values import |
| Billing         | `packages/billing` via `@billing`: Paddle or the signed fake, `null` when dark (`ports/billing.ts`); plans in `shared/plans.ts`; storage, limits and webhook in `services/billing.ts` ([BILLING.md](BILLING.md)) |
| Accounting      | `ctx.qbo` (`ports/accounting.ts`): QuickBooks Online via `packages/qbo-sync` (`@qbo-sync`), a fake company in tests and the demo, `null` while dark ([QUICKBOOKS.md](QUICKBOOKS.md)) |
| LLM             | None. Nothing in the MVP calls a model, so there is no `ctx.llm`/FakeLlm yet            |

No R2, queues or cron: exports are rendered on request from the database (cheap, always current).

## Code layout (`apps/payapps`)

```
src/shared/
  payapp-math.ts       THE pay-app math (pure). computeApplications(project, sov, changeOrders, periods)
  money.ts             cents/percent formatting and parsing
  retainage-release.ts release a % or $ of retainage across lines (largest remainder, never past held)
  estimate.ts          bids: cost lines -> bid items with markup by category and tax on material, add/deduct alternates;
                       the job (SOV lines and cost budgets) a won bid becomes (services/payapps/estimates.ts)
  price-list.ts        the company price list: items matched to estimate lines by category, description and unit
                       (priceKey), merges, list-price changes and search (services/payapps/price-list.ts)
  estimate-import.ts   cost lines from a bid sheet, quote or takeoff list (.xlsx, CSV, paste), read in the
                       browser into a preview; nothing guessed, every flag and skip has its reason
  sov-import/          SOV import from the contractor's .xlsx, CSV or PDF (browser-side, no upload): xlsx.ts (ZIP +
                       DecompressionStream), csv.ts, pdf.ts (rows and columns from positioned text, or a ruled table's cell borders and row rules), schedule.ts
                       (find the table, skip subtotals/totals/COs, checks), ocr.ts (a scan with no text layer: each page's
                       picture to an OCR engine passed in, its words laid on the page as text runs; the app's engine is
                       Tesseract in WebAssembly, client/lib/ocr.ts, served under /ocr/ by vite.config.ts)
  pdf/                 PDF reader (objects, filters, reader: xref, object streams, recovery) and text extraction
                       (text.ts: content-stream text operators, fonts.ts: ToUnicode, encodings, widths); pure, runs
                       in the browser and the Worker
  enums.ts             roles, statuses
  api/schemas.ts       zod request bodies (Worker validation + SPA types)
  api/types.ts         response DTOs
src/worker/
  index.ts / app.ts    fetch handler; app.ts only mounts routers + error handler
  context.ts           AppContext { env, db, billing, logger, now }
  db/schema/           auth.ts (Better Auth + organization/member), payapps.ts (domain)
  middleware/          context, security (headers + Origin check), session, tenant (requireOrg/requireRole),
                       auth-rate-limit (durable per-IP and per-account limits on /api/auth/*, in D1)
  routes/              auth, me, orgs; routes/org/* are tenant-scoped under /api/orgs/:orgId
  services/orgs.ts     orgs + members
  services/payapps/    bundle.ts (load + compute + DTOs), projects.ts (+SOV), change-orders.ts,
                       pay-apps.ts (workflow), documents.ts (export model)
  services/export/     pdf.ts (writer), application-pdf.ts (layout), csv.ts, model.ts,
                       pdf-merge/ (images, writer, packet: one PDF of a document + its backup; reads with src/shared/pdf)
  ports/billing.ts     BillingProvider from packages/billing (null while dark)
  services/billing.ts  plan limits, checkout, portal, webhook (docs/BILLING.md)
  ports/accounting.ts  QuickBooks gateway (real | fake | null); services/quickbooks.ts connect, send
                       a pay app as an invoice (shared/qbo-invoice.ts plans it); lib/token-box.ts
                       encrypts the tokens (docs/QUICKBOOKS.md)
src/client/            main.tsx, router.tsx, lib/, components/, pages/ (home, org, project, pay-app)
test/unit/             export tests (+ src/shared/*.test.ts for the math)
test/worker/           integration tests in workerd with a real local D1
migrations/            D1 migrations (drizzle-kit generate)
```

## Domain model

- **organization** (the subcontractor) → **member** (owner/admin/editor/viewer).
- **project**: one subcontract. GC, owner, architect, contract date, original contract sum, default
  retainage % on work and on stored materials (basis points: 1000 = 10%).
- **sov_line**: item number, description, original scheduled value. Optional unit pricing
  (migration 0055, `src/shared/unit-price.ts`): `unit`, `unit_price_micros` (millionths of a dollar)
  and, on base lines, `quantity_milli` (thousandths), with quantity × price equal to the scheduled
  value to the cent; a pay-app entry on such a line stores `quantity_this_period_milli` and its cents
  must equal quantity × price. The math in `payapp-math.ts` still sees only cents. The original SOV must total the
  contract sum before a pay app can be submitted. Lines created by a change order start at 0.
  Optional `retainage_pct_bps` (migration 0015): the line's own rate, held on its work and stored
  materials in every application whatever the application's rates (a bond line at 0%); null follows
  the application. Locked (409) once a non-draft application has anything completed, stored or held
  on the line (`retainageLockedLines` in `services/payapps/bundle.ts`), since a new rate would
  rewrite figures the GC already has.
- **change_order** + **change_order_item**: adjusts existing lines or creates new ones (negative
  amounts are deductions). `pending` → `approved` (with `approvedOn`) | `rejected`. An approved change
  order counts in every pay app whose `periodTo` is on/after `approvedOn`.
- **pay_app**: numbered 1..n per project, `periodFrom..periodTo`, its own retainage rates (inherited
  from the previous app, so a reduction to 5% carries forward). `draft` → `submitted` → `certified`
  (GC-certified amount, may differ) → `paid`.
- **pay_app_payment**: money received against a sent application (amount, `receivedOn`, reference).
  Expected = certified amount, else line 8. Payments may not exceed what is still owed; reaching it
  moves the application to `paid`; deleting a payment from a paid application reopens it
  (`certified` if certified, else `submitted`). `mark-paid` without payments means paid in full.
  Rules: `src/shared/payments.ts`.
- **opening application** (mid-job start, columns on project and `sov_line.opening_completed_cents`,
  `opening_released_cents`):
  the last application made before the job moved here. Its number (the first one here is the next),
  period end (change orders approved by then count as previous), line 6 (the first application's
  line 7), optional line 5a (checked, non-blocking `opening_retainage_differs`), and work completed
  to date per line (the first application's column D), and retainage already released per line
  (counted as released before the first application here). Changeable only while the project has no pay
  app; `PUT/DELETE /projects/:id/opening`.
- **pay_app_line**: per SOV line, this period's work, materials presently stored (a balance, not
  cumulative) and retainage released this period.

### The math (`src/shared/payapp-math.ts`)

Continuation sheet per line: C scheduled value (original + approved COs), D from previous application
(previous D + E), E this period, F stored materials, G = D + E + F, G/C, H = C − G, I retainage held =
round(rate × (D + E)) + round(stored rate × F) − retainage released to date, where both rates are
the line's own rate when it has one. `summary.lineRates` lists those lines and `lineRatesNote` words
them beside lines 5a/5b on the page, PDF and summary CSV. Summary: 1 original
contract sum, 2 net change by COs, 3 = 1 + 2, 4 = ΣG, 5a/5b/5 retainage, 6 = 4 − 5, 7 = previous app's
line 6, 8 = 6 − 7 (current payment due), 9 = 3 − 6. All integers in cents; rounding half away from
zero per line so the continuation-sheet column I always totals summary line 5. Every application is
computed in sequence from all previous ones (nothing derived is stored), and unit tests check the
invariant Σ(line 8) = line 6 of the latest application (plus, for a mid-job start, the opening
application's line 6).

Warnings: overbilled line (G > C, allowed but flagged), and blocking ones that prevent submission:
negative work to date, negative stored materials, retainage released beyond what is held, SOV total
≠ contract sum.

### History is immutable

Once a pay app leaves `draft`: its entries cannot change, the original contract sum and original
scheduled values are locked (use change orders), change orders cannot be approved with a date on or
before the last submitted period, approved change orders cannot change, SOV lines billed on it cannot
be deleted. Only the latest pay app can be a draft, and periods cannot overlap. These rules are what
make "computed on read" safe: a submitted application always recomputes to the same numbers.


### RFIs (`src/shared/rfi.ts`)

`rfis` (migration 0056): one row per request for information on a job, numbered 1..n per job
(unique with the job; the next number is one past the highest used). Dates are entered, never
inferred: `sent_on`, `response_due_on`, `answered_on`, checked as a whole by `rfiDateProblem`
(sent before due and answered, nothing in the future). Status is computed for today, never stored:
draft (not sent), open, overdue (response date passed), answered. `cost_impact`/`time_impact` are
none, possible or yes (null: not stated); `needsChangeOrder` is an answered RFI with either at
possible or yes and no `change_order_id`, which must be a change order on the same job (ON DELETE
SET NULL). The PDF (`services/export/rfi-export.ts`) is our own layout and says a response does not
change the contract sum or time by itself; the CSV neutralises formulas like every other export.
Every member reads; editors write. Files kept with an RFI are `rfi_files` (migration 0058, ON DELETE
CASCADE with the RFI; objects under `orgs/{orgId}/projects/{projectId}/rfis/{rfiId}/`, purged when
the RFI goes), with the attachment rules and storage limit of change-order files
(`services/payapps/rfi-files.ts`). The `signed` kind is the response that came back: it is left off
the PDF's "Attached" list and out of the packet (`buildRfiPacket` in `services/payapps/packet.ts`).

### Job costing (`src/shared/job-cost.ts`)

Budgets per SOV line (`job_cost_budgets`, one row per line, revisable after billing locks the SOV) and
costs (`job_cost_entries`: date, category, amount, optional line; a deleted line leaves its costs as
costs on no line). `computeJobCost` is pure: cost-to-cost percent complete with estimate at
completion = Σ per line max(budget, cost to date), or, where the PM typed a cost to complete
(`cost_to_complete_cents`/`_on`, migration 0049, dated the day the figure changed), max(cost on the
line through that day + cost to complete, cost to date), + costs on no line; earned = contract × cost / EAC
(BigInt, half away from zero); over/under = billed (G of the latest application not in draft) −
earned. Every figure that depends on the estimate is null until every line with a scheduled value has
a budget. Costs dated after the billed application's period end are reported apart. Reads on every
plan; writes need `plan.jobCosting` (Crew and up). `GET /reports/wip` repeats it per active job.
A cost to complete needs a budget row; leaving the field out of `PUT /budgets` keeps it, and an
unchanged figure keeps its date, so re-saving budgets never moves what later costs are counted against.
Committed costs (`job_cost_commitments`, migration 0050): purchase orders and lower-tier subcontracts,
on a line or none; a cost entry's optional `commitment_id` says which one it invoices (deleting the
commitment sets it null). Open = max(0, amount − costs to date against it); each line's EAC is then
max(that EAC, cost to date + the line's open commitments) (basis `committed`), and open amounts on no
line add to the job's EAC. Commitments dated after the as-of date are left out. Routes:
`POST/PATCH/DELETE .../job-cost/commitments[/:id]` (writes Crew and up; delete always open).
Labor from a payroll report (`src/shared/payroll-report.ts`, pure, run in the browser): a payroll
service's CSV is summed into one labor entry per pay date and line (wages + employer taxes +
contributions + an optional typed burden percent); the file stays in the browser and only the sums
are posted, each with a `Payroll <date> ...` reference. `POST .../job-cost/entries` with
`skipExistingReferences: true` drops entries whose reference the job already has (and repeats within
the request) and answers `{ added, skipped }`, so a report imported twice adds nothing.

## Tenancy & security rules (as apps/grants)

- Tenant routes live under `/api/orgs/:orgId/*` behind `requireOrg()` (membership check, **404** for
  non-members). Writes need `editor`; member management and project deletion need `admin`.
- Every query on a tenant table filters by `c.var.tenant.orgId`; lookups by id also match `orgId` and
  the parent `projectId`. SOV line ids in request bodies are checked against the project's own lines.
- State-changing requests pass the Origin check. Better Auth cookies: HttpOnly, SameSite=Lax, Secure on
  HTTPS. `x-test-user-id` identity shortcut only under APP_ENV=test inside the test runner.
- CSV cells that a spreadsheet would execute as a formula are prefixed with `'`.

## API (all JSON; money integer cents; errors `{ error: { code, message, details? } }`)

- `GET /api/health` → `{ ok, app, email }` (`email`: account mail is delivered); `ALL /api/auth/*` (Better Auth: sign-up/in/out, `verify-email`, `send-verification-email`, `request-password-reset`, `reset-password`); `GET /api/me` → `{ user, memberships }`
- `POST /api/orgs` `{ name }` → `{ orgId }`; `GET /api/orgs`
- Org (`/api/orgs/:orgId`): `GET /members`; `POST /members` `{ email, role }` (existing users; admin);
  `PATCH /members/:id` `{ role }`; `DELETE /members/:id`
- `GET/POST /projects`; `GET/PATCH/DELETE /projects/:projectId` (detail = project + sovLines +
  changeOrders + payApps + billingStarted + sovTotalCents)
- `POST /projects/:id/sov-lines`, `POST .../sov-lines/bulk` `{ lines }` (also what the spreadsheet import posts), `PATCH/DELETE .../sov-lines/:lineId` (PATCH also takes `retainagePctBps`, 0-10000 or null)
- `PUT /projects/:id/opening` `{ appNumber, periodTo, previousCertificatesCents, retainageHeldCents?,
  lines: [{ sovLineId, completedCents, releasedCents? }] }`; `DELETE .../opening` (409 once a pay app exists)
- `POST /projects/:id/change-orders` `{ number, description, submittedOn?, scheduleDays?, items: [{ sovLineId, amountCents } |
  { newLine: { itemNumber, description }, amountCents }] }`; `POST .../:coId/approve` `{ approvedOn }`;
  `PUT .../:coId/schedule` `{ scheduleDays: 0-1825 | null }` (contract time asked for, calendar
  days; pending only); `PUT .../:coId/sent` `{ submittedOn: date | null }` (date the request went to the GC, not in the
  future; pending only); `POST .../:coId/reject`; `DELETE .../:coId` (pending only)
- `GET/POST /projects/:id/pay-apps`; `GET/PATCH/DELETE .../pay-apps/:payAppId` (detail = header +
  computed + blockers + entries + editable); `PUT .../lines` `{ lines }` (replaces the draft's entries);
  `POST .../submit` (422 `pay_app_has_errors` with blockers); `POST .../certify` `{ certifiedAmountCents? }`;
  `POST .../mark-paid`; `POST .../retainage-release` `{ scope: all|complete|selected, sovLineIds?,
  percentBps | amountCents, apply? }` (preview by default; applied: writes each line's release on the
  draft, 422 `release_not_possible` with the reason; `src/shared/retainage-release.ts`); `POST .../payments` `{ amountCents, receivedOn, reference? }` (201, detail;
  409 with the reason when it does not fit); `DELETE .../payments/:paymentId` (detail)
- History (any member; `src/shared/pay-app-history.ts`, `services/payapps/history.ts`):
  `GET .../pay-apps/:payAppId/history` → `{ items: PayAppEventDto[] }` newest first,
  `GET .../pay-apps/:payAppId/history.csv` (oldest first), `GET /projects/:id/pay-apps/history` (every
  application on the job, deleted drafts included). Rows are appended by the routes after a change
  succeeds (best effort, logged on failure), keyed by project so they outlive a deleted draft.
- Job history (any member; `src/shared/job-history.ts`, `services/payapps/job-history.ts`):
  `GET /projects/:id/history` → `{ items: JobEventDto[] }` newest first and `.../history.csv`
  (oldest first): the job's terms, schedule of values, opening balance, change orders and RFIs
  (`rfiEvents`, written by `routes/org/rfis.ts`), in `job_events` (`subjectId` names the change
  order, line or RFI). Same writing rules as above; the
  sample job writes none.
- Exports: `GET .../pay-apps/:payAppId/application.pdf`, `.../continuation.csv`, `.../summary.csv`,
  `.../packet.pdf` (application + index + backup files; `?files=id,id` picks and orders them) and
  `GET .../change-orders/:coId/packet.pdf` (request + index + backup, not the signed copy)
- Reports (any member): `GET /reports/cash` → `CashReport` (`src/shared/cash-report.ts`: per job
  applied, paid, outstanding with aging, due dates from the job's `payTermsDays` (set with
  `PATCH /projects/:projectId`, 0-365 or null) counted from the application date or, with
  `payTermsBasis: "period_end"`, from the period end, past due and expected in the next 30 days, retainage
  held and its age, work complete, change orders waiting for approval (aged from the date sent, else
  the date entered; additions totalled, a follow-up past 30 days), next steps; totals),
  `GET /reports/cash.csv`
- Getting started (any member): `GET /getting-started` → `GettingStarted`
  (`src/shared/getting-started.ts`: five required steps and two optional ones, each with a target
  page; computed from the org's real jobs, the sample job excluded)

## Integration points for sibling packages

- **Lien waivers** (`packages/lien-waivers`): derive a conditional/unconditional progress waiver from
  `loadApplicationDocument()` (`services/payapps/documents.ts`): through-date = `payApp.periodTo`,
  amount = `summary.currentPaymentDueCents` (or `certifiedAmountCents` once certified), parties from
  `project` + `contractor`. Mounted (2026-11-25) under `/api/orgs/:orgId/projects/:projectId/pay-apps/:payAppId/waivers` (services/payapps/waivers.ts, table `lien_waivers`, PDF in services/export/waiver-pdf.ts; the package is imported as source via the `@lien-waivers` alias).
- **QuickBooks Online sync** (`packages/qbo-sync`): push a certified pay app as an invoice; one invoice
  line per continuation-sheet line with `thisPeriodCents + Δstored`, retainage as a negative line
  (or QBO's retainage feature). Trigger from the `certify` transition in `services/payapps/pay-apps.ts`.
- **Billing**: done, dark ([BILLING.md](BILLING.md)). Gate a new feature by plan in
  `services/billing.ts` (e.g. lien waivers or QuickBooks export on Crew and up).

## Testing

- Unit (`pnpm test:unit`): pay-app math across three periods incl. change orders, stored materials,
  retainage reduction and release, final payment; money parsing; CSV/PDF structure (xref offsets).
- Worker (`pnpm test:worker`): full API flow, immutability rules, roles, validation, Origin check,
  real Better Auth sign-up, and cross-tenant isolation for every tenant route.
