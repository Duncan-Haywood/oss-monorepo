# Seller Books app: the sign-up screen no longer downloads the books and tax pages (perf, 2026-11-27)

Bet #5 (`portfolio/monetization/bets.md`, reseller profit and Schedule C books). A reseller's first
contact with the app is `ventures/seller-books/apps/seller-books`'s sign-up or sign-in screen. Before
this change that screen downloaded all thirteen signed-in pages (P&L, imports, sales, inventory,
stock, mileage, expenses, Schedule C, quarterly estimates, 1099-K, members, billing, settings) and
the importers they pull in. Same fix PayApps, Job Shop Quote and CMMC got today
(`payapps-app-first-load-perf-2026-11-27.md`, `jobshop-quote-app-first-load-perf-2026-11-27.md`,
`cmmc-app-first-load-perf-2026-11-27.md`); no earlier perf pass had touched this client
(`reseller-books-perf-*.md` are the free Reseller Books page's CSV parser).

## Reading (before)

`pnpm build` in `ventures/seller-books/apps/seller-books` on main at `8765258b8`:

| file | raw bytes | gzip -9 bytes |
| --- | ---: | ---: |
| `assets/index-*.js` (the only script any page loads) | 480,229 | 139,773 |

`src/client/router.tsx` imported every route module statically.

## Change

`router.tsx`: the `/o/$orgId` layout and its thirteen child pages use TanStack Router's
`lazyRouteComponent(() => import("./routes/<module>"), "<Export>")`. Sign-in, sign-up, the org
picker, invitations, account-email pages, legal pages and unsubscribe stay static: they are what a
signed-out visitor reaches, and `public.tsx` / `legal.tsx` are imported by the lazy pages anyway.

## After

| file | raw bytes | gzip -9 bytes |
| --- | ---: | ---: |
| `assets/index-*.js` | 360,967 | 112,900 |

-19% compressed at load. Smaller than the other three bets because this client was already lean:
what is left in the entry (a one-off build with client source maps, summing `sourcesContent`) is
react-dom 635 KB source, TanStack query-core 151 KB and router-core 150 KB, react-router 57 KB, and
only about 50 KB of our own code (the public pages and the Markdown renderer the legal pages use).
Lazy chunks: `imports` 7.5 kB gz, `org` (layout + P&L) 6.0 kB, `tax` 5.6 kB, `logs` 5.2 kB, the rest
under 4.1 kB.

Wait time: both `dist/client` builds served by one Node server (gzip, SPA fallback, `/api/*`
answering 401 as for a signed-out visitor), Chromium with 150 ms latency, 1.6 Mbit/s down, CPU 4x
slower, time from `goto("/signup")` to the "Create account" text, 7 runs interleaved before/after:
**median 1,343 ms before, 1,212 ms after** (before 1,305-1,711; after 1,188-1,237). Same request
count either way.

## Verification

- `pnpm typecheck` clean; `biome check` clean on the file.
- `pnpm test:unit`: 37 files, 365 passed (tests import route modules directly, not the router).
- Signed-in smoke in Chromium against both built clients, with `/api/me` stubbed (an owner of org
  `o1`, legal accepted) and every other `/api/*` answering 500: a direct visit to each of the 13
  `/o/o1/*` routes renders, the after build fetching `org-*.js` and the page's chunk in parallel (no
  waterfall), and clicking "Shop settings" from the P&L navigates client-side. The `#root` visible
  text is identical between the before and after builds on all 14 checks; no page errors.
- The Worker bundle (`dist/seller_books`) is unaffected: the router is browser-only.

## Not changed (ranked, for the next run)

1. **Prefetch the P&L after sign-in.** A signed-in user's first page now waits one round trip for
   `org-*.js` (6 kB gz) plus its page chunk. `defaultPreload: "intent"` on the router, or importing
   `./routes/org` once `/api/me` answers with a user, would hide it; measure a signed-in first click
   first, since intent preloading also runs route loaders.
2. **react-dom** is most of the entry, as in the other three bets. Preact/compat would cut it but
   changes the runtime under every page; not without a profile showing parse time matters.
3. `vite.config.ts`'s comment names `scripts/check-no-client-maps.mjs`, which does not exist in this
   tree (same as PayApps; the client build still sets `sourcemap: false`). Worth adding the check or
   fixing the comment.
