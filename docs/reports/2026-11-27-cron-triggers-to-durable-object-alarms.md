# Cron triggers to Durable Object alarms (P098)

For the next run that adds a scheduled job to a Worker.

## Why

The Workers Free plan allows **5 cron triggers per account**. By 2026-11-27 the
repository's Workers configured 8 (`python3 platform/ci/cron_budget.py`, P097). Four of
them are on Workers a workflow deploys: platform/email, payapps, seller-books and
jobshop-quote. Wiring one more deploy (cmmc, whose launch review landed the same day) would
have failed the deploy's trigger update. Three of the eight did the same small job once a
day: deleting never-confirmed early-access sign-ups on the landing sites (payapps-site,
seller-books-site, cmmc-site).

## What changed

Each landing site's purge now runs on a **Durable Object alarm**, which is not a cron
trigger. SQLite-backed Durable Objects are on the Free plan ("Workers Free plan: Only
Durable Objects with SQLite storage backend are available",
`cloudflare-docs/src/content/partials/durable-objects/do-plans-note.mdx`, read 2026-11-27
through raw.githubusercontent.com because developers.cloudflare.com does not resolve from
cloud sessions). Alarms are retried with backoff when the handler throws (`api/alarms.mdx`).

- `src/purge-clock.mjs` (seller-books-site, cmmc-site; identical files) and
  `src/worker/purge-clock.ts` (payapps-site) define the `PurgeClock` class, `armPurgeClock`
  and, for the `.mjs` copies, `withPurgeClock`.
- Any request that reaches the Worker arms the clock, once per isolate. A sign-up is such a
  request, so a sign-up row never exists without an armed clock. The first alarm fires a
  minute after arming, so rows left from before a deploy get their purge soon. Each alarm
  sets the next one a day out *before* it purges, so a purge that throws does not end the
  chain. The privacy pages' "deleted after 30 days" still holds whether or not traffic arrives.
- The wrangler configs bind `PURGE_CLOCK` and add the migration
  `{"tag": "v1", "new_sqlite_classes": ["PurgeClock"]}`. Their `triggers` are gone.
- Configured schedules went from 8 to 5. CI now runs `cron_budget.py --strict`, so the PR
  that adds a sixth schedule fails, not the later PR that wires its deploy.

## Verified

- `node --test "test/*.test.mjs"`: seller-books-site 63 pass, cmmc-site 42 pass, including
  the new `test/purge-clock.test.mjs`.
- payapps-site: `pnpm typecheck` clean, `test:unit` 31 pass (new
  `test/unit/purge-clock.test.ts`), `test:worker` 11 pass.
- `wrangler deploy --dry-run` (payapps-site) lists `env.PURGE_CLOCK (PurgeClock) Durable
  Object`.
- Under workerd, seller-books-site ran in `wrangler dev --local` with migrations applied. One
  request armed the clock, and about 60 s later the log showed
  `{"event":"early_access.purge","deleted":0}`.
- Not checked: a real deploy. The first deploy of each site creates the Durable Object
  namespace from the migration, and nothing here has deployed one.

## For the next job that wants a schedule

Copy the pattern instead of adding a cron. A scheduled job is a `purge(env)` that returns
a number; the clock does the rest. `cmmc-site` is still synced from `private-monorepo`, so
its changed files are in `ventures/cmmc/sync-from-private.sh`'s `keep_local` until private
has them. The other route is the owner moving the account to Workers Paid ($5 a month, 1,000
cron triggers), then setting `portfolio/hosting/cloudflare-plan.json` to match.
