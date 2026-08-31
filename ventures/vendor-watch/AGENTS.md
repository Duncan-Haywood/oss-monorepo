# AGENTS.md

Vendor Watch is a frontend + API-route-only Next.js app with shared TypeScript
business logic. There is no database, no external service dependency, no
Docker dependency, and no required environment variable for local
development or for the build.

## Services

| Service | Command | Port |
|---------|---------|------|
| Next.js dev server | `npm run dev` | 3000 |

## Standard Commands

- Install: `npm ci`
- Dev: `npm run dev`
- Test shared business logic: `npm test` (`tsx --test tests/*.test.ts`)
- Build and type-check: `npm run build`
- Type-check only: `npx tsc --noEmit`
- Lint: `npx eslint .` (or `npm run lint`)

## Code Layout

- `src/lib/check-url.ts` — validates the input URL, fetches it (8s timeout),
  normalizes HTML to text, hashes it, compares against the stored snapshot,
  and returns one of `first_snapshot` / `unchanged` / `changed` /
  `inconclusive`. Non-2xx responses and fetch/timeout errors are always
  `inconclusive`, never `unchanged`.
- `src/lib/diff.ts` — dependency-free word-level diff (prefix/suffix
  trimming + LCS backtrack, with a wholesale-replacement fallback for very
  large differing spans so a pathological input can't hang a request).
- `src/lib/watch-store.ts` — bounded in-memory snapshot store (last 200
  distinct URLs), same "prototype-stage demo store" pattern as
  `usage-events.ts`, not a database.
- `src/lib/usage-events.ts` — bounded in-memory usage event store (500-event
  cap), same pattern as print-atelier's `usage-events.ts`.
- `src/app/api/watch/check/route.ts` — POST endpoint the tool calls.
- `src/app/api/usage/route.ts`, `src/app/api/usage/summary/route.ts` —
  usage tracking endpoints.
- `src/components/WatchTool.tsx` — the client-side check form and result
  view; `src/components/DiffView.tsx` renders the diff; `src/components/
  Disclaimers.tsx` renders the required disclaimer copy.
- Unit tests for shared logic live in `tests/*.test.ts`. Network fetches are
  always mocked/stubbed in tests — no real network calls in the suite.

## Smoke Routes

After starting the dev server:

- `/` — landing copy + the working check tool + disclaimers
- `POST /api/watch/check` — `{ "url": "https://example.com" }`
- `GET /api/usage/summary` — anonymous usage counters

## Scope notes

- No scheduled/cron-based monitoring, no email/webhook alerts, and no
  accounts in this version — every check is a manual, visitor-triggered
  request. Scheduled re-checks are a natural next step once hosting is
  decided, but are deliberately out of scope here (see README).
- The snapshot store is shared across all visitors and capped — it is a
  demo, not a per-customer archive.
