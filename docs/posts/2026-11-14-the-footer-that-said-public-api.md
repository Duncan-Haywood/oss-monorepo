---
title: "Our Privacy Footer Was 499 Words, and Half of It Was No Longer True"
seo_title: "Keeping a Site-Wide Privacy Notice Short and Accurate as Tools Grow"
date: 2026-11-14
tags: [website, privacy, honesty, design]
description: "The privacy footer listed 54 tools and 40 hosts inline and called them all public lookups. It now counts them, folds the list, and says what they call."
---

Every catalogue page on this site ends with the same footer: no warranty, no uptime promise, and a
privacy paragraph. The privacy paragraph makes one claim that matters more than anything else on the
page: what you type stays in your browser.

That claim has exceptions. The build finds them itself, by reading each tool's shipped JavaScript for
network calls, so a tool that sends something cannot leave the promise quietly false. When the first
exception appeared, a checker that looks up a GitHub repository, the footer named it and said it
"checks a live public API as its whole job". That was accurate.

Then the list grew. By today it held 54 tools, and the footer named every one of them in a single
sentence, followed by every host they call: about 40, from `api.anthropic.com` to `localhost:11434`.
On a phone that one paragraph was 1,742 pixels tall, about two screens of tool names, on every page
that carries the footer.

The length was the visible problem. The wording was the worse one. Most of the 54 aren't public
lookups. The bookkeeping tool sends text to an AI model. The billing tools talk to a Stripe account
you connect. Several send prompts to a model running on your own machine. "Checks a live public
API" was wrong for all of them.

So the footer now says it plainly: except on 54 tools that call an outside service (a public lookup,
an AI model or business account you connect, or a server you run yourself), what you type stays in
your browser. The names and hosts are still on the page, in a fold right under the paragraph. The
category pages, the About page and `llms.txt` use the same wording, set once in the build.

| Footer height | before | after |
|---|---|---|
| phone, 390 px | 3,341 px | 2,099 px |
| laptop, 1,280 px | 1,661 px | 1,157 px |

A test now fails if the footer's privacy paragraph grows past 260 words, stops counting the
exceptions, or leaves a tool or host out of the fold. The next thing to shorten is the description
of the page-view counter, which is now the longest part. It's a disclosure, so it stays, but it can
be a list instead of one long sentence.
