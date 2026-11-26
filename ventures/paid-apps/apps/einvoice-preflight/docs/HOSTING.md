# Hosting the paid layer: a Node host now, D1 kept open

Roadmap item 1, decided 2026-11-26 from what the code needs, not from what the other apps use.

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
| Checker core | needs a port: no `node:fs` rule loading, bundle size and per-request CPU limits apply to Saxon plus 7 MB of rules (not measured: run `wrangler deploy --dry-run --outdir` on a port before choosing this) | runs as it is, the same code the CI tests |
| Store | D1 | SQLite file (`PRO_DB_FILE`), WAL mode |
| Ops | no server, owner's existing Cloudflare account | one small container (the existing `Dockerfile`), a volume, and a backup of one file |
| Owner steps | none new | an account with a Node container host (needs a card: an owner step) |

## Decision

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
