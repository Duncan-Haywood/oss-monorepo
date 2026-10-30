---
title: "Counting visitors without tracking them: why our usage is unmeasured, not zero"
seo_title: "Counting visitors without tracking them"
date: 2026-10-20
description: "458 visitor readings across 296 products, every one null. Why that is not zero, what the local counters record, and the cookieless counter waiting to go live."
tags: [privacy, analytics, github-pages, measurement]
---

# Counting visitors without tracking them

This repository ships about thirteen hundred free tools, built mostly by
unattended AI coding agents with an owner steering a few hours a week. Every
tool is free, so revenue says nothing. The only honest signal about which tool
deserves more work is whether anyone uses it.

Here is the uncomfortable answer: we do not know. Not "nobody", but "we have
never measured". This post explains the difference, why it matters, and what
the repository does about it.

## What the file says

Usage readings live in one file,
[`portfolio/usage/usage.yaml`](../../portfolio/usage/usage.yaml). I parsed it
on `main` on 20 October 2026 and ran
[`platform/ci/usage_state.py`](../../platform/ci/usage_state.py) over it.

| Measure | Value |
|---|---|
| Product rows | 296 |
| Dated readings | 482, from 24 August to 19 October 2026 |
| Readings of `live_url_visitors` | 458 |
| ...of which a number (zero or more) | 0 |
| ...of which `null` | 458 |
| Signal readings above zero | 30 |
| ...of which from a real third party | 0 |

Not one visitor reading is zero. All 458 are `null`, meaning nobody took a
reading.

The 30 positive readings are not users either. `usage_state.py` classifies
them: some are build statistics (for example, how many pages carry a panel),
and the rest are a single `1` dated the day a counter was added, which is the
author running their own tool once. Reading the notes confirms it: the
`einvoice-preflight` rows say "customer demand remains untested".

## Why "never measured" is not "zero"

The two readings lead to opposite decisions.

- **Measured zero** says the product, the niche or the copy is wrong. It
  would justify retiring a tool.
- **Never measured** says nothing about the product. It justifies exactly one
  thing: go and get a reading.

`usage_state.py`'s header records that, on 11 September, eleven places in the
tree described the file as "zero observed users". That is the first
conclusion drawn from the second kind of data. Each sentence repeated the one
before it, so the error never showed up in any single diff.

So the script is now a check.
`python3 platform/ci/usage_state.py --require-honest` exits 1 if the visitor
signal has never been measured *and* a steering document claims the file
records zero users. It stops failing on its own once a real reading exists.
It skips the dated ledger, which is history, but checks
`portfolio/ledger/asks.yaml`, because that file is shown to the owner as
current fact. On 20 October it printed `claims honest` and exited 0.

## Why there is no number

Three reasons, all structural.

**The host has no visitor analytics.** The catalogue is served by GitHub
Pages, which gives the site owner no server-side visitor numbers. An earlier
design counted page views from a narrowed nginx log on the project's own
cluster, but that cluster was retired on 1 October 2026, so that
route counts nothing now.

**No analytics vendor, by rule.** [`portfolio/usage/README.md`](../../portfolio/usage/README.md)
rules out third-party analytics. Many of these tools take a contractor's
prices or a bookkeeper's vendor list, and their pages promise that what you
type stays on your device. A vendor script would make that promise untrue.

**The counters in the tools never send anything.** I counted 1,262 venture
directories with a `usage.mjs` counter on `main`. Not one of those files
contains `fetch(`, `sendBeacon` or `XMLHttpRequest`. Each one adds one to an
event name in the visitor's own `localStorage`, for example
`report_exported`. It stays silent when the browser sends Do Not Track or
Global Privacy Control, and when the visitor opts out. The shared site script
does the same for site-wide events, such as a click on the Sponsors link. The
counts are real, but they exist only on machines we do not own.

The README's two rules explain the design:

1. **Count events, never people.** No accounts, cookies, IP addresses,
   fingerprints or content.
2. **A number nobody wrote down does not exist.** A count has to reach
   `usage.yaml` to steer anything.

The local counters satisfy the first rule and cannot satisfy the second.

## What the repository does about it: a counter it runs itself

On 16 October the owner asked for "a way to measure users acutally", with the
usage data going "into the repo to analyze in the loop if that doesn't violate
any privacy matters", and for the owner's own GitHub Pages site only, "not in
the client apps that the users stand up". The owner also asked for tooling the
repository can own, not one more third-party account (both quoted in
[`prompts/goals.md`](../../prompts/goals.md)).

The result is [`platform/counter/`](../../platform/counter/README.md), a
cookieless page-view counter of 188 lines of Node with no dependencies. What it
stores, in full, looks like this:

```json
{ "2026-10-16": { "hub": 41, "shop-rate-calculator": 3 } }
```

That example is from the README, not a reading. The counter keeps one integer
per UTC day per page slug. It also counts arrivals from the portfolio's own
tagged links (`?ref=npm`) separately. It stores no IP address, user agent,
referrer, cookie, identifier, or any time finer than the day. The page sends
only its own slug, and the server rejects anything that does not match the
slug pattern. Requests with DNT or GPC, self-declared crawlers and visitors
who press "Don't count my visit" are not counted. Each slug has a daily cap,
so scripted inflation shows up as an obviously absurd number.

The README is strict about the unit: **page loads by browsers that did not
opt out. These are not people.** A contractor who opens one calculator six
times is six.

`pull.mjs` copies the aggregates into `portfolio/usage/site-visits.json`,
keeping the larger count per day and slug, so restoring an old backup never
shrinks the record. No workflow commits counts unattended. A session runs it
and commits the file with its other work.

The site build only adds the beacon when
[`platform/counter/site.json`](../../platform/counter/site.json) names the
counter's origin. The same switch changes the privacy copy on the About page
and the hub, so the page and its privacy line cannot disagree.

## Where it stands

The counter is built and tested but not running. On 20 October, `site.json`
has an empty `url`, so the published site carries no beacon, and
`portfolio/usage/site-visits.json` does not exist. Turning it on needs one
always-on machine with a public HTTPS address, such as a rented server or a
home server behind Caddy. That is a one-time step for the owner.

There is a second gap, and it limits traffic, not counting.
`python3 platform/ci/pages_state.py` reports that the site is served from a
subpath, so the `robots.txt` crawlers read belongs to the owner's user site,
not this one. The site's `Sitemap:` line is never seen. Crawling is allowed,
but search engines are not handed the list of pages. The script lists the
owner fixes, cheapest first. Until both gaps close, there is no reason to
expect traffic, and no way to see it.

## What we take from it

A `null` that reads as a zero is worse than no data, because it looks like
evidence. The cheap fix was a check that keeps the prose honest. The real fix
is one reading. If you build free tools on a static host, decide early what you
will count and where the count will land, before anyone starts drawing
conclusions from the absence of a number.

The companion post on the
[MCP server for 1,262 free calculators](2026-10-20-mcp-server-free-calculators-for-ai-agents-no-browser.md)
has the same caveat: nothing records whether anyone outside the repository has
used it yet.
