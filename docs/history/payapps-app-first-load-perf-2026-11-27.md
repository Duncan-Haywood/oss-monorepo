# PayApps app: first load downloads the sign-in page, not all 25 pages (perf, 2026-11-27)

Bet #1 (`portfolio/monetization/bets.md`). Every new subscriber's first contact with the app is
`apps/payapps`'s home page: sign up or sign in. Before this change that page downloaded the whole app.

## Reading (before)

`pnpm build` in `ventures/payapps/apps/payapps` on main at `0aa770357`:

| file | raw bytes | gzip -9 bytes |
| --- | ---: | ---: |
| `assets/index-*.js` (the only script the page loads) | 1,400,560 | 398,798 |

Where it went (a one-off client build with source maps into a scratch directory, summing
`sourcesContent` per source): about 2.2 MB of source from our own `src/client/pages/*` and the
`src/shared/*` modules only those pages use (SOV import, PDF reader, certified-payroll formats,
cash report, insurance exhibit), 620 KB react-dom, 361 KB zod (used only by the certified-payroll
schemas), 300 KB TanStack router and query. `src/client/router.tsx` imported all 25 page modules
statically.

## Change

`router.tsx`: the 21 signed-in pages (org, project, pay app, cash, estimates, ...) use TanStack
Router's `lazyRouteComponent(() => import("./pages/<page>"), "<Export>")`. The layout, home
(sign-in), account-email pages (forgot/reset/verify), legal and unsubscribe stay static, because the
layout and home import them anyway and they are the pages a signed-out visitor reaches.

## After

| file | raw bytes | gzip -9 bytes |
| --- | ---: | ---: |
| `assets/index-*.js` | 363,594 | 113,864 |
| `assets/rolldown-runtime-*.js` (modulepreloaded) | 1,301 | 742 |

-71% compressed at load. Wait time: both `dist/client` builds served by one static Node server
(gzip, `/api/*` answering 401 as for a signed-out visitor), Chromium with 150 ms round trip,
1.6 Mbit/s down, CPU 4x slower, time from `goto` to the "Sign in" text, 7 runs interleaved
before/after: **median 2,982 ms before, 1,407 ms after** (before 2,960-3,133; after 1,362-1,515).

## Verification

- `pnpm typecheck` clean; `biome check` clean on the file.
- `pnpm test:unit`: 1,368 passed, 3 skipped (tests import pages directly, not the router).
- `vite preview` with local D1 migrations, Playwright: `/` renders the sign-in page with two
  scripts; direct visits to `/orgs/x/cash`, `/orgs/x/projects/y`, `/orgs/x/estimates` fetch their page
  chunk and render; a client-side `pushState` to `/orgs/x/wip` fetches `wip-*.js` and renders; no
  page errors (only the signed-out API 401s).
- The Worker bundle is unaffected (the router is browser-only).

## Not changed (ranked, for the next run)

1. **Prefetch on intent.** TanStack Router can preload a route's chunk on link hover
   (`defaultPreload: "intent"`). A signed-in user's first click on a page now waits one round trip
   for its chunk; the project page pulls ~20 chunks (largest `project-*.js` 170 KB raw). Measure a
   signed-in click before adding it, since preloading also runs the route loaders.
2. **zod (361 KB source) in `schemas-*.js`.** Now loads only with certified payroll; a lighter
   validator there is a product decision, not a perf one.
3. **react-dom (620 KB source)** is most of what is left in the entry. Preact/compat would cut it but
   changes the runtime under 25 pages; not worth it without a profile showing parse time matters.
4. `vite.config.ts`'s comment names `scripts/check-no-client-maps.mjs`, which does not exist in this
   tree (the client build still sets `sourcemap: false`). Worth adding the check or fixing the comment.
