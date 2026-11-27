# PayApps launch review (2026-11-27)

The record `docs/legal/OPERATOR.md` ("Who approves launch") asks for before an agent runs the first
production deploy and opens sign-ups. Checkout stays dark: `PAYAPPS_BILLING_PROVIDER` is not set, so
the Free plan is the only one a stranger can use until the Paddle account is verified
(docs/BILLING.md, "Turning it on"). Turning on live checkout needs its own check of the Paddle side
and is not covered here.

## 1. Profitable at scale

PayApps makes no LLM calls and sends no data to an AI provider (grep of `src/` for model or provider
hosts: none). Cost of serving is Cloudflare Workers, D1 and R2 storage. `src/shared/plans.test.ts`
holds every paid plan above the 40 % floor at full allowance, with Paddle's 5 % + $0.50 and a 3 %
refund reserve; it passes on this commit, and BILLING.md puts every plan above 90 %. Plans: Free
(1 active job), Solo $99, Crew $179, Company $249 a month. Condition met.

## 2. Legal pages read against the product

All four pages read in full (terms, privacy, refunds, acceptable use), then checked against the code.

| Check | Finding | Action |
| --- | --- | --- |
| Operator and contact | Maris Stella Labs LLC, Colorado; hello@marisstella.app on every page | none |
| No claim of review, certification or endorsement | No "counsel", no "Draft", AIA non-endorsement stated (enforced by `documents.test.ts`) | none |
| Terms §2, what the Service does | Described pay applications only; the app also keeps estimates, job costs, schedule, RFIs, submittals, daily reports, T&M tickets, punch lists, close-out, insurance and company documents, attachments, certified payroll and QuickBooks | **fixed**: §2 lists them |
| Terms §3, who is responsible | Covered billing figures, AIA forms and lien waivers, not certified payroll (prevailing-wage rates and the signed statement of compliance), the insurance-requirements comparison, or reminders worked out from typed dates | **fixed**: three bullets added |
| Privacy, preliminary notices | `lien_notice_sends` (recipient name and address, method, place, date, tracking) was not listed; only its attached files were | **fixed**: listed |
| Privacy, QuickBooks writes | Said only invoices go to Intuit; `qbo_payment_syncs` and `qbo_credit_memo_syncs` show payments and short-paid balances (credit memos with a note) are written too | **fixed**: both sections |
| Privacy, data collected (rest) | Checked against every table in `src/worker/db/schema` (jobs, SOV, COs, RFIs, submittals, punch, close-out, daily reports, T&M and signatures, waivers and lower-tier, insurance, documents and W-9 rule, costs and commitments, estimates and price list, schedule, attachments, QuickBooks tokens and imported lines, sessions with IP and user-agent, rate-limit counters, acceptances) | none |
| Privacy, certified payroll | Not stored server-side; draft in browser storage; SSNs/ITINs in page memory only. Matches `services/export` and the client page | none |
| Privacy, email sent | Said the weekly email lists "next steps from the cash report"; `services/payapps/digest.ts` also lists certificates and documents to renew, overdue RFIs and submittals, unbilled T&M, lower-tier waivers and daily-report gaps | **fixed**: listed |
| Privacy, mail to third parties | The app drafts RFI follow-ups (`shared/follow-up-email.ts`, `mailto:`) and lower-tier requests (copied by the user); nothing is sent to a GC or supplier by the Service | **added** a sentence saying so |
| Privacy, subprocessors | Cloudflare (hosting, D1, R2, Email Service) and Paddle; Intuit only as the customer's own connected service. No other outbound host in `src/worker` | none |
| Privacy, operator access | `services/admin/metrics.ts` and the new-paid email (`owner-notify.ts`) show org name, owner name and email, plan and price; disclosed under Security | none |
| Refunds | Free plan with no card; 30-day full refund through Paddle; cancel any time, keep the paid period, data stays readable. Matches `docs/BILLING.md` ("Nothing is ever hidden or deleted") | none |
| Renewal terms | Monthly, cancel from the billing page; Paddle's checkout shows its own terms. Colorado automatic-renewal rules for consumer sales stay an open check (OPERATOR.md); buyers are businesses | none |
| Acceptable use | Honest billing, others' data, no probing or spam; matches the invitation and rate-limit code | none |

The version lines moved to 2026-11-27 and `POLICY_VERSION` to `2026-11-27.2`, so anyone who accepted
the earlier text is asked again. `node docs/legal/sync-documents.mjs` regenerated the bundled copy;
`documents.test.ts` checks the two match.

## 3. Cyber and legal risk review

`python3 platform/security/risk_review.py` from the public repository, answered in the pull request.
The change is documentation and policy text plus one version constant: no new endpoint, secret,
dependency or data flow.

## 4. What the first deploy does and does not turn on

- Sign-ups open on `https://payapps.<account subdomain>.workers.dev` (or `PAYAPPS_DOMAIN` if set).
- Production requires email verification. If the health check answers `"email": false`, nobody can
  finish signing up; the deploy warns and the next step is docs/EMAIL.md, not a second deploy.
- R2 off on the account means attachments read as empty and uploads answer 503 (DEPLOY.md, step 3).
- QuickBooks stays off until the owner's Intuit app keys exist.
- Paid plans stay dark (above).
