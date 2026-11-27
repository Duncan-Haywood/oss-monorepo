# Job Shop Quote

RFQ-to-quote for CNC machining and fabrication job shops: paste the RFQ email, attach the drawings,
review what the AI extracted, enter your cost inputs, and send a quote priced **only** from your
own rate card.

- Architecture, anti-fabrication rules and the endpoint contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Plans, limits and the Paddle checkout (dark until the owner turns it on): [`docs/BILLING.md`](docs/BILLING.md)
- What's done and what's next: [`ROADMAP.md`](ROADMAP.md)
- Deploying (Cloudflare, by hand from Actions): [`docs/DEPLOY.md`](docs/DEPLOY.md)
- QuickBooks Online (a won quote as an invoice; dark until the Intuit keys are set): [`docs/QUICKBOOKS.md`](docs/QUICKBOOKS.md)

## Commands (from `apps/jobshop-quote`)

```bash
pnpm demo          # offline demo at http://localhost:5199 (fake LLM, no keys, data in .wrangler/demo)
pnpm typecheck
pnpm test:unit     # costing engine, extraction checks, cover note, PDF
pnpm test:worker   # API end to end in workerd, incl. cross-tenant isolation
pnpm build
pnpm test:e2e      # browser suite, offline: RFQ to a won quote, tenant isolation, 390 px, CAD, email, team, import, a customer accepting from its link
node scripts/phone-width.mjs  # with `pnpm demo` running: try another width by hand (--width 360)
pnpm db:generate   # after a schema change; commit migrations/
```

`pnpm test:e2e` (`scripts/e2e-run.sh`) starts its own server on :5198 with a fresh local D1 in
`.wrangler/e2e`, built from the committed migrations, so it runs beside `pnpm demo`. The specs in
`test/e2e/` drive the browser, not the API: sign up, type a rate card, paste the synthetic RFQ in
`test/fixtures/rfq.ts`, confirm a part, price the line and check every cell of the price table
against figures worked by hand in the spec's comments, then send it, record the win and find it in
the quote log and win/loss. `02-tenant-isolation` signs up two shops and checks the second gets 403
or 404 on every read and write of the first's records; `03-phone-width` fails any page wider than a
390 px screen. `04-cad-revision-email` attaches a STEP plate written by
`packages/cad-features`' test writer and checks the measured box, holes and the blank it sizes,
emails the sent quote (recorded, not delivered, offline), revises it and reads the changes view;
`05-team-and-import` pastes a machine sheet, re-imports it as an update, then invites an estimator
who joins by the link and finds the rate card and team read-only, in the page and the API. The
offline server measures CAD files with the real parser (only the worker tests use the fake). Pass a spec or `-g` to run part of it; `E2E_BASE_URL=http://localhost:5199` points it
at a running demo instead. CI runs it on every PR that touches the app (`jobshop-quote-ci`, job `e2e`).

Real extraction needs `ANTHROPIC_API_KEY` (secret) and Workers AI; the model is `LLM_MODEL`
(`claude-haiku-5-5`). Copy `.dev.vars.example` to `.dev.vars` for `pnpm dev`.

AI spend is capped before every Claude call (`services/guards/llm-budget.ts`, same guard as grants):
`ORG_MONTHLY_LLM_CAP_USD` (default 25 per shop per UTC month; extraction then answers 402 and the
cover note falls back to its template) and `GLOBAL_DAILY_LLM_CAP_USD` (default 200; `0` is the kill
switch, settable instantly with `wrangler secret put`). AI routes are also limited to 30 calls a
minute per user and uploads to 20 a minute per shop (`middleware/rate-limit.ts`, Workers Rate
Limiting bindings in `wrangler.jsonc`).
