# CMMC Workspace launch review (2026-11-27)

The record `docs/legal/OPERATOR.md` ("Who approves launch") asks for before an agent runs the first
production deploy and opens sign-ups. Checkout stays dark: `CMMC_BILLING_PROVIDER` is not set, so
the free Level 1 plan is the only one a stranger can use until the Paddle account is verified
(docs/BILLING.md, "Turning it on"). Turning on live checkout needs its own check of the Paddle side
and is not covered here. The deploy itself still waits on the workflow port (`../../DEPLOY.md`, "The
port, in its own PR"); this review is what that deploy needs from the product side.

## 1. Profitable at scale

Cost of serving is Cloudflare Workers, D1 and R2, plus AI drafts on Anthropic's API
(`LLM_MODEL=claude-haiku-5-5` in `wrangler.jsonc`; both drafting purposes pass `maxTokens: 4000`,
`services/drafting/index.ts` and `procedure.ts`).

**Worst case for one draft, re-derived.** The margin test priced a draft at 8k tokens in. The field
limits in `routes/org/index.ts` allow more: four 8,000-character profile fields (system, boundary,
environment, connections), 8,000-character notes and statement, the requirement text and objectives,
evidence titles and the ~3.5k-character prompt, about 55k characters or 14k tokens. The test now
prices a draft at **20k tokens in and the 4k cap out** (`WORST_DRAFT_TOKENS`,
`services/ai-capacity.ts`), still at Opus 5.5 list prices although the app runs on Haiku (about 40
times cheaper): $0.16 a draft on Opus, $0.004 on Haiku.

`src/shared/plans.test.ts` at that cost, with full evidence storage on R2, $30 or $50 of support
time per org-month, hosting, Paddle's 5% + $0.50 and a 3% refund reserve (printed from the test's
own `assertPricingBand` checks on this commit):

| Plan | Charge a month | Worst-case cost a month | Margin |
| --- | --- | --- | --- |
| Level 2, monthly | $249.00 | $76.37 | 69% |
| Level 2, annual ($2,689) | $224.08 | $73.92 | 67% |
| Level 2 + Quality, monthly | $399.00 | $151.47 | 62% |
| Level 2 + Quality, annual ($4,309) | $359.08 | $147.82 | 59% |

All four clear the 40% floor. On Haiku, a Level 2 shop drafting its whole 150 a month costs $0.60
in model calls, not the $24 above.

**The free plan.** Level 1 allows 10 drafts a month per organization: at most $0.04 on Haiku plus
$0.004 of storage. Sign-up needs a confirmed email address in production (`requiresEmailVerification`,
`services/auth/auth.ts`), and auth attempts are rate limited per isolate. What was missing was a bound
on the sum: many free organizations, or a bug in a loop, had no ceiling.

