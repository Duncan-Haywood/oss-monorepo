---
kind: milestone
date: 2026-11-27
subjects: [payapps]
---
# PayApps: a stranger's first run at phone width (2026-11-27)

What a later run needs to know from a visual walk of sign-up and the sample job.

## How to walk the app

- `bash apps/payapps/scripts/e2e-server.sh` (from `ventures/payapps/apps/payapps`, after
  `pnpm install --frozen-lockfile` in `ventures/payapps`) starts the real Worker and SPA offline on
  :5197 with a fresh local D1. Start it with `run_in_background`; `/api/health` answers within
  about a minute.
- **It does not hot-reload.** The e2e Vite config serves the code as it was at start, so after an
  edit, stop it (`pkill -f '[v]ite dev --config test/e2e'`) and start it again.
- `E2E_BASE_URL=http://localhost:5197 pnpm exec playwright test --trace off` runs the three specs
  against it in about 20 s.
- A Playwright script that signs up, creates a company, clicks "Try a sample job" and screenshots
  at 390 px, then reads each `h2`'s page offset, finds buried sections faster than screenshots do.
  The e2e tests check that a page fits a phone, not where things land on it.

## What it found, and what changed

| Finding (390 px) | Change |
|---|---|
| Pay applications at 4,795 px of a 6,200 px job page, under the RFI, schedule, punch-list and close-out forms; the sample banner says "open an application" | First on the page once a job has an application (764 px), after the schedule of values before that; an "On this page" jump bar; the banner links to the list |
| The add-change-order form kept seven inputs in one 12-column row; on a phone they read "Desc" and "Amo" | Two columns on a phone, the old row from `sm` up |

## Seen, not changed

- After "Create" on the new-company form, the page keeps showing the company list (the name still
  in the box, the button greyed) for a moment before the company page loads. Harmless, but a
  stranger may click again.
- The change order table's action links (PDF, Files, History, Email, Approve...) wrap one per line
  in a narrow column on a phone; the table scrolls inside its box, so nothing is lost.
- The job page is still about 6,300 px on a phone. Folding the RFI, schedule, punch-list and
  close-out forms behind a button until used would shorten it further, if people ask.
