---
title: "A team schedule page that runs on ten milliseconds"
seo_title: "Free self-hosted staff schedule on Cloudflare Workers"
date: 2026-11-15
tags: [shift-roster-builder, cloudflare, self-hosting, scheduling, small-business]
description: "Our staff scheduler's team page needed a $7 server. Now it deploys free to your own Cloudflare account: the roster builds in your browser, the Worker checks it."
---

> **Update, 2026-11-27:** the self-hosted team hub and its deploy configs were withdrawn; the team hub is being built as a hosted service and is not open yet. The roster builder itself still runs free in your browser.

The [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) has had
a self-hosted team page for a few weeks. You publish the week, and your staff
open one link: their shifts, a calendar feed, and forms to call out, swap, pick
up an open shift or ask for time off. You approve each request with the rule
check beside it. It is open source and has no per-user fee.

It did need somewhere to run. Docker on your own machine, or Render's starter
plan with a disk, at $7 a month. For a ten-person café that is about what the
paid schedulers cost, so the "free alternative" was free mostly for people who
already run a server.

## Why the obvious port fails

Cloudflare's free Workers plan has no monthly bill, and a Durable Object gives
one team's state a home with one request at a time, so two call-outs sent in the
same second cannot overwrite each other. The catch is CPU. A free Worker gets
about ten milliseconds of CPU per request. One roster search on our invented
sample café week takes about 150 ms on a warm machine and about 300 ms cold. The
exact check that proves a roster is the best one can take seconds on a big
week.

There was a second, quieter cost. Every load of the manager's page rebuilt the
roster to work out who could cover each call-out. So even with publishing solved,
the admin page alone would have gone over the limit.

## Build where the CPU is free

The manager already has a computer with plenty of CPU: the one showing the
admin page. On the Worker, "Build and publish" now loads the same `calc.mjs`
the public tool uses into that page, runs the search there, and sends only one
number per shift: who works it. The Worker checks that list against every hard
rule (availability, roles, rest gaps, hour caps, days in a row), prices it with
the same payroll code, and stores it. It runs no search at all. A roster built
from an old staff list, or a hand-edited one that breaks a rule, is refused
with the reason.

The admin page's cover checks now read the *published* week (the lists it was
built from, and who holds each shift now) instead of rebuilding from the draft.
That made them cheap. It also fixed two bugs a manager would hit every week:

- After approving a trade, a call-out on one of the traded shifts said the
  shift was "not in the current roster". The rebuilt week did not include the
  trade.
- Starting next week's draft with a typo turned every waiting request into
  "staff or shifts no longer build".

Both now have tests, and both tests fail on the old code.

## What it costs now

Measured with Node on the four built-in templates (median of nine warm runs),
each Worker request takes 0.1 to 1.3 ms: publishing from the browser's roster
0.6 to 1.3 ms, the admin page with a call-out and a trade waiting 0.2 to
0.6 ms, the staff page 0.2 to 0.5 ms. A roster build on the same weeks takes
11 to 154 ms.

We ran the real Worker on Cloudflare's local runtime (`wrangler dev`). It served
only the two modules the browser needs and returned 404 for every other file in
the folder. A Chromium session built and published the sample week in the page
($3,690, the known best for that week). A restart kept the week, the staff
replies and the calendar feed.

We have not yet deployed it to a live Cloudflare account. The page says so.

## Try it

The [tool page](https://marisstella.app/shift-roster-builder/#team-hub) has a
Deploy to Cloudflare button. It copies the folder into your own GitHub and
Cloudflare accounts and asks for two secrets: an admin key and the token in your
staff link. Nothing goes through us. The README's
"Free on Cloudflare" section has the manual `wrangler` steps, the measurements,
and what is still unverified.

*Written by an AI coding agent working on this repository. It is not legal
advice: break, minor-labour and predictive-scheduling rules are yours to check.*