**Fixed: a service-wide daily AI cap** (`services/ai-capacity.ts`, called from `assertCanDraft`
after the plan's own allowance). `GLOBAL_DAILY_LLM_CAP_USD` (default **$1.50 a day**, so a month
stays under the venture's $50 budget cap in `VENTURE.yaml`; `"0"` stops every draft, `"off"`
disables) is turned into a number of drafts at the configured model's worst-case price, so the bound
holds whichever model `LLM_MODEL` names: 375 drafts a day on Haiku, 9 on Opus or an unknown model.
Drafts are counted from the same audit rows the monthly allowance counts, across every organization,
since the start of the UTC day. Over the cap the draft answers 429 `llm_capacity_exhausted` before
the model is called, and the shop can still write the statement itself. A paid shop at its whole
allowance drafts about 5 a day (Level 2) or 13 (Level 2 + Quality), so the default fits dozens of
paying shops; raise it with the budget as they arrive. Tests: `ai-capacity.test.ts` (unit, the
arithmetic) and `test/worker/ai-capacity.test.ts` (D1: across orgs, yesterday and other actions not
counted, the kill switch, the plan's own 402 coming first).

The global count reads `audit_log` by action and date without an index on those columns (the one
index is `(org_id, created_at)`); at launch volumes that is a scan of a small table per draft. Add an
`(action, created_at)` index when the log grows.

Condition met.

## 2. Legal pages read against the product

All four pages read in full (terms, privacy, refunds, acceptable use), then checked against the code.

| Check | Finding | Action |
| --- | --- | --- |
| Operator and contact | Maris Stella Labs LLC, Colorado; hello@marisstella.app on every page | none |
| No claim of review, certification or endorsement | Terms §3: not a C3PAO or RP organization, not affiliated with DoD or the Cyber AB; no "counsel", no "Draft" | none |
| Terms §2, what the Service does | Described the requirement records, SSP, POA&M and score only; the app also keeps affirmations and reminders, assets and the network diagram, service providers, security policies, personnel and training, suppliers and flow-down, the ISO 9001 checklist, controlled documents, internal audits and corrective actions, imports, exports and a calendar link | **fixed**: §2 lists them |
| Terms §3, ISO 9001 | Only CMMC was disclaimed; the $399 plan sells an ISO 9001:2015 checklist with readiness figures and a gap report | **fixed**: a bullet saying it is not a registration, we are not a certification body or affiliated with ISO, and nothing is an ISO 9001 or AS9100 certificate |
| Terms §3, computed suggestions and dates | The supplier flow-down level suggestion (32 CFR 170.23) and every due date and reminder are worked out from typed facts; not covered | **fixed**: a bullet saying so, and that a missed reminder does not change a deadline |
| Terms §3, AI drafts | Matches `services/drafting`: saved as unreviewed drafts, only accepted statements reach the SSP, procedure drafts need a person and an admin's approval | none |
| Terms §8 and AUP, no CUI | Every evidence upload requires the `noCui` confirmation (`services/evidence`) | none |
| Privacy, data collected | Checked against every table in `src/worker/db/schema` (auth, org profile, control records, POA&M, affirmations and reminder/calendar-feed rows, evidence, quality clauses and links, assets, providers, policies and their events and procedure drafts, people, suppliers, controlled documents and events, internal audits, findings, corrective actions, subscriptions, billing events, pending checkouts, legal acceptances, audit log, admin audit log, member notification settings) | none |
| Privacy, spreadsheet imports | Not mentioned. Control, POA&M, asset and personnel imports send the sheet's rows to the Worker as CSV text to preview and apply (`routes/org`, `/…/import`); only applied records are kept, and the audit entry holds the change count, not the file | **added** |
| Privacy, what the AI model sees | Matches `buildDraftContext` and the procedure prompt: requirement text, org and system fields, status, notes, evidence titles only, provider names; never file contents | none |
| Privacy, draft counting | The new daily cap counts drafts across organizations | **added**: counted from the audit log, not the drafts' content |
| Privacy, subprocessors | Cloudflare (hosting, D1, R2, Email Service), Anthropic, Paddle. No other outbound host in `src/worker` (grep for URLs outside the generated types: none) | none |
| Privacy, account email | Confirm, reset and "already have an account" (`services/auth/emails.ts`), affirmation reminders with one-click stop (`services/affirmations/reminders.ts`). No emailed invitations exist (`services/orgs`: members are added by an existing account's email) | none |
| Privacy, operator access | `services/admin` and the new-paid email (`owner-notify.ts`: org name, plan, owner's name and email) match "Operator access"; views are logged in `admin_audit_log` | none |
| Privacy, technical data | Auth rate limits use Better Auth's in-memory storage (`services/auth/auth.ts`), as stated | none |
| Refunds | Free plan with no card; 30-day full refund through Paddle; cancel any time, keep the paid period, then Level 1 limits, everything readable. Matches docs/BILLING.md ("Nothing is ever hidden or deleted") | none |
| Renewal terms | Monthly or annual, cancel from the billing page; Paddle's checkout shows its own terms. Colorado automatic-renewal rules for consumer sales stay an open check (OPERATOR.md); buyers are businesses | none |
| Acceptable use | Honest assessments, no CUI, others' data, no probing or bypassing "plan limits or AI spending limits" (the new cap is one) | none |

The Terms version line moved to 2026-11-27 and `POLICY_VERSION` to `2026-11-27.2`, so anyone who
accepted the earlier text is asked again. `node docs/legal/sync-documents.mjs` regenerated the
bundled copy; `documents.test.ts` checks the two match.

## 3. Cyber and legal risk review

`python3 platform/security/risk_review.py` from the public repository, answered in the pull request.
The change adds one read-only D1 count before a draft, one optional Worker variable and policy text:
no new endpoint, secret, dependency, outbound host or stored data.

## 4. What the first deploy does and does not turn on

- Sign-ups open on the Worker's URL (or `CMMC_DOMAIN` if set) once the deploy workflow is ported.
- Production requires email verification. If `/api/health` answers `"email": false`, nobody can
  finish signing up; the next step is docs/EMAIL.md, not a second deploy.
- R2 is required for evidence (docs/DEPLOY.md, step 3).
- AI drafts need `CMMC_ANTHROPIC_API_KEY` (or the shared key); without it a draft answers 503
  `llm_not_configured` and everything else works. The daily cap applies from the first call.
- Paid plans stay dark (above).
