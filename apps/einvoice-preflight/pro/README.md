# E-invoice preflight: the paid layer ("fix and explain")

FSL-1.1-MIT (`../LICENSE`, part 2). Everything else in `apps/einvoice-preflight` is the
MIT baseline imported from oss-monorepo (`../PROVENANCE.md`).

Who it is for: German and French SMEs and their accountants before the e-invoicing
deadlines (Germany: issuing for turnover above €800k from 1 January 2027, everyone from
2028; France: SMEs issuing from 1 September 2027). The free checker says *which rule*
fails. This layer says *what it means* in German, French or English, fixes the mechanical
errors with a visible diff, keeps a per-client history for an accounting practice and
meters an API.

## The one rule: the model never decides validity

- Pass or fail comes only from deterministic code: the imported checker (`../report.mjs`:
  INV, XR, PP, FR, PDF rules, and the official Schematron when it is installed) plus the
  four deterministic `PRO-*` rules in `rules.mjs`.
- The model (if configured) only writes an explanation for a rule that has no template.
  Its output is marked `source: "llm"` with a notice, and `explain.mjs` drops it if it adds
  a number the finding does not contain or claims the invoice is valid. A failure or a
  missing key falls back to the checker's own text (`source: "checker"`).

## Modules

| File | What it does |
|---|---|
| `explain-catalog.mjs` | Deterministic DE/FR/EN template per rule id: all 92 built-in INV/XR/PP/FR/PDF ids (a test checks none is missing) plus the PRO rules. |
| `explain.mjs` | Template, else model (long tail, guarded, cached), else checker text. |
| `llm.mjs`, `fake-llm.mjs` | `llm.complete({ purpose, ... })` port. The real adapter wraps `@anthropic-ai/sdk` (loaded lazily, not a dependency of this folder); `FakeLlm` has a handler for every purpose (`explain.rule`). Model: `LLM_MODEL`, default `claude-haiku-5-5` (cheapest-model rule; the refusal fallback beta is sent only to models that offer it). |
| `rules.mjs` | `PRO-DEC-001` amounts with more than 2 decimals (BR-DEC), `PRO-DATE-001` dates not in XSD form, `PRO-CUR-001` missing currency code, `PRO-SUM-001` totals exact to the cent (BR-CO-10/13/15/16; the built-in rules allow a tolerance).; `PRO-DE-001` a ZUGFeRD / Factur-X MINIMUM or BASIC WL file from a German seller (or under the XRechnung profile), which the BMF does not count as an e-invoice. Also `detectProfile` for `profile=auto`. |
| `fixes.mjs` | The safe-fix whitelist (below). |
| `diff.mjs` | Exact text edits and a unified diff built from them. |
| `check.mjs` | validate, explain, propose fixes, re-validate. |
| `store.mjs` | Accounts, hashed API keys, clients, runs, monthly usage. `MemoryStore`, `FileStore` (one JSON file). |
| `sql-store.mjs` | `SqlStore`: the same methods on SQLite, through `node:sqlite` (`PRO_DB_FILE`) or a D1 binding (`d1Db`). The production store (`../docs/HOSTING.md`). |
| `plans.mjs` | Plans, prices and limits (the site's tiers). |
| `billing.mjs` | Paddle checkout, signed webhook to plan, portal, entitlement (packages/billing). |
| `paddle-catalog.mjs` | Builds `../billing/paddle-catalog.json`, the Paddle catalog as code. |
| `server.mjs` | The HTTP API (zero dependencies), public trial sign-up, and the workspace page at `/app`. |
| `serve.mjs` | The hosted product's start command: `server.mjs` plus the free pages on one port (`../Dockerfile.pro`). |
| `web/` | The accountant workspace page (`index.html`, `app.js`, `app.css`, `workspace-lib.mjs`): DE/FR/EN, no build step, no dependencies, served same-origin under a strict CSP. |

## Safe fixes

Only these, each shown as a diff, never silent:

| Fix | Example | Refuses when |
|---|---|---|
| `date-format` | `24.08.2026` to `2026-08-24` (CII: `20260824`) | the date is ambiguous (`03/04/2026`) or not a real date |
| `amount-decimals` | `48.504` to `48.50` (prices untouched) | rounding would leave a total a cent off (`PRO-SUM-001`) |
| `currency-case` | `eur` to `EUR` | the upper-case form is not an ISO 4217 code |
| `currency-missing` | adds `DocumentCurrencyCode` (UBL) | amounts name zero or several currencies |
| `peppol-process` | adds the Peppol billing process id (BT-23) | the document is self-billing (389), or a different id is present |

A fix is kept only if the corrected file clears the finding it targets and raises no new
finding; otherwise it is reported under `skipped` with the reason (and the findings it
would have introduced). Arithmetic errors, wrong identifiers and missing business data
are never fixed. PDFs and JSON are reported only. `fixes.test.mjs` re-validates every
fixed file independently.

## API

Run `node pro/server.mjs` (env: `PORT`, `PRO_DB_FILE` (SQLite, production) or `PRO_DATA_FILE`, `ADMIN_TOKEN`, optional
`ANTHROPIC_API_KEY` + `LLM_MODEL`, `FAKE_LLM=true` for an offline demo). The route list
is at the top of `server.mjs`. In short:

```
GET  /app                          the workspace page (sign up, sign in with the key, clients, batches)
POST /v1/signup                    {name, acceptTerms: true} -> trial account + API key (shown once)
POST /v1/admin/accounts            (ADMIN_TOKEN)  -> account + first API key (shown once)
POST /v1/check?lang=de&fix=1       raw invoice body -> findings with explanations, fixes, diff
                                   profile= xrechnung|peppol|france|slovakia|auto (auto: from the file)
                                   schematron=1 the official Schematron where installed (the workspace sends it)
POST /v1/clients                   an accountant's client
POST /v1/clients/:id/batches       {documents:[{name, content, encoding?}]} -> run + results
GET  /v1/clients/:id/history       runs, newest first
GET  /v1/account | /v1/keys        usage, plan, subscription, keys
GET  /v1/billing/plans             public pricing table
POST /v1/billing/checkout          {plan, email} -> hosted checkout URL (dark: 503)
POST /v1/billing/webhook           Paddle notifications (signature-verified)
POST /v1/billing/portal            manage or cancel the subscription
```

One metered unit is one invoice per month, as the pricing page promises: the SHA-256 of its
bytes is kept per account and month, so re-checking the same file (alone, in a batch, twice in
one batch, or base64-encoded) costs nothing more that month, even at the limit. Units are
reserved before the work and given back if it fails; a request whose new invoices would exceed
the plan gets `429 quota_exceeded`. "Explained" is likewise one unit per invoice per month that
needed the model (template explanations are free). Each response carries
`x-usage-documents-used/-limit/-charged` and `x-usage-explained-used/-limit`. Run history keeps file names, SHA-256 hashes, rule ids and fix
ids, never invoice contents.

## The workspace page

`GET /app` serves `web/`: a stranger signs up with a firm name (`POST /v1/signup`, a trial account,
the API key shown once), or signs in by pasting a key (kept in `sessionStorage`, or `localStorage`
with "remember"). Then: plan and usage meters with upgrade buttons (checkout when billing is on,
otherwise a "not open yet" line), client companies, a drop zone that sends files as base64 batches
split to the API's caps (50 files, 1 MiB each, 20 MiB of base64 per request), each finding with its
plain-language explanation, the fixed file and its diff as downloads, and the client's history.
The page builds the DOM from text nodes only and loads nothing from another origin.

Sign-up abuse: per client IP (`SIGNUP_PER_IP_PER_HOUR`, 5) and per day for the server
(`SIGNUP_PER_DAY`, 200), in memory. Behind a proxy set `TRUST_PROXY=1` so the IP is the last
`X-Forwarded-For` hop. `PUBLIC_SIGNUP=off` closes it. A trial's worst case is 50 model
explanations a month, about $0.05 at the cost basis below.

## Paid path: dark

Paid plans (Firm S/M/L at €19/€29/€49 a month, the tiers the marketing site publishes) are
sold through Paddle by `billing.mjs`: a signed checkout token binds the purchase to the account,
a verified webhook sets the plan, and the customer portal handles changes and cancellation. It
answers 503 `billing_unavailable` until the owner sets the provider secrets. Plans, the margin
test, the purchase flow and the owner's steps: [`../docs/BILLING.md`](../docs/BILLING.md).

Cost basis: checking is CPU only (measured 1.1 ms per invoice without Schematron); a model
explanation is at most 3,000 input and 1,500 output tokens on Claude Haiku 5.5 ($0.10 / $0.50
per million), and is cached per rule, message and language across all accounts.

## Not done yet

- Storage is one JSON file (single process). A D1 or SQLite adapter implements the same
  `store.mjs` methods; that is the next step before more than one instance runs.
- The workspace page signs in with the API key (no email or password yet, so no reset: a lost key
  means a new trial). Email sign-in, key management on the page and a terms link wait for the
  launch steps in `../ROADMAP.md`.
- The official Schematron (BR-xx) runs only where `slimdom` and `fontoxpath` are
  installed (`../plain-node.mjs`); without them the report says `schematron: "unavailable"`.
- Templates were written from the rules' meaning, not reviewed by a German or French
  accountant yet.

## Tests

```
node --test pro/*.test.mjs
```
