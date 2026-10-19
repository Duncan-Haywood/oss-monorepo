# No Surprises Act IDR Offer Calculator

Free, browser-only tool for out-of-network providers and billing teams disputing
payments under the No Surprises Act. List each claim with its billed charge, the
payer's QPA and the amount already paid, enter the current fees and your own
win-chance assumptions, and it shows the offer with the best expected net, the win
chance you need to break even, which claims are worth taking to federal IDR, how
much rides on the win-chance assumption, and the open negotiation and IDR
initiation dates. No patient information is needed; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/nsa-idr-offer-calculator/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, win-chance curve, expected net, break-even, offer search, deadlines, CSV.
- `cli.mjs` - the same sizing in a terminal, for billing teams that export claims from a practice-management system: `node cli.mjs claims.csv --admin-fee 115 --entity-fee 700` (fees are whatever the federal IDR portal currently says; they default to zero), `--csv`, `--json`, `--example`, and `--deadlines 2026-03-02 --holidays 2026-05-25` for the negotiation and initiation dates. Zero dependencies, no network; tests in `cli.test.mjs`.
- `usage.mjs` - local-only feature counters with an opt-out.

## Host your own copy

Claim figures are sensitive billing detail, so you can serve the page from an address you control. It is a static site:
the server only hands out files and never sees a figure you type.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files, so
  build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.

## What you use today, and what this does differently

- **A spreadsheet:** free and private, but the offer search over a win-chance curve, the break-even per claim and the
  sensitivity to your assumption are yours to build and keep correct.
- **Managed IDR services:** they run the dispute for you and take a share of recovery. This decides which claims are
  worth filing and what to offer, free, before you pay anyone.
- **What this adds:** a per-claim expected-net offer search, a break-even win chance, a sensitivity table, the
  negotiation and initiation dates, a CLI for claim exports, and no signup, no patient data and no upload.

**No warranty.** Free and as-is; arithmetic on figures you type, not legal or
billing advice. The win-chance curve is the user's assumption, not a prediction of
an arbitrator's decision, and the tool carries no fee schedule or QPA of its own.
Unverified against real IDR outcomes: tested on hand-calculated examples.

MIT licence, see `LICENSE`.
