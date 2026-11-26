---
kind: milestone
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3): the paid product now has a container to run in

2026-11-26, private PR 226 (merged). This was item 2 under "Next" in
`private-monorepo/apps/einvoice-preflight/ROADMAP.md` (claim `run-the-paid-api-in-the-container`),
picked on an explore run.

## Why

`/app`, trial sign-up and the paid API were built and tested, but the only `Dockerfile` started
the free `server.mjs`. Even once the owner picks a host, nothing deployable would have served
the paid product. That made this the last code step before "Hosting, part 2" (an owner step:
a host account with a card).

## What landed

- `pro/serve.mjs` runs one process on one port. `/app`, `/healthz` and `/v1/*` go to the paid
  handler. Everything else (`/`, `/create.html`, the page modules) goes to the unchanged MIT
  `server.mjs`, through its `request` event. The free JSON API is off by default (a JSON 404
  that names `/v1/check`) because the pages check in the browser and that API has no metering.
  `FREE_API=on` turns it back on.
- It also serves `/fonts/*.ttf`. The generator page fetches them for its Factur-X PDF, and the
  free server never served them, so a PDF generated on a hosted copy would have failed.
- `Dockerfile.pro` is built from the private repo's root, since `pro/` imports
  `../../../packages/billing/src` (TypeScript, run by Node 22.18+ type stripping; the build fails
  on older Node 22). A per-Dockerfile `.dockerignore` keeps the context at about 35 kB of
  changes. SQLite lives on a `/data` volume.

## Verified

- `node --test pro/*.test.mjs`: 105 pass, including the new `pro/serve.test.mjs`.
- The imported root suite: 2,179 pass and 1 fails. The failure is
  `repair-facturx.test.mjs`'s poppler test, which fails the same way on private `main`
  (this container's sandboxed poppler).
- The private CI job got no runner (`ci_starvation.py`, exit 0, runner_id 0).
- Docker 29 in the cloud session: `dockerd` starts as root here. The runtime stage built and ran:
  `/` 200, `/app` 200, sign-up 201, `POST /v1/check` passes, fonts 200, free API 404, and the
  account was still there after `docker restart`. The Schematron build stage was stubbed
  because build containers have no DNS through the session proxy (apk fails). That stage is
  identical to the MIT Dockerfile's.

## For the next run

- Docker works in cloud sessions: run `dockerd` in the background, then `docker build`. Image
  pulls go through the daemon's proxy, but `RUN` steps that need the network fail.
- What stands between bet #3 and a paying accountant is now owner-side: a container host with
  one volume (ROADMAP item 1), Paddle secrets, a domain, and the `plain/` rule-set licence
  decision. The code side left is ROADMAP items 2 to 4 (email sign-in, keys on the page, the
  site's checked/not-checked lists).
