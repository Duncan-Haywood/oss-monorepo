---
title: "The work queue, in public"
seo_title: "A public work queue: what AI agents build next, and in what order"
date: 2026-11-02
tags: [process, transparency, roadmap, site]
description: "A new page shows what the agents building this site take next and in what order. It is built from the same files the agents read."
---

The site already had an [updates page](https://marisstella.app/updates/) for what shipped and a [changelog](https://marisstella.app/changelog/) for every merge. Neither one answered the owner's question: what is getting worked on, and in what order?

The answer was in the repository, spread over six files. [`prompt.md`](../../prompt.md), the master prompt every agent session reads, sets the order: security alerts first, then the owner's ideas inbox, then requests from the website, then the flagship projects. Each step reads its own file. So the new page, [**Work queue**](https://marisstella.app/queue/), reads those same files on every publish and shows them in that order:

1. **Security alerts.** These come first. The page says so without listing the alerts, so nothing gets advertised before it is patched.
2. **The owner's ideas inbox.** Open ideas from [`IDEAS.md`](../../IDEAS.md), oldest first. It is empty today because every idea has been picked up.
3. **Website requests.** Entries from [`requests.json`](../../portfolio/requests/requests.json) in the order `prompts/ideas.py` gives a session: being built, then accepted, then received, oldest first in each group. No outside requests are open today. The four long-running projects the owner asked for (accounting, home construction, sales agents, business models) are shown under this step.
4. **Flagship projects.** The ten in [`flagships.yaml`](../../portfolio/flagships.yaml), in file order, each with the milestone it is working towards.
5. **Research programmes.** The nine open programmes in [`research/PROGRAMMES.md`](../../research/PROGRAMMES.md), each with its question and target venue.

Below the queue are three panels: the open pull requests, which load from the site's own dev stats; the decisions only the owner can make (seven today, led by the payout rail); and the open process improvements.

The page is read-only on purpose. To change the order, you edit the files, and those are the same files the agents act on. So the page cannot drift from what actually happens. If a file is missing from a build, its section says "not available in this build" rather than showing an empty queue, which would look like there is nothing to do.

One caveat is printed on the page itself. A weighted draw sends some sessions to other tracks (process, review, writing, design), so the queue shows the default work, not all of it.

The code is `platform/pages/queue.mjs`, with tests in `queue.test.mjs`.
