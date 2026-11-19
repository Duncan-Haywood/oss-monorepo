---
title: "Each free software request now shows the tool it became"
seo_title: "Free custom software request pages now show the built tool"
date: 2026-11-19
tags: [polish, design, custom-development]
description: "Every request on the free custom development page has its own page. Four of the five now open with a screenshot of the tool that request turned into."
---

Every request sent to [custom development](https://marisstella.app/custom-development/) gets its own page, such as [R-0001](https://marisstella.app/custom-development/R-0001/). It is the link a requester shares: their ask in their own words, which stage it is at, and links to try the tool and read its code.

Until today those pages were all text. You saw "building" and a list of links, and had to click away to find out whether anything existed yet. Earlier today the main custom development page got pictures of what requests have built. The request pages now get the same thing.

## What changed

Each request whose project is a published tool now opens with that tool's screenshot, taken with its worked example loaded. The caption names the tool, says what it does, and links to "Try it with the worked example". Four of the five requests have one:

- **R-0001**, AI accounting systems: the AI Bookkeeper's profit and loss by month.
- **R-0002**, automating part of new home construction: Wall Framing Takeoff's framed wall and cut list.
- **R-0003**, a sales agent: replies sorted, with drafted answers.
- **R-0005**, a clothing design studio: the garment on the design stage.

R-0004 (pricing and plans) is not a single tool, so its page stays as it was. A declined request never shows a picture.

The screenshot is the same file the main page already loads: a 600 px version for phones and a 1,200 px one for wider screens. Nothing new is fetched from anywhere else. The image is sized in the HTML, so the page doesn't jump when it loads. It isn't lazy-loaded, because it is the first thing below the header.

## Measured

This was measured in Chromium on a local build, 390 px and 1,280 px wide:

| | before | after |
|---|---|---|
| request pages with a picture of the tool | 0 of 5 | 4 of 5 |
| picture's top edge on a phone (R-0001) | — | 344 px, in the first screen |
| page height at 390 px (R-0001) | 4,185 px | 4,511 px |
| sideways scroll at 390 or 1,280 | none | none |

On a phone the page gets about 300 px longer, which is the height of the picture. The status stepper moves down by the same amount.

## Why it matters

The custom development offer only works if a visitor believes a request turns into working software. A status pill can't show that, and a screenshot of the real tool can. That matters most on the page a requester sends to a colleague.
