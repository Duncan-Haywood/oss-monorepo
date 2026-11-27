# CMMC Workspace app: the sign-up screen no longer downloads every workspace tab (perf, 2026-11-27)

Bet #4 (`portfolio/monetization/bets.md`). A contractor's first contact with the app is
`ventures/cmmc/apps/cmmc`'s sign-in / sign-up screen. Before this change that screen downloaded all
fifteen signed-in views (dashboard, controls, POA&M, assets, providers, people, suppliers, policies,
SSP, affirmations, ISO 9001, documents, audits, settings, billing) and the CSV/sheet importers they
pull in. Same fix PayApps and Job Shop Quote got today
(`payapps-app-first-load-perf-2026-11-27.md`, `jobshop-quote-app-first-load-perf-2026-11-27.md`);
no earlier perf pass had touched the CMMC client (`cmmc-worker-tests-perf-2026-11-27.md` was the
Worker test suite).

## Reading (before)

`pnpm build` in `ventures/cmmc/apps/cmmc` on main at `0f5bc29f9`:

| file | raw bytes | gzip -9 bytes |
| --- | ---: | ---: |
| `assets/index-*.js` (the only script any page loads) | 584,728 | 160,267 |

This app has no router: `src/client/App.tsx` picks a screen from the path and a `tab` state, and
imported every view statically.

## Change

`App.tsx`: the fifteen workspace views are `React.lazy(() => import("./views/<View>"))`, rendered
inside one `<Suspense>` (fallback "Loading…", the same text the app shows while `/api/me` loads).
The sign-in / sign-up screen, account-email pages, legal pages, the legal-acceptance gate and the
unsubscribe page stay static: they are what a signed-out visitor reaches.

## After

| file | raw bytes | gzip -9 bytes |
| --- | ---: | ---: |
| `assets/index-*.js` | 288,420 | 88,092 |

-45% compressed at load. Largest lazy chunks: `csv-import` 10.0 kB gz (shared by the importers),
`People` 10.0 kB, `Assets` 9.8 kB, `Providers` 7.7 kB.

Wait time: both `dist/client` builds served by one Node server (gzip, `/api/*` answering 401 as for
a signed-out visitor), Chromium with 150 ms latency, 1.6 Mbit/s down, CPU 4x slower, time from
`goto("/sign-up")` to the "Create account" button, 7 runs interleaved before/after:
**median 1,483 ms before, 1,121 ms after** (before 1,474-1,671; after 1,102-1,147). Four requests
either way (document, script, stylesheet, `/api/me`).

## Verification

- `pnpm typecheck` clean; `biome check` clean on the file.
- `pnpm test:unit`: 44 files, 498 passed (view tests import the views directly).
- Signed-in smoke in Chromium against the built client, with `/api/me` and `/api/orgs/o1` stubbed
  (a member with legal accepted) and every other `/api/*` answering 500: `/?tab=settings` loads
  `index` + `Settings` chunk; clicking "Audits" fetches `Audits` + `quality`; the Audits view renders
  (its plan gate and the stubbed error text); no page errors.
- The Worker bundle (`dist/cmmc_workspace`) is unaffected: `App.tsx` is browser-only.

## Not changed (ranked, for the next run)

1. **Prefetch the dashboard after sign-in.** A signed-in user's first tab now waits one round trip
   for its chunk (about 5 kB gz for the dashboard). Calling `import("./views/Dashboard")` once
   `/api/me` answers with a user would hide it; measure first.
2. **react-dom** is most of what is left in the entry, as in PayApps and Job Shop Quote: not without a
   profile showing parse time matters.
3. `sync-from-private.sh` would overwrite this change on a re-sync from `private-monorepo`. Port it
   there or retire the sync, as noted for Job Shop Quote.
4. **seller-books** (bet #5) still imports all thirteen route modules statically in
   `apps/seller-books/src/client/router.tsx`; its routes total 4.6k lines, so expect a smaller win than
   here. Same `lazyRouteComponent` change as Job Shop Quote.
