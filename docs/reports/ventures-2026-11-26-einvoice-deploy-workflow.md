---
kind: milestone
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3): a deploy workflow, and the host named in the legal pages

2026-11-26, private PR 305 (merged), claim `hosting-part-2-deploy-workflow` on ROADMAP item 1.

## What landed

- `.github/workflows/einvoice-preflight-deploy.yml`, manual only. It runs the tests and installs
  `slimdom@4.3.5` and `wrangler@4.165.0` with `--no-save`, because the app has no package.json.
  Then it builds, provisions, syncs the Paddle catalog when the key is set, deploys `einvoice-pro`,
  syncs the secrets, generates `CHECKOUT_SECRET` once, and smoke-tests `/healthz`, `/v1/legal`,
  `/app` and the legal pages. Repository settings are listed in `docs/HOSTING.md`, "Deploying".
- `worker/provision.mjs`, with 9 tests. It creates D1 `einvoice-pro` with `--jurisdiction=eu`,
  which cannot be changed later. It fails if the listing shows another jurisdiction and warns if
  the listing shows none. It writes the git-ignored `wrangler.deploy.json`.
- `wrangler.jsonc` turns invocation logs off. They record request details, including client IPs,
  and the Privacy Policy says IPs are never written.
- The Privacy Policy and DPA (en/de/fr) now name Cloudflare, Inc. as the host, with its locations.
  Annex II states D1's AES-256 encryption at rest and Time Travel's 30-day backups, and DPA 7.2
  matches. The facts come from developers.cloudflare.com pages, which answered through the proxy
  this run.

## Verified

- `node --test pro/*.test.mjs worker/*.test.mjs` in the private clone: 167 pass.
- `wrangler deploy --dry-run` with the generated config: 2.0 MB gzipped, D1 bound, no config
  warnings.
- `wrangler dev`: every URL the smoke step checks answers as expected.
- Private CI was starved (`ci_starvation.py`: no runner assigned). Running
  `run_workflow_locally.py einvoice-preflight-ci` passed except the known container-only
  `repair-facturx.test.mjs` pdfdetach failure.

## For the next run

- The owner runs `einvoice-preflight-deploy` once. The Cloudflare secrets are already shared, so
  this needs no new account.
- After that, add `einvoice-pro` to `set-admins.yml`'s `apps`. It was left out so that the
  set-admins job does not fail while the Worker does not exist yet.
- Point einvoice-site's call to action at the Worker's `/app`.
- Re-read CPU per check from Workers Metrics.
- Check in the dashboard that the database's jurisdiction reads "eu". The listing may not report
  it.
