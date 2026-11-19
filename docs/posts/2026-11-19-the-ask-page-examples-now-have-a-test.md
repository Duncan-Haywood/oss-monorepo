---
title: "The Ask page's example questions now have a test"
seo_title: "Testing a site assistant's example questions in a real browser"
date: 2026-11-19
tags: [polish, testing, aeo]
description: "The three example questions on marisstella.app/ask/ are the first answer most visitors see. A two-second browser check now taps each one and fails if it finds nothing or links a page that is gone."
---

[Ask](https://marisstella.app/ask/) is the site's built-in assistant, and it is the second most loaded page on the site. It runs in your browser. It needs no account, and with the default reader nothing is sent anywhere. Under its greeting are three example questions:

- "Which tool prices a roofing job?"
- "What does eBay charge to sell a $40 item?"
- "Does what I type leave my device?"

Most people tap one of these before they type anything, so the reply is the first answer the page gives. Earlier today someone checked those replies by hand: they clicked each question and replaced one that led with the wrong paragraph. A hand check only holds until something changes. If a tool is renamed, a guide is retired or the FAQ is reworded, a tap can start answering "I found nothing", or link to a page that no longer exists, and nothing would notice.

## What the check does

`platform/pages/ask-check.mjs` opens the built Ask page in Chromium at phone size and taps each example in turn. It fails if:

- the reply is "I found nothing", or no reply appears;
- the reply has no passage from the page and no tool;
- a "Which tool…" question gets no tool;
- any tool the reply links does not load.

It takes about two seconds. On today's build all three pass: roofing gives five links, eBay gives the Where to Sell calculator and four fee guides, and the privacy question quotes the page's own answer. To see the failures, I broke the page on purpose. With a nonsense question it reports `answered "I found nothing"`. With the roofing calculator's folder removed it names the exact guide link that stopped loading.

## Also fixed: links that left the site for no reason

Each tool on the site was first written as a standalone page, so some link to files that sit beside them in the repository. The build sends those links to the file on GitHub. Two of them pointed at the research behind the [wall condensation check](https://marisstella.app/wall-condensation-check/), even though the site has its own page for that research at [/research/house-dewpoint/](https://marisstella.app/research/house-dewpoint/). Both now go there.

The same links named the repository by its old name, `monorepo-projects`. So did 42 hand-written "source" links on tool pages. GitHub redirects a renamed repository, but only until someone creates a new repository under the old name. Every one now names `oss-monorepo`, and a test fails if the old name comes back.

## What is still weak

The privacy example finds the right answer, then lists five guides that have nothing to do with it. The roofing example lists the estimating hub before the roofing calculator. Both are ranking problems in the site search the assistant uses. They are next on the list, and this check will show whether a fix makes the replies better.
