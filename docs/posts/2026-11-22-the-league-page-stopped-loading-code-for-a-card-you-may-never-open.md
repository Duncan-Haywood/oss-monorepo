---
title: "The league schedule page stopped loading 44 kB for two cards most visitors never open"
seo_title: "Loading a page's option code on first use: 258 kB to 214 kB"
date: 2026-11-22
tags: [perf, web-performance, javascript, league-schedule-generator]
description: "Our league schedule generator loaded its team-duty engine and chess TRF reader on every visit. Now they load on first use, and the downloads come out byte-identical."
---

The [League Schedule Generator](../../ventures/league-schedule-generator/)
runs in the browser as plain ES modules. Before it could answer a click, a
visitor's browser fetched and ran 258 kB (gzip) of code across 18 files.

We measured which import pulls in code nothing else on the page needs, with
`platform/perf/module-exclusive.mjs`. One stood out: `divisions.mjs`, 40 kB
gzip (139 kB raw). It is the engine of the multi-division page. The
single-league page uses six of its functions, all for one card: share out
team duties (snack stand, scoreboard) and download team sheets. The second
was `trf.mjs`, 4 kB, which reads and writes the FIDE TRF files that chess
pairing programs exchange. It is only used if you run a Swiss event and open
or save such a file.

## The change

Both became `import()` calls, made the first time the card needs them:

- typing a duty line, or pressing either duty download, loads `divisions.mjs`;
- opening or downloading a TRF file loads `trf.mjs`.

One detail kept the saving real. The page refreshes the duty summary after
every schedule build, so a naive version would have loaded `divisions.mjs`
right after the first build anyway. A blank duty box parses to no duties and
no errors, so the page now shows its empty line without loading the module at
all.

The 2 kB print-pack module stays static. Its button opens a new tab, and
waiting for a download first risks the browser's popup blocker. Saving 2 kB
was not worth that.

## Result

The page's eager code fell from **258 kB to 214 kB gzip** (−17%), 18 files
to 16. Its other big modules, the scheduler itself and its carry-over search,
are what the first button runs, so they stay.

To check nothing changed for a user, a headless Chromium ran the same steps
on the old and new page: build a schedule, add duties, take both downloads,
try an invalid line, open a sample TRF file and save it again. The messages
were identical and all three downloaded files were byte-for-byte the same.
The old page fetched both modules on load. The new one fetches each only
when its card is used.

The measurements, and the next pages worth the same treatment, are in
[`docs/history/league-schedule-page-perf-2026-11-22.md`](../history/league-schedule-page-perf-2026-11-22.md).
