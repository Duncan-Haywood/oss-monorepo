# Hosting the paid layer: Cloudflare Workers + D1, the Node container kept

Roadmap item 1, decided 2026-11-26 from what the code needs, not from what the other apps use.
**Revised the same day, from measurements** (section "On Cloudflare Workers" below): the Worker
port the first decision left unmeasured was built and run. It answers identically to the Node host
on every example file and needs no new owner account, so it is the recommended host. The Node
container below stays supported and is the only route that runs Saxon.

## What the paid layer needs at run time

- **The checker core is Node.** `report.mjs` loads the official EN 16931, XRechnung and Peppol
  Schematron through `schematron.mjs` and `plain-node.mjs`, which read rule files from disk with
  `node:fs`; the Dockerfile compiles the Saxon (SEF) files at build time and ships `saxon-js`,
  `fontoxpath` and `slimdom` beside them. `plain/` alone is 7 MB of rule JSON.
- **Work per request is CPU-bound and bursty.** A batch is up to many invoices, each parsed,
  checked, fixed and re-validated (`pro/check.mjs`). Accountants drop a month of a client's
  invoices at once.
- **State is small and relational:** accounts, hashed keys, clients, run history (hashes and rule
  ids only, never invoice contents) and monthly usage counters that must not overshoot a plan.

## The two options

