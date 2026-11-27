# PayApps client: one chunk per page, sign-up form first (2026-11-27)

Perf track, version 0, item 4 ("what visitors wait on"). There was no
agent-workable `perf:` backlog item (P063, P064 and P086 are owner rows).
The PayApps and jobshop-quote / seller-books worker-test suites already had
open perf PRs (#19715, #19702), so this run took the next PayApps cost: the
browser bundle every new sign-up downloads before the form appears. PayApps
is bet #1 and opened sign-ups today, so this page is the top of its funnel.

## Reading (before, `origin/main` `0aa770357`)

`pnpm build` in `ventures/payapps/apps/payapps`:

```
dist/client/assets/index-DsD20_Dv.js   1,400.56 kB │ gzip: 403.80 kB
dist/client/assets/src-CyQHvdx4.js        17.24 kB │ gzip:   7.28 kB
```

`src/client/router.tsx` imported all 25 page modules (pay app, certified
payroll, job cost, submittals, insurance exhibits and so on) at the top, so
the signed-out home page shipped the whole app as one 1.4 MB script.
(tesseract.js was already loaded on demand.)

## Change

- `router.tsx`: every route except the home page (sign-in, sign-up, org list)
  uses `lazyRouteComponent(() => import("./pages/<x>"), "<XPage>")`; the
  router sets `defaultPreload: "intent"`, so hovering or focusing a link
  fetches that page's chunk before the click. No route has a loader, so
  preload fetches code only, no data.
- `main.tsx`: a `vite:preloadError` handler reloads once (10 s guard in
  `sessionStorage`) when a chunk is missing. That happens when a tab stays
  open across a deploy and asks for chunk names the new deploy no longer has
  (`not_found_handling: single-page-application` answers with
  `index.html`). Without the handler the tab would show a blank page.

## Measurement

Build (after): entry `index` 292.87 kB (91.12 kB gzip), plus the
`api` chunk 69.2 kB and a 1.3 kB runtime that it preloads. The other pages are
47 chunks of 4 to 170 kB (`project` 170 kB, `certified-payroll` 109 kB,
`pay-app` 90 kB).

Browser: Playwright Chromium, both builds served from a local gzip server
(SPA fallback, `/api/*` answering 401 so the page shows the signed-out form),
CDP `Emulation.setCPUThrottlingRate` 4 and a 10 Mbps / 40 ms RTT link, a fresh
context per run, timed from `goto` until `input[type=email]` is visible. Nine
runs each:

| build | median ms | runs (ms) | bytes over the wire |
|---|---:|---|---:|
| before | **901** | 803 to 975 | 408,713 |
| after | **485** | 457 to 600 | 123,694 |

That is 46% less time to the sign-up form and 70% fewer bytes.

## Verification

- Same pages: `/`, `/forgot-password`, `/legal/terms` and `/unsubscribe`
  render the same text in both builds, with no page errors (Playwright,
  `#root` inner text).
- `pnpm typecheck`, `biome ci .` (no new warnings) and `pnpm test:unit`
  (149 files, 1,368 passed, 3 skipped) pass. The first unit run in this
  container exited 1, and the next two runs passed with nothing changed.
  Treat that as a possible flaky test to watch for, not something this change caused.
- `node ../../scripts/check-no-client-maps.mjs dist/client`: no source maps.
- `test:worker` was not run locally. It does not import `src/client`, and CI
  runs it.

## Not changed (ranked, for the next run)

1. **`project` chunk, 170 kB.** The project page pulls the components for
   waivers, lien notices, RFIs, submittals and QuickBooks in one go. Splitting
   its tabs would speed the first open of a job, the second page every user sees.
2. **`api` chunk, 69 kB, preloaded on the home page.** This is mostly the
   shared zod schemas (`schemas` 84 kB is a separate chunk). The home page
   probably needs only the auth client. Check what `home.tsx` imports from
   `lib/api` before moving anything.
3. **The 292 kB entry** is React, React DOM, TanStack Router and Query plus
   `Layout`. Further cuts need to go below the framework, so they are not worth doing.
