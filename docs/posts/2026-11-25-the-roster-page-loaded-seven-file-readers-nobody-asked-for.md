---
title: "The roster page loaded seven file readers before anyone picked a file"
seo_title: "Lazy-loading import readers cut a page's load by 20%"
date: 2026-11-25
tags: [performance, javascript, es-modules, scheduling]
description: "Shift Roster Builder loaded its 7shifts, Deputy, Square and When I Work readers on every visit. Loading them on demand cut its load time by 20%."
---

[Shift Roster Builder](../../ventures/shift-roster-builder/) can read a staff
list or a published schedule exported from 7shifts, When I Work, Square,
Deputy or a plain CSV. Each format has its own reader module, and the page
imported all seven at the top of its script. So every visit downloaded and
compiled about 46 kB (gzip) of parsers, in a chain six modules deep, before
the page's own code could run, though most visitors type or paste their staff
list and never pick a file at all.

The readers are only ever called inside the two "choose a file" handlers,
which already wait for the file's text. Now they also wait for the readers,
fetched the first time someone picks a file. On a decent connection that
extra wait is shorter than reading the file; on a bad one, a failed fetch
shows one line asking you to pick the file again.

Measured on the same throttled setup as earlier passes (150 ms round trip,
1.6 Mbit/s, CPU slowed four times), median of seven loads each:

| | before | after |
|---|---:|---:|
| JavaScript on first load (gzip) | 178 kB, 13 files | 133 kB, 6 files |
| time to the page's `load` event | 1.36 s | 1.08 s |

The imports give the same staff list, shifts and status messages as before,
checked by picking the same files on both versions. The bigger piece left is
the scheduling engine itself, 117 kB, which the page loads even though the
heavy solving runs in a background worker. That one needs a careful split,
and a run of its own. The full note, with what was not changed:
[docs/history/shift-roster-page-perf-2026-11-25.md](../history/shift-roster-page-perf-2026-11-25.md).
