# Business continuity and disaster recovery

Status: draft, 2026-11-03. SOC 2: A1.1, A1.2, A1.3, CC9.1.

The stated commitment is **best effort, no SLA** (the site footer, "Best-effort
hosting, no SLA"). This plan says how the portfolio recovers anyway.

| What fails | Recovery | Target |
|---|---|---|
| Cloudflare Workers serving the site | `portfolio-pages.yml` falls back to serving the full site on GitHub Pages when the Cloudflare deploy cannot run (`portfolio/hosting/README.md`) | Next scheduled build (≤ 3 h) |
| A bad deploy | Revert the PR; the next build redeploys `main` | ≤ 1 h after it is noticed |
| The repository (deleted, corrupted) | Every full clone is a backup of code and site; `research-archive.yml` keeps the former research repository's branches and PRs here | A day |
| D1 (counts, feedback, inbox) | Counts and feedback are copied into the repository by the pull jobs, so they rebuild from git. Inbox mail is not backed up on purpose: its only copy is D1, and D1 Time Travel can restore a point from the last 7 days on the free plan | Counts/feedback: a day. Inbox: accepted loss |
| The Cloudflare account | Point DNS elsewhere and serve from GitHub Pages | Days; needs the owner |
| The owner unavailable | Agents keep the site building from `main`; nothing that needs the owner (money, accounts, notices) can happen | — |

## Test

Once a year, an agent rehearses one row: for example, build the site locally
from a fresh clone with `python3 platform/ci/build_pages_site.py` and time
it, or restore a D1 copy into a scratch database. Record it here. That is the
evidence for `av-dr` and `dt-backup`.

| Date | Row tested | Time to recover | Notes |
|---|---|---|---|
| | | | |
