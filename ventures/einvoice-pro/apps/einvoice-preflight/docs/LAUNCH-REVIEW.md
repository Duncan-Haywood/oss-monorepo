# E-invoice Fix & Explain launch review (2026-11-27)

The record `../../../docs/legal/OPERATOR.md` ("Who approves launch") asks for before an agent runs the
first production deploy (`einvoice-pro-deploy`) and opens trial sign-ups. Checkout stays dark:
`EINVOICE_BILLING_PROVIDER` is unset, so the free trial is the only plan a stranger can use. Turning
on live checkout needs its own check of the Paddle side and is not covered here.

**Verdict.** The product side passes, with the five fixes in section 2 made in this PR. The deploy
is **not run yet**: two EU legal duties that come with selling to German and French firms need the
owner (section 4). Once both are settled, the next run deploys with no further product review.

## 1. Profitable at scale

`pro/plans.test.mjs` (packages/billing `assertPricingBand`) already prices every paid plan at its
full allowance: one invoice budgeted at $0.001, one model explanation at 3,000 tokens in and the full
1,500 out on `claude-haiku-5-5`, hosting, Paddle's 5% + $0.50 and a 3% refund reserve.

| Plan | Price a month | Worst-case cost | Margin |
| --- | --- | --- | --- |
| Firm S (500 invoices, 300 explained) | €19 | about $3.13 | 83% |
| Firm M (1,500, 500) | €29 | about $5.14 | 82% |
| Firm L (4,000, 850) | €49 | about $9.61 | 80% |
| API, metered (€1.40 per 1,000, €0.04 explained, €19 minimum) | per unit | per unit | ≥ 40% at the minimum and the caps |

Re-derived against the Worker: `eval/worker-parity-2026-11-26.md` measured 40-440 ms of CPU per
invoice with the official rules. At Workers Paid's $0.02 per million CPU-ms, 440 ms is $0.0000088,
about a hundredth of the $0.001 budget. So the table holds on this host.

**AI spend at launch is zero.** The deploy workflow syncs no `ANTHROPIC_API_KEY` and the build
installs no SDK, so `loadLlmFromEnv` returns null and every explanation comes from the built-in
DE/FR/EN/NL/PL templates (a rule without one says so instead). Adding a key later is bounded per
account by each plan's `llmExplanationsPerMonth` (the trial's is 50) and per request by `explain.mjs`.
There is no service-wide daily cap like CMMC's (`services/ai-capacity.ts`); add one in the PR that
adds the key.

**The trial.** 100 invoices a month, 3 clients, 2 keys, no card. Sign-up is capped at 5 per IP an
hour and 200 a day, held in memory per isolate (docs/HOSTING.md notes the Worker can run several),
so a determined abuser gets more than 200 trials a day. Worst case on CPU alone: 200 trials x 100
invoices x 440 ms = 8.8 M CPU-ms, about $0.18 a day per isolate, all inside the Workers Paid plan the
account already pays for. Terms §6 forbids many trial accounts; `PUBLIC_SIGNUP=off` is the kill
switch. A D1-backed cap stays on the ROADMAP ("if trial abuse shows up").

Condition met.

## 2. Legal pages and licences read against the product

Terms, Privacy Policy and DPA read in full (English; the German and French translations checked at
the changed paragraphs), then checked against `pro/server.mjs`, `pro/sql-store.mjs`, `wrangler.jsonc`,
the deploy workflow and `PROVENANCE.md`.

