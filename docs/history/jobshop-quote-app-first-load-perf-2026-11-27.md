# Job Shop Quote app: first load downloads the sign-up page, not every page (perf, 2026-11-27)

Bet #2 (`portfolio/monetization/bets.md`). A shop's first contact with the app is
`apps/jobshop-quote`'s sign-up or sign-in page, and a shop's customer first sees the `/q/<token>`
quote page. Before this change both downloaded the whole app. This is the same fix PayApps got the
same day (`payapps-app-first-load-perf-2026-11-27.md`); no earlier perf pass had touched Job Shop
Quote.

## Reading (before)

`pnpm build` in `ventures/jobshop-quote/apps/jobshop-quote` on main at `bf5b1610b`:

| file | raw bytes | gzip -9 bytes |
| --- | ---: | ---: |
| `assets/index-*.js` (the only script any page loads) | 718,016 | 209,688 |

`src/client/router.tsx` imported all 16 route modules statically, including the rate card
(1,957 lines plus the CSV/sheet import), quote detail (2,034 lines) and the zod schemas they pull in.

## Change

`router.tsx`: the org layout, the nine signed-in pages (quote log, win/loss, rate card, routings,
RFQs, RFQ detail, quote detail, team, billing) and the customer quote page use TanStack Router's
`lazyRouteComponent(() => import("./routes/<file>"), "<Export>")`. Home, sign-in/up, the
account-email pages, legal, onboarding and invite stay static: they are what a signed-out visitor
reaches and they import each other (`public` -> `account`, `legal`).

## After

| file | raw bytes | gzip -9 bytes |
| --- | ---: | ---: |
| `assets/index-*.js` | 362,282 | 114,186 |

-46% compressed at load. The largest lazy chunks: `rate-card` 93 kB raw, `schemas` 87 kB,
`quote-detail` 52 kB; `customer-quote` is 8 kB.

Wait time: both `dist/client` builds served by one static Node server (gzip, `/api/*` answering 401
as for a signed-out visitor), Chromium with 150 ms round trip, 1.6 Mbit/s down, CPU 4x slower, time
from `goto("/sign-up")` to the "Create your account" text, 7 runs interleaved before/after:
**median 1,691 ms before, 1,126 ms after** (before 1,675-1,724; after 1,105-1,198). Single runs on
other signed-out pages: `/` 1,868 -> 1,324 ms, `/legal/terms` 1,708 -> 1,183 ms.

## Verification

- `pnpm typecheck` clean; `biome check` clean on the file; `check-no-client-maps.mjs dist/client`
  passes.
- `pnpm test:unit`: 49 files, 643 passed (tests import route modules directly, not the router).
- The same Chromium harness: `/sign-up`, `/`, `/legal/terms` load one script with no page errors;
  `/app/x/rfqs` fetches `layout-*.js` and `rfqs-*.js` and redirects a signed-out visitor to sign-in,
  as before.
- `pnpm test:e2e` (16 specs, real Worker, local D1, offline fakes): walks the signed-in pages and the
  customer link through the lazy chunks. Result in the run record's `notes`.
- The Worker bundle (`dist/jobshop_quote`) is unaffected: the router is browser-only.

## Not changed (ranked, for the next run)

1. **Prefetch on intent** (`defaultPreload: "intent"`). A signed-in user's first click on a page now
   waits one round trip for its chunk. Measure a signed-in click before adding it, since preloading
   also runs route loaders.
2. **The customer quote page** now loads the entry (114 kB gz) plus its 8 kB chunk, one round trip
   after the entry. A separate HTML entry for `/q/*` with only that page would cut it further; worth
   it only if customer-link traffic shows up in the usage readings.
3. **react-dom** is most of what is left in the entry. Same reasoning as PayApps: not without a
   profile showing parse time matters.
4. `sync-from-private.sh` would overwrite this change if anyone re-synced from `private-monorepo`;
   the README's "Where the work happens" still names the private copy as the build source although
   the deploy now runs from this tree (DEPLOY.md). Port the change there or retire the sync.
