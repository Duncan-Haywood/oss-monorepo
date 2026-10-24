---
title: "Visitor counts and a feedback form for a GitHub Pages site, on Cloudflare's free plan"
date: 2026-10-24
description: "One free Cloudflare Worker takes our GitHub Pages page-view pings and feedback form; a daily Action commits both to the repo. How it went live."
tags: [analytics, cloudflare, github-pages, privacy, process]
---

# Visitor counts and a feedback form for a GitHub Pages site, on Cloudflare's free plan

Our catalogue of free tools is a static site on GitHub Pages. Pages serves
files, and that's all it does. It can't take in a form post or count a page
view, and it gives the site owner no visitor numbers at all. For months every
product in `portfolio/usage/usage.yaml` read `live_url_visitors: null`.

On 2026-10-20 the owner asked for two things: a way for people without a
GitHub account to report bugs or ask for features, and anonymous usage counts,
both landing back in the repository "because the agents can consume it
easier" than issues. Today both work end to end. This post covers how it's
built, the one snag in switching it on, and what the numbers can and can't
tell us.

## The shape

```
browser ──ping──▶ Cloudflare Worker ──▶ D1 (one number per page per day)
browser ──form──▶ Cloudflare Worker ──▶ D1 (the message, the day, nothing else)
                         ▲
daily GitHub Action ─────┘ reads /counts and /feedback,
                           commits portfolio/usage/site-visits.json
                           and site-feedback.json to main
```

- **The Worker** (`platform/edge/worker.mjs`, about 150 lines) has five routes:
  `POST /hit`, `GET /counts`, `POST /feedback`, `GET /feedback` and
  `GET /healthz`. It runs on Cloudflare's free plan, whose limits stop requests
  instead of billing, so it can't run up a charge.
- **The Worker holds no GitHub credential.** It only stores. The commit is made
  by a scheduled workflow using the repository's own built-in token, so a bug
  in the Worker can't write to the repository.
- **The site's shared script** sends one `sendBeacon` per page load with the
  page's name, the channel tag if the visitor came from one of our own `?ref=`
  links, and a kind of referring site (`google`, `reddit`, `other`). The script
  works out that label in the browser, so the referring address is never sent.
  Do Not Track, Global Privacy Control and a per-browser opt-out each stop the
  ping before it's sent.

## Switching it on: three tries at a secret name

The deploy workflow (`edge-deploy`) runs only when the Cloudflare secrets
exist. The owner made the account and the token, but the deploy kept skipping:

| Run | What happened |
|---|---|
| 4 | Skipped. The workflow looked for `CLOUDFLARE_API_TOKEN`, but the secret was saved without underscores. |
| 5, 6 | Still skipped. The token was really saved as `CLOUDFLARERESTRICTEDAPIKEY`. |
| 7, 9 | Deployed, once the workflow read that name too (PR #9957). |

GitHub doesn't let a workflow list its secret names, so the only signal was
the workflow's own `CONFIGURED: false` line. The lesson is to accept the name
the owner actually typed, not to ask them to retype it.

## Proving it, step by step

On 2026-10-24 an agent session checked each step against the live system:

1. `GET /healthz` answered `ok`, and the published `pf-site.js` pointed at the
   Worker.
2. The first scheduled pull, at 05:30 UTC, committed
   `portfolio/usage/site-visits.json` to `main` by itself (commit `e29a7cea`),
   with three page loads.
3. A test message sent to `/feedback` ("this is just an automated test
   message") came back `201`, and `GET /feedback` returned it as id 1.
4. A hand-started pull committed it to `site-feedback.json` (commit
   `2223ddb0`), along with three more loads.

So the whole chain, from browser to Worker to D1 to Action to file, works.

## What the first day shows

Six page loads: `hearth-and-horizon` 3, and one each on `about`, `ask` and
`c`. That's not a usage figure. The counter had been live for a few hours,
the three `hearth-and-horizon` loads came within minutes of a new episode
being merged (which looks like someone checking it rather than readers), and
the data has no way to tell the owner or an agent from a stranger. The unit
is **page loads by browsers that didn't opt out**. It isn't people, and it's
a floor, not a full count.

## More detail, added the same day

The owner asked for more detailed tracking, including crawlers. Each counted
load now also adds to:

- `geo:<CC>`: the country as Cloudflare reports it for the request
  (`request.cf.country`). Only the two-letter code is kept.
- `dev:<class>`: `mobile`, `tablet` or `desktop`, read from the browser string,
  which is then discarded.

A beacon from a self-declared crawler or agent no longer just disappears.
It adds to `bot:<class>` (Googlebot, Bingbot, GPTBot, ChatGPT-User, ClaudeBot,
PerplexityBot, Bytespider, about twenty named classes plus `other`) and to
`botpage:<slug>`, and never to the page-load total. The change also fixed a
quiet overcount: agent fetchers like `ChatGPT-User` and `facebookexternalhit`
didn't match the old bot pattern, so they were being counted as visits.

Each breakdown is a separate daily total, not linked to the others. The data
can say "three loads from Great Britain today", but never "a phone in Great
Britain opened page X". The site's privacy copy was updated to say exactly
this in the same change.

## What crawler counts can't see

The ping comes from JavaScript, so only crawlers that run the page's script
can show up. Googlebot and Bingbot render pages, so they can. Most AI crawlers
fetch the HTML and never run it, so a zero next to `gptbot` means "not visible
this way", not "never crawled". Static hosting gives no request logs. Seeing
every crawler needs either Search Console and Bing Webmaster Tools crawl stats
(free, with the owner's sign-in) or a custom domain behind Cloudflare, whose
free analytics report bots by name. Both are waiting on the owner, and both
are written down in `platform/edge/README.md`.

## If you want the same thing

Everything is MIT-licensed in
[`platform/edge/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/platform/edge)
and
[`platform/counter/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/platform/counter):
the Worker, the D1 schema, the pull scripts and the workflow. It needs a free
Cloudflare account (no card) and two repository secrets.
