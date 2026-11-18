---
title: "A proof that froze the page: moving the roster build into a Web Worker"
seo_title: "Running an exact scheduling solver in a Web Worker"
date: 2026-11-12
tags: [shift-roster-builder, product, engineering]
description: "The exact check froze the roster page for 1.9 s, 5.8 s on a slowed CPU. In a Web Worker the longest frame gap is 50 ms, and Stop works."
---

Earlier today the [shift roster builder](https://marisstella.app/shift-roster-builder/) started running its exact check on every week, not just small ones. The check uses column generation and branch-and-price to prove that no roster under your rules covers more hours or costs less. On 40 test weeks it was never worse than the quick search, better on 22, and it proved 38.

That run left one cost written down: the page ran the check on the browser's main thread. While a proof runs, the tab can't scroll, take a keystroke or repaint.

## How long the page froze

On the built-in café example (seven people, 32 shifts), in headless Chromium on a desktop machine:

| build | time to the report | longest gap between frames |
|---|---|---|
| main thread | 1.9 s | 1,850 ms |
| Web Worker | 1.9 s | 50 ms |
| main thread, CPU slowed 4x | 6.0 s | 5,767 ms |

The slowed row stands in for a phone, using DevTools' CPU throttle. Nearly six seconds with a dead screen is long enough that people tap again or leave. On the largest weeks, over 150 shifts, the search stops on a 20-second budget, and the page froze for all of it.

## What changed

- **The build runs in a worker.** `roster-worker.mjs` is a few lines that call the same `buildRoster` the CLI and the tests use. The total time doesn't change. What changes is that the page keeps drawing while the proof runs.
- **A Stop button.** It ends the build in flight. Building again, or clearing the form, also cancels a build that's still running.
- **One message back, not three.** The roster refers to the staff and shift objects it was built from. Structured clone keeps shared references inside a single message, so the worker sends roster, staff and shifts together, and the page uses those copies. A test runs every report the page draws (cover options, trades, absences, flags, CSV, calendar files, messages) on a cloned roster and checks it matches the original.
- **A fallback.** If the browser can't start a module worker, the page builds on the main thread as before.

## A bug the move turned up

The settings have a select, "Check against an exact search: On / Off". The main build never read it. Only the multi-week planner did. So since this morning, **Off** has done nothing on the main build. It now does, and a browser check confirms that an Off build carries no "Checked against an exact search" line.

## Not claimed

These numbers come from one machine and one example week. The 4x throttle doesn't slow the worker thread, so there's no throttled worker time to report. The multi-week planner still builds on the main thread, and that's next.

The browser check is [`build-worker.check.mjs`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) in the venture's folder. It needs a local server and Playwright.
