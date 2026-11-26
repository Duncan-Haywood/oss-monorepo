# Subprocessors

Outside services that receive customer personal data, built from what the code calls (not from
contracts). Reviewed against the code on **2026-11-24**. Each entry names the file that makes the call.
The machine-readable version is `packages/trust-page/src/profiles/*.ts`; its tests fail if a
subprocessor there is missing here (matched by the `id` in backticks).

"Condition" means the provider is called only when a secret or setting is present. Whether it is
present in production is a dashboard fact, so it is on [OWNER-CONFIRM.md](OWNER-CONFIRM.md).

Provider trust pages are **candidates**: the session that wrote this could not reach them. Check each one
(and what its reports cover) before linking it anywhere; see OWNER-CONFIRM.md, "Provider pages".

## Grant Autopilot (`apps/grants`, live)

| id | Provider | Purpose | Personal data it receives | Condition | Where the code calls it |
| --- | --- | --- | --- | --- | --- |
| `cloudflare` | Cloudflare, Inc. | Runs the Worker; D1 database, R2 files, Vectorize index, Queues, Workflows, Workers Logs; Workers AI (document conversion, `@cf/baai/bge-m3` embeddings, `@cf/openai/whisper-large-v3-turbo` speech-to-text); Email Service (transactional mail); Turnstile (bot check); Access (admin gate) | Everything the product stores or processes | Email Service: chosen by `EMAIL_PROVIDER`; Turnstile: `TURNSTILE_SECRET_KEY` set; Access: `CF_ACCESS_*` set | `apps/grants/wrangler.jsonc`, `src/worker/ports/workers-ai.ts`, `src/worker/ports/cloudflare-email.ts`, `src/worker/services/auth/turnstile.ts`, `src/worker/middleware/cloudflare-access.ts` |
| `anthropic` | Anthropic, PBC | Claude API (model from `LLM_MODEL`, set to `claude-opus-5-5`): drafting, interviews, fact extraction, scoring | Document passages, interview answers, organization facts (restricted facts are excluded from drafting: `docs/DATA_POLICY.md`) | `ANTHROPIC_API_KEY` set (production) | `src/worker/ports/anthropic-llm.ts` |
| `paddle` | Paddle | Merchant of record: checkout, payments, invoicing, tax | Billing email (customer lookup/creation), a checkout token in `custom_data` (no org name), whatever the buyer types into Paddle's checkout | `BILLING_PROVIDER` / `BILLING_API_KEY` set | `src/worker/ports/billing/paddle.ts` |
| `resend` | Resend | Email delivery | Recipient addresses, email content | `RESEND_API_KEY` set (marketing mail always; transactional mail too while the key exists under `EMAIL_PROVIDER=auto`: `docs/EMAIL.md`) | `src/worker/ports/resend-email.ts` |
| `github-actions` | GitHub, Inc. | Nightly D1 backup job: `wrangler d1 export` runs on a GitHub-hosted runner, gzips, uploads to R2, deletes the local copy | A full database dump, transiently | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets set | `.github/workflows/grants-backup.yml`, `apps/grants/scripts/ops/d1-backup.mjs` |
| `google-signin` | Google | "Sign in with Google" | The user's Google name and email, when the user chooses it | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` set | `src/worker/services/auth/auth.ts` |

Paths without a prefix are under `apps/grants/`.

**Not subprocessors (listed so nobody has to rediscover them):**

- *Customer-directed destinations.* The customer chooses and configures them, and data goes there on the
  customer's instruction: Slack incoming webhooks and the `/grants` slash command, Microsoft Teams
  Workflows (`src/worker/services/integrations/`). Messages carry titles, counts and links only, no
  document text (`docs/INTEGRATIONS.md`, "Security model"). The same applies to funders who receive
  submitted applications by email.
- *Public data sources* (we fetch from them; we send them search terms, not customer records):
  Grants.gov `api.grants.gov` (`src/worker/services/discovery/grants-gov.ts`), Simpler.Grants.gov
  (`src/worker/services/discovery/simpler-grants.ts`), the ProPublica Nonprofit Explorer API
  (`src/worker/services/prospecting/propublica.ts`). The search terms can come from the organization's
  profile (keywords, state). **Owner to decide** whether that counts as sharing; see OWNER-CONFIRM.md.
- *Websites we crawl*: the organization's own site (only with the `website_crawl` consent) and funder
  pages (`src/worker/ports/polite-fetcher.ts`, `src/worker/services/watchlist/fetch.ts`). We request
  pages; we send no customer data.

## Seller Books (`apps/seller-books`, not yet live)

| id | Provider | Purpose | Personal data it receives | Condition | Where the code calls it |
| --- | --- | --- | --- | --- | --- |
| `cloudflare` | Cloudflare, Inc. | Runs the Worker and the D1 database | Everything the product stores | — | `apps/seller-books/wrangler.jsonc` |

No LLM, email, billing or other outside call (`apps/seller-books/docs/ARCHITECTURE.md`, "Stack").

## Marketing sites (`apps/seller-books-site`, `apps/cmmc-site`)

Early-access lists only: Cloudflare (Worker, D1, Email Service for the double opt-in confirmation),
`apps/*-site/wrangler.jsonc`. They have no trust-page profile yet (see README.md, follow-ups).

## Changing this list

Adding a provider that receives personal data is a change under
[policies/vendor-management.md](policies/vendor-management.md): update this file, the product profile in
`packages/trust-page`, and the customer-facing privacy policy (`apps/grants/docs/legal/privacy.md`
promises to "update this list before adding a new subprocessor") in the same PR, before the code ships.
