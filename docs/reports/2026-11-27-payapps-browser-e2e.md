# PayApps: a browser e2e suite, and what it found on a phone (2026-11-27)

For the next run working on PayApps (bet #1). PayApps went live on the Free plan this morning, but had no
browser test: 1,362 unit tests and the worker suite check the math and every route, and nothing checked
that a stranger arriving from a free guide can actually get to a paid pay application in a browser.

## What landed

`ventures/payapps/apps/payapps/test/e2e` (Playwright 1.63.0, same harness as seller-books):
`pnpm test:e2e` starts the real Worker + SPA offline (fresh local D1/R2, `FAKE_EXTERNALS=true`,
`BILLING_PROVIDER=none`) and runs three specs, about 90 s in all. CI runs it as `payapps (browser e2e)`
in `payapps-ci.yml`. The README's "Browser tests" says what each spec covers.

## What it found (all fixed in the same PR)

- **The company page was 859 px wide on a 390 px phone.** The ten links next to "Projects" sat in a
  `flex` row that could not wrap. This is the first page after sign-up, so every phone sign-up saw a page
  that scrolled sideways. Now `flex-wrap`.
- **The job page was 567 px wide.** The schedule-of-values, change-order and pay-application tables had
  no scroll box. Each is now inside `overflow-x-auto`, as the pay-app page's continuation sheet already was.
- **The pre-submit checks printed "$250000.00".** `payapp-math.ts` had its own `toFixed(2)` formatter;
  it now uses `formatCents` from `money.ts` (negatives read "-$1.00" instead of "$-1.00").
- **A returning user saw "Add your company" under the company they already had.** It now says "Add
  another company" and what a second company is for.

## Notes for the next run

- `scripts/e2e-server.sh` does not watch files. After editing the app, kill the server
  (`kill $(lsof -t -i:5197)`) or the next run tests the old code. Cold start is about 60 s.
- The phone-width spec lists the outermost elements that stick out, so a failure names what to fix.
- Not covered yet: change orders and a second application, the sample job, an invited PM by email link,
  and the paid plans (dark: `BILLING_PROVIDER=none`). Seller-books' `confirmCheckout` helper shows how to
  test checkout with the fake provider once PayApps' e2e turns billing on.
- `/home` for a one-company user still shows a list rather than going straight to the company. That
  was left alone on purpose: invitations are accepted on that page.
