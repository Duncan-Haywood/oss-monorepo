# Site usage and feedback pipeline: live, verified, and what the keys mean

Agent report, 2026-10-24. Code: `platform/edge/`, `platform/counter/`,
`.github/workflows/edge-deploy.yml`, `.github/workflows/site-usage-pull.yml`.
Reference: `platform/edge/README.md` ("What the counts hold", "What crawler
counts can and cannot see", "Checking it").

## State

- The Worker is deployed at
  `https://monorepo-projects-edge.duncan-andrew-haywood.workers.dev`
  (`edge-deploy` runs 7 and 9 succeeded). `/healthz` answers `ok`. Both
  `platform/edge/site.json` and `platform/counter/site.json` name it, and the
  live `pf-site.js` and feedback page post to it.
- `site-usage-pull` commits straight to `main` with the built-in token. That
  worked unattended (commit `e29a7cea`, 05:30 UTC run) and when started by hand
  (`2223ddb0`). It runs daily at 05:23 UTC.
- **Feedback id 1 is a test**, sent by an agent session at the owner's request
  ("this is just an automated test message"). It isn't visitor feedback. The
  Worker has no delete route, so it stays.
- First readings: 2026-10-24 has six page loads (`hearth-and-horizon` 3,
  `about`, `ask`, `c`). These are almost certainly the owner or agents checking
  the site. Don't record them in `usage.yaml` as demand. Wait for a week of
  daily pulls before reading a trend.

## Added in this change

`/hit` now records, per UTC day:

- `geo:<CC>` from `request.cf.country`, and `dev:mobile|tablet|desktop` from the
  browser string, for each counted load.
- `bot:<class>` and `botpage:<slug>` for beacons from self-declared crawlers and
  agents, which are never counted as page loads. The classes are listed in
  `BOT_CLASSES` in `platform/counter/core.mjs`.

Consumers of `site-visits.json`: **a key with a colon is never a page.** Use
`isPageKey()` from `core.mjs`. `pull.mjs`'s `summarise` returns `countries`,
`devices`, `bots` and `bot_pages` beside `channels` and `sources`.
`platform/distribution/attribution.mjs`'s `channelTotals` used to add `src:`
keys to `pageLoads` (a double count). It now skips every prefixed key.

Behaviour change: `ChatGPT-User`, `Claude-User`, `Perplexity-User`,
`facebookexternalhit` and `meta-externalagent` didn't match the old `BOT_RE`,
so they were counted as page loads. They now go to `bot:` keys. Counts from
before 2026-10-24 may include a few of them.

The privacy copy in `platform/pages/build.mjs` (the About panel, the hub note
and the `llms.txt` line) now names the country code and the device type, and
says crawlers are tallied separately.

## Limits a later run should know

- Crawler counts only see crawlers that run JavaScript. A zero for `gptbot` or
  `claudebot` means "not visible", not "not crawling". The full crawler picture
  needs Search Console / Bing Webmaster crawl stats or a custom domain behind
  Cloudflare. Both are owner steps, and the second is already the
  `pages-custom-domain` ask in `decision_queue.py`. Don't duplicate it.
- A counted load writes up to five D1 rows. The free plan's 100,000 row writes
  a day covers about 20,000 loads a day. Past that, writes fail until the next
  UTC day. Nothing is billed.
- The Node counter (`platform/counter/counter.mjs`) shares `classify` but
  records no `geo:`, `dev:` or `bot:` keys. It isn't deployed anywhere, and the
  Worker is the live path.