| | Cloudflare Worker + D1 (as payapps, jobshop-quote, cmmc) | One Node process + SQLite |
|---|---|---|
| Checker core | ported 2026-11-26 (`worker/`): the plain route (fontoxpath + slimdom) with the rules embedded; 2.0 MB gzipped, 40-440 ms CPU per invoice, so Workers Paid (the free plan's 10 ms is far too little) | runs as it is, the same code the CI tests, Saxon where its SEF files are built |
| Store | D1 | SQLite file (`PRO_DB_FILE`), WAL mode |
| Ops | no server, owner's existing Cloudflare account | one small container (the existing `Dockerfile`), a volume, and a backup of one file |
| Owner steps | none new: Workers Paid is already on the account for Grant Autopilot (`apps/grants/docs/DEPLOY.md`); create the D1 database and deploy | an account with a Node container host (needs a card: an owner step) |

## Decision (first, 2026-11-26 morning; superseded by "On Cloudflare Workers" for the choice of host)

1. **Run the paid API as one Node process with the SQLite store.** It is the only option that runs
   the official Schematron today with no port, and correctness of the check is the product. The
   store is `pro/sql-store.mjs` (`SqlStore` on `node:sqlite`, built into Node 22.13+, so the
   folder stays dependency-free). Quotas are one conditional `UPDATE ... RETURNING`, so a second
   process on the same file cannot overshoot a plan.
2. **Keep the Worker path open, not built.** The same `SqlStore` has a D1 driver (`d1Db`), run in
   the contract tests through a D1-shaped shim (not a real D1). If accounts, billing and the web
   UI move onto a Worker beside the other apps, they keep this store and call the Node checker as
   a backend. Revisit when the web UI (roadmap item 4) is built.
3. **No host is chosen here.** Picking and paying for a Node container host is the owner's step
   (an account with a card). Any host that runs the `Dockerfile` with one persistent volume works;
   back up the SQLite file (a WAL-safe copy: `VACUUM INTO`) daily.

## How to run it

```
PRO_DB_FILE=/data/einvoice.db ADMIN_TOKEN=... node pro/server.mjs
```

That is the paid API alone. The hosted product runs **`node pro/serve.mjs`**: the same API and
workspace plus the free pages (`/`, `/create.html` and the modules they import) on one port, so
one container answers everything. It also serves `/fonts/*.ttf`, which the generator page
fetches for its Factur-X PDF and the free server alone never served. The free JSON API (`/v1/validate`, `/v1/repair`,
`/v1/generate`) is off there, since the pages check in the browser and that API has no metering;
`FREE_API=on` serves it.

### The container

`Dockerfile.pro` builds that image. Build it from the **repository root**, because `pro/` imports
`../../../packages/billing/src` (TypeScript, run by Node's built-in type stripping, on by
default from Node 22.18):

```
docker build -f apps/einvoice-preflight/Dockerfile.pro -t einvoice-pro .
docker run -p 8080:8080 -v einvoice-data:/data -e ADMIN_TOKEN=... einvoice-pro
```

`Dockerfile.pro.dockerignore` keeps the build context to this app and `packages/billing/src`.
`PRO_DB_FILE` defaults to `/data/einvoice.db`; mount the host's one persistent volume there.
The MIT `Dockerfile` is unchanged: it is the self-hostable free edition, not the product.

Checked 2026-11-26 with Docker 29: the runtime stage built and ran (`/`, `/app`, `/healthz`,
trial sign-up, `POST /v1/check`, the PDF fonts, an account still there after a restart). The Schematron stage
was stubbed in that run because the session's build containers had no network; it is the same
stage as the MIT `Dockerfile`'s.

`PRO_DATA_FILE` (one JSON file) and the in-memory store stay for the demo and tests. On Node 22,
`node:sqlite` prints an ExperimentalWarning once at start; it is expected.

## On Cloudflare Workers (2026-11-26, measured)

`worker/index.mjs` runs the same paid handler (`pro/server.mjs` `createProHandler`) in a Worker:
`pro/fetch-adapter.mjs` turns a fetch `Request` into the few parts of `node:http` the handler
uses, the `SqlStore` runs on the D1 binding (`d1Db`, the driver the contract tests already
covered), and the official rules run on the plain route with the rule sets embedded at build time
(`worker/build.mjs` writes the git-ignored `worker/files.generated.mjs`: the workspace page, the
legal texts in three languages, the PDF fonts and `plain/*.json`). `pro/app-files.mjs` is the one
seam: on Node it reads the disk, in the Worker the embedded copy. The entry lives in `worker/`,
not `pro/`, because it imports slimdom and `pro/` stays free of npm modules.

```
cd apps/einvoice-preflight
npm i --no-save slimdom@4.3.5        # MIT XML parser for the plain route (fontoxpath ships in plain/)
node worker/build.mjs                # embeds the files (68, 7.1 MB of text)
wrangler dev                         # local D1; or `wrangler d1 create einvoice-pro`, put its id in
                                     # wrangler.jsonc, then `wrangler deploy`
```

**Measured** (wrangler 4.165.0, local workerd, 2026-11-26; `eval/worker-parity-2026-11-26.md`):

- **Same answers as the Node host on every example file:** `eval/worker-parity.mjs` sends the 42
  `examples/*.xml` and `*.pdf` files to `POST /v1/check?schematron=1&fix=1` on both, each with
  its own trial account: **42 of 42 response bodies identical**, findings, explanations, fixes and
  the official-rules status included. Both ran the plain route (this session had no Saxon SEF
  files), so this shows the port changes nothing; it does not compare Saxon with plain, which the
  README's cross-checks cover for several sets (whitespace, Croatia, Peppol unit tests).
- **Bundle:** 11.0 MB, **2.0 MB gzipped** (`wrangler deploy --dry-run`), under the 10 MB limit
  of Workers Paid (and the free plan's 3 MB). Importing the whole Worker in Node takes 382 ms of
  CPU, under the 1 s start-up limit.
- **CPU per invoice** (warm, plain route alone, Node, 5 runs each): 40 ms (an XRechnung CII
  credit note) to 440 ms (the CIUS-PT invoice); most EN 16931 + Peppol/XRechnung files 50-230 ms.
  That rules out the free plan's 10 ms and fits Workers Paid's 30 s default; `wrangler.jsonc`
  sets `limits.cpu_ms` to 60 000 so a 50-invoice batch at the slowest set (about 22 s) fits.
- **Also run in workerd:** sign-up, the workspace page and legal pages (all three languages),
  `/v1/legal`, metering headers, a client and a four-file batch (UBL, CII, Factur-X PDF) with
  history, the fonts byte for byte, the free API's 404, and the account still there after
  restarting `wrangler dev` (local D1).

**What differs from the container, and what to watch:**

- **No Saxon.** Every set runs on the plain route, as on the free page; PINT, ZATCA and the
  national sets already ran there on the container too.
- **Only the paid half.** `/`, `/healthz`, `/app*`, `/v1/*`, `/api/admin/*` and `/fonts/*.ttf`;
  the free pages stay on the public site and the free JSON API answers 404 as on the container.
- **Sign-up caps are per isolate** (`signupLimiter` is in memory), so they loosen with the number
  of isolates; `PUBLIC_SIGNUP=off` still closes sign-up. A D1-backed cap is the fix if trial
  abuse shows up.
- **No model explanations** unless the Anthropic SDK is bundled (`loadLlmFromEnv` imports it by a
  variable name, which the bundler leaves out); every built-in rule has its template, so only the
  long tail goes unexplained.
- **Mail sends** are handed to `ctx.waitUntil` so a Worker does not stop them when it answers.
- **Not yet done:** a run on Cloudflare itself (the deploy workflow below is built, not yet run),
  where the CPU numbers above should be re-read from Workers Metrics.

## Deploying (2026-11-26)

`.github/workflows/priv-einvoice-pro-deploy.yml` in oss-monorepo (ported 2026-11-27 from
private-monorepo's `einvoice-preflight-deploy.yml`), run by hand from `main` (Actions -> einvoice-pro-deploy
-> Run workflow). Nothing deploys on a merge or from a pull request. It runs the tests, installs
`slimdom@4.3.5` and `wrangler@4.165.0` (the version `pnpm-lock.yaml` pins for the other apps) with
`--no-save`, builds the embedded files, then `worker/provision.mjs`:

- creates the D1 database `einvoice-pro` with **`--jurisdiction=eu`**, so it runs and is stored
  only in the EU ([Cloudflare: data location](https://developers.cloudflare.com/d1/configuration/data-location/)).
  A jurisdiction can be set only when a database is created, so this is code, not a dashboard
  click. An existing database is kept; the run fails if the listing says it sits in another
  jurisdiction and warns if the listing does not say (check it in the dashboard).
- writes `wrangler.deploy.json` (git-ignored) beside `wrangler.jsonc` with the database id and
  either `EINVOICE_DOMAIN` as a custom domain or `einvoice-pro.<subdomain>.workers.dev`.

Then it syncs the Paddle catalog (only with `EINVOICE_BILLING_API_KEY`), deploys, syncs the
non-empty secrets, generates `CHECKOUT_SECRET` once if missing (never overwritten) and smoke-tests
`/healthz`, `/v1/legal`, `/app` and the three legal pages.

| Repository setting | Kind | What it does |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secrets (shared) | D1 and Workers Scripts edit; Zone, DNS and Workers Routes edit for a custom domain |
| `EINVOICE_DOMAIN` | variable | custom domain on a zone in the same account; empty = workers.dev |
| `EINVOICE_BILLING_PROVIDER` | variable | `paddle` turns paid plans on; default `none` (dark) |
| `EINVOICE_BILLING_API_KEY`, `EINVOICE_BILLING_WEBHOOK_SECRET` | secrets | Paddle (docs/BILLING.md); the price ids are read back from the catalog sync |
| `EINVOICE_EMAIL_PROVIDER`, `EINVOICE_EMAIL_FROM`, `EINVOICE_RESEND_API_KEY` | variables, secret | email sign-in (`resend`, one bare sender address; pro/README.md "Email sign-in") |
| `EINVOICE_OWNER_NOTIFICATIONS` | variable | `on` logs a new paid subscription for the owner |
| `EINVOICE_ADMIN_TOKEN` | secret | `POST /v1/admin/accounts` (operator-made accounts); optional |

`ADMIN_SERVICE_TOKEN` and `ADMIN_METRICS_TOKEN` (the owner console and the agents' metrics) are
not synced here: once the Worker exists, `einvoice-pro` belongs in `set-admins.yml`'s `apps` list
(apps/admin/README.md).

**Logs.** `wrangler.jsonc` keeps Workers Logs on for console output (short error messages, never
a key or an invoice; 7 days on Workers Paid) and turns **invocation logs off**: they record each
request's details, the client IP among them, and the Privacy Policy says IPs are never written.

**The usage settlement clock** (2026-11-27, `worker/settle-clock.mjs`). The Worker also exports a
Durable Object, `SettleClock` (binding `SETTLE_CLOCK`, migration `v1`, SQLite-backed, so on the Free
plan), whose alarm runs every 6 hours and settles each closed month of the metered `api` plan from
06:00 UTC on the 1st (docs/BILLING.md, "Usage above the minimum"). It is an alarm because the
account's 5 cron triggers are all in use (`platform/ci/cron_budget.py`). The first request to a new
isolate arms it, and each alarm sets the next one before it runs. It stores one value, the last
month settled (`"2026-11"`): no account, key or invoice data, so the DPA's annexes are unchanged.
While `BILLING_PROVIDER` is `none` each run logs `usage_settlement.unavailable` and does nothing.
Set the variable `USAGE_SETTLEMENT=off` to stop it. Rolling back to a version from before the class
existed needs a `deleted_classes` migration first, so roll forward instead.

**Backups.** D1 Time Travel is always on and restores to any minute of the last 30 days on Workers
Paid ([Cloudflare: Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/));
`wrangler d1 time-travel restore einvoice-pro --timestamp=<unix>`. The DPA's Annex II and section
7.2 say exactly this, so no separate copy is made.

**Rollback.** `wrangler rollback <version-id> --name einvoice-pro` (the run summary prints the
version id). The SqlStore's schema has so far only added tables and columns (`CREATE TABLE IF NOT
EXISTS`, `ADD COLUMN`), so an older version runs on a newer database; keep it that way.

**What the legal pages now say** (pro/legal, English, German and French, 2026-11-26): Cloudflare,
Inc. is the hosting sub-processor (Privacy Policy "Subprocessors", DPA Annex I.B and Annex III),
the database is stored in the EU, requests are handled at the nearest Cloudflare data center
(which can be outside the EU) and error logs may be stored outside the EU; encryption at rest is
D1's AES-256 ([Cloudflare: D1 data security](https://developers.cloudflare.com/d1/reference/data-security/));
backups are Time Travel's 30 days. If the host changes, change those pages first.
