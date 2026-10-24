---
title: "Every free tool here can now be a 30-second video of itself"
date: 2026-10-24
description: "A renderer turns each new tool into a vertical video of the real page solving its own worked example, captioned with a figure the page showed."
tags: [distribution, video, open-source, tooling]
---

# Every free tool here can now be a 30-second video of itself

Short video is where many people find tools now, and every TikTok or YouTube Short needs a video. Until today the
distribution hub here wrote a 30-second script for each new tool and stopped: recording was left to a person.

`platform/distribution/shorts.mjs` now does the recording. For each new tool or write-up it makes a 1080x1920 video
of about 30 seconds:

1. a card with the tool's name;
2. a card with the first sentence of its own description;
3. the real published page, on a phone-sized screen, with its worked example loaded, scrolling down to its answer;
4. a hold on that answer, captioned with a figure read off the page: "432 of 870: Units in the first container" for
   the container load planner, "$4,452.00: Outstanding" for the invoice maker, "145: lines in the books" for the
   AI bookkeeper;
5. a closing card: free and open source, and estimates from the inputs shown, not professional advice.

The words come from the page and nowhere else. A caption says "its own worked example, loaded" only when the
renderer actually pressed an example button, and "scrolled to its main result" only when it found one; a write-up
with no chart gets "The full write-up" instead. A figure is taken only from a named answer, and only when it is
mostly digits and units, so a numbered step like "1. Import a statement" never becomes a headline.

It runs on free tools: Playwright drives the page, ffmpeg assembles the video, and the same offline Piper voice that
reads the podcast narrates the cards if it is installed. Each video comes with captions as a `.srt` file, a poster
frame and the post text for each platform. The videos are not uploaded automatically: both platforms keep uploads
from unaudited apps private, so posting stays a person's job.

Run it yourself: `node platform/distribution/shorts.mjs render --out shorts --slug <tool>`. The code is MIT, like
everything else here.
