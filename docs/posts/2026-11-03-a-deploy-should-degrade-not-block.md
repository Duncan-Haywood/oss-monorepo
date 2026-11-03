---
title: "Two ways a static site stops updating while it stays up"
seo_title: "Why a static site stops updating: timeouts and strict checks"
date: 2026-11-03
tags: [site, ci, reliability, open-source]
description: "marisstella.app answered 200 for hours while 37 merges never reached it: a build cap that checkout outgrew, and a check that blocked deploys over a title."
---

On 3 November marisstella.app answered every request with a 200 and looked fine. It was also more than three and a half hours out of date. Its last successful build finished at 17:04 UTC. By 20:38, 37 merges to `main` had not reached it: new tools, fixes and posts.

Hosting a folder of static files almost never goes down. What breaks is the pipeline that updates it, and an uptime monitor can't see that, because the old site is still there and still fine. This time two separate faults stacked up, and the second was easy to mistake for the whole story.

## Fault one: the build outgrew its timeout

The deploy job is capped at 20 minutes, so a stuck run can't burn compute indefinitely. On 24 October its checkout of the repository's recent history took 97 seconds. By 3 November, on every runner, it took 12 to 20 minutes. The last good run finished with 11 minutes 47 seconds of checkout. Every run after it hit the cap, most of them before the build had even started.

A run that hits its cap ends as `cancelled`, not `failed`. On a busy day most runs are cancelled anyway, because a new merge replaces a deploy that is still waiting in the queue, and that is harmless. So the failures hid among normal-looking cancellations. The only way to tell them apart is to look inside: a replaced run never starts its build, while a timed-out run works right up to the cap.

The fix raises the cap to 45 minutes, more than twice what the job needs today. Because it changes CI configuration, it waits for the owner's approval like any other change to the repository's control plane. Making the checkout itself cheaper comes next.

## Fault two: a check that blocked a deploy over a title

From 18:04, a second fault waited behind the first. A blog post reused a tool page's exact `<title>`. The site checker refuses duplicate titles, because a search engine then has to guess which page to show, and it treated that as fatal. [The first write-up](2026-11-03-one-blog-title-stopped-every-deploy.md) covers it. Fixing it on its own changed nothing for the live site, because no run lasted long enough to reach the check.

## What changed so it doesn't happen again

**The pull request is the gate. The deploy only refuses to make things worse.** Checks now come in two kinds. Checks that protect people stay fatal everywhere: a page missing its disclaimer, a test file or internal note leaking into the build, a dead link, a sudden drop in the number of tools. Checks that protect search ranking (one title per page, one main heading, readable title length) still fail a pull request, but on the deploy run they print warnings and the site ships. A duplicated title for a few hours costs almost nothing. A frozen site costs every change merged behind it.

**When the fix can't be wrong, the build applies it.** A post whose title clashes with a tool page is now renamed to its own headline at build time, with a warning. The first time it ran, it found a second post with the same problem already on `main`.

**Leave room under every timeout, and watch how big the step times get.** Time spent fetching history grows with the repository. A cap set with room to spare in October was too tight by November. The guideline now asks for at least twice the measured job time, and for any jump in a step's time to be recorded.

**Measure freshness, not status codes.** Every build now publishes a small `version.json` with the commit it was built from and when. A checker reads it from the live site and fails when the build is more than four and a half hours old: the site rebuilds at least every three hours, and a build takes up to an hour. It runs with the repository's other health checks. Both of today's faults would have shown up in that check, without anyone having to notice that a new page was missing.

The runbook for the next time, "When the site stops updating", is in the hosting README. Step one is to find the last successful deploy and compare its step times with the runs that came after it.
