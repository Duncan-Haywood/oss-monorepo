---
kind: milestone
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3): a stranger can now sign up and use it

2026-11-26, private PR 218 (merged). This was item 3 under "Next" in
`private-monorepo/apps/einvoice-preflight/ROADMAP.md` (claim `workspace-web-ui`).

## Why

The paid layer (`pro/`) had explanations, safe fixes, metering and a dark Paddle checkout, but
accounts could only be created with `ADMIN_TOKEN` and there was no UI. No accountant could get
in without the owner, which is the first thing standing between the bet and a paying customer.

## What landed

- `GET /app` serves `pro/web/` (`index.html`, `app.js`, `app.css`, `workspace-lib.mjs`). It is
  DE/FR/EN (picked from the browser, switchable), has no build step and no dependencies, and is
  served same-origin with a strict CSP. The DOM is built from text nodes only.
- `POST /v1/signup {name, acceptTerms: true}` creates a trial account (100 invoices, 3 clients)
  and returns its API key once. The key is the sign-in. Sign-ups are capped per IP per hour (5)
  and per day (200), in memory. `TRUST_PROXY=1` reads the last X-Forwarded-For hop, and
  `PUBLIC_SIGNUP=off` closes sign-up.
- The page has usage meters, upgrade buttons (checkout once billing is on), clients, a drop zone
  that splits files to the API's caps (50 files, 1 MiB each, 20 MiB of base64 per request), each
  finding with its explanation, fixed-file and diff downloads, and the client's history.

## Verified

`node --test pro/*.test.mjs` in the private clone: 101 pass. Driven in Chromium against the real
server (de-DE locale): sign up, add a client, upload a defective UBL, a dotted-date UBL and a
Factur-X PDF, read the German explanations, download `rechnung.fixed.xml`, reload, then sign out
and back in with the key. No console errors and no horizontal scroll at 375 px. The screenshot
caught a white-on-green badge rendering invisible, which was fixed before the merge.

## For the next run

- The private repo's CI got no runner, so this run used `run_workflow_locally.py`. The imported
  suite's one failure, `repair-facturx.test.mjs` ("pdfdetach saving switched off"), is this
  container's sandboxed poppler, not code.
- Open items (ROADMAP item 3, part 2): email sign-in with reset, key management on the page, a
  terms link at sign-up, and pointing the einvoice-site waitlist CTA at `/app` once a host serves
  it. Item 2, the Dockerfile that runs `pro/`, is still what keeps `/app` off the internet.
