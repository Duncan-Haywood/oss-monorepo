---
title: "The free custom development page now shows what requests have built"
seo_title: "Free custom software requests: what has been built so far"
date: 2026-11-19
tags: [polish, design, custom-development]
description: "The free custom development page described its past work in a paragraph. It now shows four real tools built from requests, each with its example loaded."
---

[Custom development](https://marisstella.app/custom-development/) is the page where a business describes a problem and agent sessions build the tool for free, in public, under the MIT licence. It is the fifth most-loaded page on the site in the visit counts we have (`portfolio/usage/site-visits.json`, late October to early November), and it is where the owner wants new work to come from.

It had one weak spot for a first-time visitor: the proof. The page asks you to trust that a request turns into real software, and the answer to "what has it built?" was a paragraph, two-thirds of the way down, linking three GitHub folders. You had to leave the page to see anything.

## What changed

A new section, **Built from requests so far**, sits right after "Problems that fit" and before the form. It has one card per request whose project is a tool on the site:

| Request | Tool | The picture |
|---|---|---|
| R-0001 | AI Bookkeeper | three months of synthetic bank lines filed, and the profit and loss by month |
| R-0002 | Wall Framing Takeoff | the stud layout drawing and its cut list |
| R-0003 | Sales Agent | six example replies read, with the unsubscribe honoured and drafts waiting |
| R-0005 | Clothing Design Studio | the garment on the design canvas |

Each picture comes from the real tool on a locally built site with its own worked example loaded, taken by the same script that makes the home page's stills (`platform/pages/showcase/capture.mjs`). There is no mock-up. The script used to click one button per tool. It now takes a list, so it can load the sales agent's example inbox and then run the agent, and file the bookkeeper's suggestions before taking the report. Each card links the request's own page, the tool, and the code and README, which says what is tested and what is still unproven. All four are still marked *building*, and the cards say so.

A request with no tool on the site (R-0004, monetization plans) gets no card, and nor does a declined one. If no request has a picture, the old paragraph comes back.

On a phone the four cards are a sideways swipe strip, not a column. Stacked, they pushed the request form 1,845 px further down. As a strip they add 635 px.

Two smaller fixes on the same page: request IDs in the queue table no longer break as "R-" over "0005" on desktop, and the FAQ answers now use the same line height as the rest of the page.

## Measured

Built site, Chromium:

| | before | after |
|---|---|---|
| Pictures of built work on the page | 0 | 4 (lazy-loaded, 7 to 17 KB each at 600 px) |
| Pixels from the top to the form, 390 px phone | 1,424 | 2,059 |
| Pixels from the top to the form, 1,280 px desktop | 931 | 1,894 |
| Page wider than the viewport (320, 390, 1,280) | no | no |

The desktop form sits lower because the cards now come before it. The hero's "Describe your problem" button still jumps straight to the form.

The three new stills are also in the home page's "Real answers, not demos" gallery, which now has twelve tools instead of nine.
