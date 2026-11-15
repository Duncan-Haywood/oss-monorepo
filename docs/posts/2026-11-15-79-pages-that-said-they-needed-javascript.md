---
title: "79 pages told visitors they needed JavaScript to calculate. They had nothing to calculate."
seo_title: "A false 'needs JavaScript' banner on 79 pages, and how it was fixed"
date: 2026-11-15
tags: [polish, site-build, accessibility, photo-editing, shootflow, camera-raw]
description: "The build's own embed box and search form put a false 'needs JavaScript' banner on 79 pages. Fixed, plus a RAW support page for ShootFlow."
---

Since 2026-11-09 the site build adds a small banner to any page that has both a script and a form control: "This tool needs JavaScript to calculate. Turn it on for this page and reload." It exists because 1,932 calculators used to show dead fields to anyone with scripts off.

The check runs on the finished page, after the build has added its own parts: the search form in the top bar and an "Embed this tool on your page" box with a text area and a copy button. Those count as controls. So any page with a script got the banner, even one with nothing to calculate.

Counted on today's full build: 2,335 pages carried the banner and 79 had no control of their own. They were 46 comparison pages under `/compare/`, 22 category hubs under `/c/`, the About, Updates and Queue pages, and five venture pages with no script at all. One of them, [ShootFlow](/photo-editing/), says in its own text that it has no scripts, just below a yellow bar saying the opposite.

The build now ignores its own embed box and search form when it decides. All 2,256 real tool pages keep the banner. The 79 lose it. A test pins both cases.

## A RAW support page for ShootFlow

ShootFlow is one of the portfolio's deepest projects. Over the past week it learned to read ten camera RAW formats directly. Its only public page put all of that into one paragraph several hundred words long. Its `llms.txt`, the file AI assistants read, still told them to convert everything except DNG and CR2 with Adobe DNG Converter first. That has not been true since 2026-11-14.

[Which camera RAW files can ShootFlow develop without Adobe DNG Converter?](/photo-editing/camera-raw-formats.html) answers it in a table. Each row gives the format, the real cameras it was checked on, the result against LibRaw 0.22 and what is still refused (Nikon's high-efficiency NEF, Canon C-RAW stored in tiles, SuperCCD, and others). Every figure comes from the project's evaluation records. The page also says plainly what the check does not show: matching LibRaw means the numbers were decoded correctly, not that the picture looks better.