| Check | Finding | Action |
| --- | --- | --- |
| Operator and contact | Maris Stella Labs LLC, Colorado; hello@marisstella.app on every page | none |
| Third-party rule sets, licence | `PROVENANCE.md` says to keep Croatia's HR-CIUS set (no licence stated) and the ZATCA sets (LGPL-3.0) **out of the paid build** until checked. `worker/build.mjs` embedded every `plain/*.json`, those three included | **fixed**: `EXCLUDED` in `worker/build.mjs`; `pro/worker.test.mjs` fails if one is embedded. Neither is needed for DE/FR/NL/PL |
| A missing add-on | With a national add-on's file absent, `runSets` skipped it silently, so a Croatian file would have passed on the EU base alone, a "pass" the Terms (§3: "the rules that ran") would not back | **fixed**: a file naming an add-on whose rules are missing is `unavailable` (as PINT and the extended bases already were), test in `cius-hr.test.mjs` |
| EUPL-1.2 and MPL-2.0 sets (EN 16931 base, Peppol) | Both count use over a network; both are shipped unmodified, and the source is public in this repository. The Worker served no notice: `plain/NOTICE.txt` was not embedded | **fixed**: `/app/notices` serves NOTICE.txt, the fontoxpath, xspattern and prsc licences and the OFL, says which sets this host does not run, and is linked from the workspace footer in all five languages |
| Terms §2, what the Service does | Named explanations in German, French or English only; the app also explains in Dutch and Polish, converts a PDF into an e-invoice and has a cross-client dashboard | **fixed** in EN, DE and FR |
| Terms §3, the converter | A converted invoice is a file the Service builds from values it read. Nothing said it is the user's draft | **fixed**: a bullet in EN, DE and FR: it can misread or miss a value; check everything; the user is the issuer |
| Terms version | Version 2026-11-27 edited in place, not bumped: the Service has never been deployed, so no account has accepted any version, and the DE/FR translations keep matching the English version (`pro/legal.mjs`) | none |
| Privacy, invoice contents not stored | `runs.files` keeps name, SHA-256, size, status, rule ids, fix ids (`runFileOf`; the converter's run adds format and XML hash, `convertRunOf`); no table holds file content | none |
| Privacy, technical data | The client IP goes to the in-memory sign-up limiter only (`cf-connecting-ip`, `worker/index.mjs`); invocation logs off (`wrangler.jsonc`); error logs cut to 200 characters, except one | **fixed**: `pro/server.mjs`'s internal-error log now cuts its message to 200 characters too, as a parser's message can quote the invoice |
| Privacy, subprocessors | Cloudflare (D1 in the EU jurisdiction, `worker/provision.mjs`), Anthropic, Paddle, Resend (if email sign-in is on). No other outbound host in `pro/` or `worker/`. Anthropic is listed though no key is set at launch: listing an unused processor over-discloses, which is the safe side | none |
| Privacy, operator access | `pro/admin.mjs` reads account names, plans, dates, status and counts, each read audited; no clients or history | none |
| Refunds and renewal | 30-day full refund, cancel any time, keep the paid period; buyers are businesses. Paddle shows its own terms | none |
| No claim a file cannot back | No certification, no attorney review, no "accepted by the tax authority"; Terms §3 says a pass is not acceptance | none |
| DPA SCC clause choices | Still unchecked against EUR-Lex, which answers 403 through the proxy (ROADMAP Next 2) | open, as before |

## 3. Cyber and legal risk review

`python3 platform/security/risk_review.py`, answered in the pull request. The change adds one
read-only text route (`/app/notices`, static content, `nosniff`, no input), narrows what the build
embeds, makes one checker path fail closed, and edits policy text. No new secret, dependency,
outbound host or stored data.

## 4. Before the first deploy: two owner items

Selling a hosted service to German and French firms brings two duties no file here can meet:

1. **Provider identification (Impressum).** Germany's Digital Services Act implementation (§ 5 DDG)
   requires a commercial online service aimed at German users to name a postal address at which the
   provider can be served, alongside the name, email and register details. France's LCEN art. 6 III
   asks the same of a publisher. The workspace and the legal pages give only "Colorado, USA" and an
   email; `apps/einvoice-site` already waits on `CONTROLLER_ADDRESS` for its production build. In
   Germany a missing Impressum is a common ground for competitors' cease-and-desist letters. Needed:
   the address the owner wants published (a registered agent's address works), then a run adds an
   `/app/impressum` page from it.
2. **EU representative (GDPR Art. 27).** A controller or processor outside the EU that offers
   services to people in the EU must name a representative in a Member State unless its processing
   is occasional; a SaaS sold to EU accountants is not occasional. The DPA's Clause 13 choice already
   reads "the Member State in which its representative under Article 27(1) is established", which
   assumes one. Commercial representative services cost roughly €100-€300 a year (an estimate, not
   checked against a vendor this run). Needed: the owner's decision and the contract; the
   representative's name then goes in the Privacy Policy and the DPA.

When both are in: run `einvoice-pro-deploy` from `main` with `skip_checks` off, check `/healthz`,
`/app`, `/app/notices` and the legal pages, then do DEPLOY.md "Then" 1-3.

## 5. What the first deploy will and will not turn on

- Trial sign-ups at the Worker's URL (workers.dev, or `EINVOICE_DOMAIN`). Sign-in by API key; email
  sign-in stays off until `EINVOICE_RESEND_API_KEY` and a sender are set.
- Template explanations only; no model calls (section 1).
- Paid plans dark; `/v1/billing/plans` lists them as unavailable.
- Croatian and Saudi (ZATCA) files are answered "not checked" (section 2).
