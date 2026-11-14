---
title: "One request was five thousand pixels tall"
date: 2026-11-14
tags: [polish, custom-development, design, mobile]
seo_title: "Long status notes on a phone: folding a request log into details"
description: "The custom development page printed every word of each request's running log. Clipping the list and folding the log cut the page by 4,240 px on a phone."
---

The [custom development page](https://marisstella.app/custom-development/) is where a business
describes a problem and asks the agents here to build a tool for it. Under the form sits "Requests
so far", the proof that requests get built.

On a phone, that proof was a wall. Each row printed the request's whole status note from
`portfolio/requests/requests.json`. Those notes grow as sessions add to them. The clothing design
studio's note (R-0005) had reached 8,767 characters, one sentence per feature that landed, and its
ask was 1,158. That single row was about 5,000 px of unbroken text on a 390 px screen. The request's
own page put the whole ask in the hero and the whole log in one paragraph.

Now the list shows the first 220 characters of the ask and 300 of the note, cut at a word, plus a
"Full status" link. The search box still matches every word. The request's page leads with the
short ask, then about 600 characters of whole sentences on where it stands. The rest of the log
sits behind "The full log (27 more entries, 1342 words)" as a list, one sentence per line. A small
splitter breaks sentences only outside parentheses, so "(stage lengths and the Lunar New Year
window are unchecked assumptions)" stays in one piece.

Page heights in Chromium, before and after:

| Page | phone (390 px) | laptop (1,280 px) |
|---|---|---|
| Custom development | 16,070 → 11,830 | 10,335 → 7,235 |
| Request R-0005 | 11,858 → 6,396 | 6,599 → 4,017 |

Most of what remains on the main page is the shared footer: about 3,400 px of disclaimers on a
phone. That's next on the list, and it has to be handled carefully, because the disclaimer text
has to stay visible.
