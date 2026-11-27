# PayApps (in development)

Pay-application billing for specialty subcontractors: schedule of values, change orders, retainage,
and an application-for-payment summary + continuation sheet as PDF and CSV. Not an AIA document.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first; plans in [ROADMAP.md](ROADMAP.md); paid plans
(dark until the owner sets the Paddle secrets) in [docs/BILLING.md](docs/BILLING.md); deploying in
[docs/DEPLOY.md](docs/DEPLOY.md).

```sh
pnpm install                  # from the repo root
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev                      # http://localhost:5173
pnpm typecheck && pnpm test:unit && pnpm test:worker && pnpm build
```

## Browser tests

`pnpm test:e2e` (`scripts/e2e-run.sh`) runs the Playwright suite in `test/e2e` against the real Worker and
SPA, offline: a fresh local D1 and R2 in `.wrangler/e2e` from the committed migrations, account mail to an
in-memory fake (`FAKE_EXTERNALS=true`) and `BILLING_PROVIDER=none`. About 90 s, most of it starting the
server. CI runs it as the `payapps (browser e2e)` job.

1. A new subcontractor's first pay application, the path the free guides link to
   (`/?signup&from=...`): sign up, agree to the policies, add the company, a job and three schedule-of-values
   lines, bill work and stored materials, check the summary against the hand arithmetic (line 4, 5a, 5b, 8, 9),
   download the PDF and the continuation CSV, submit, record a short check, see the balance on the cash
   report, record the rest and see the application paid.
2. Two companies in two browsers: the other company's job, pay application and PDF answer 403/404 by page
   and by API, writes included.
3. Every page on that path at a 390 px phone width: none may scroll sideways as a whole. A failure names the
   elements that stick out.

`E2E_BASE_URL=http://localhost:5197 pnpm test:e2e` reuses a server you started with
`bash scripts/e2e-server.sh` (it does not watch files: restart it after an edit).
