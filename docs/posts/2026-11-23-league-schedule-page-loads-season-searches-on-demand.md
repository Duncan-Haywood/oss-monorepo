---
title: "Our league scheduler's main page now loads half the code: 226 kB to 110 kB"
seo_title: "Loading a page's heavy search code on demand: 226 kB to 110 kB"
date: 2026-11-23
tags: [perf, web-performance, javascript, league-schedule-generator]
description: "The league schedule page fetched its carry-over search and doubleheader designs on every visit. Now they load only for seasons that need them."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

The [League Schedule Generator](../../ventures/league-schedule-generator/)
is a free, no-signup round-robin scheduler that runs entirely in the browser
as plain ES modules. Its main page is where most visitors land, and before
their first click it made the browser fetch 226 kB (gzip) of JavaScript
across 32 files.

About half of that was code most visitors never run:

| module | what it does | gzip |
|---|---|---|
| `carryover.mjs` | searches for an even carry-over (who you meet right after whom) | 40 kB |
| `session-designs.mjs`, `odd-designs.mjs` | stored doubleheader night layouts | 42 kB |
| `orient.mjs` + WebAssembly | fewest back-to-back home or away games | 22 kB |
| `nights.mjs` | lays out two or more games a night back to back | 13 kB |

A plain league (teams, dates, courts, one game a night) uses none of them.
They were fetched anyway because the season builder imported them at the
top of the file.

## What changed

The season builder no longer imports them. It takes them by hand-off
(`useSeasonSearches(carry, nights)`), and a small function,
`needsSeasonSearches(spec)`, says when a season reaches them: an even
carry-over at four or more teams, or two or more games a night.

- The page asks that question when you press Build. For most seasons the
  answer is no, so nothing extra loads. When it is yes, the page shows
  "Loading the season search...", fetches the six modules once, and builds.
- Everything outside the page (the self-hosted server, the command line,
  the 67 test files and the eval scripts) imports the usual entry file,
  which hands the searches in as it loads. None of them changed.
- A season that needs the searches but was built without them fails with a
  message naming the fix. It does not quietly fall back to a worse
  schedule.

## Measured

| main page | modules | gzip |
|---|---|---|
| before | 32 | 226 kB |
| on load now | 26 | **110 kB** |
| fetched only when a season needs them | 6 | 119 kB |

In headless Chromium, loading the page and building the example league
fetched none of the six modules. Ticking "spread who you meet next" fetched
them and showed the carry-over line. A doubleheader season built with them,
and the page logged no errors. Five example seasons (plain, carry-over,
home-and-away carry-over, doubleheaders, fewest breaks) gave identical rounds
and statistics on the old code and the new.

## Why bother

Someone opening the page on a phone at the field, often on a weak signal,
now downloads half as much before the form works. The [earlier split](./2026-11-23-one-import-cost-a-phone-200-kb.md)
helped the one-format pages, and [moving seven text parsers](./2026-11-23-one-import-line-cost-the-multi-division-page-142-kb.md)
helped the multi-division page. This change helps the page that
gets the traffic.

The measurement script is `eval/page-weight.mjs` and the browser check is
`eval/browser-lazy-searches.mjs`, both in the venture folder. The full write-up
is in the venture README, under "The main page loads half the code".
