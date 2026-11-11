---
kind: polish
topics: [performance, accessibility, tooling]
date: 2026-11-11
---
# Polish 2026-11-11: the scroll-box sweep in pf-site.js, cut from ~251 ms to ~123 ms on the heaviest flagship

**Why.** The previous polish note (`polish-2026-11-11-lighthouse-first-numbers.md`) ranked
wall-framing-takeoff and ai-bookkeeper weakest for performance (83/84). That note treated the four
render-blocking files as the cause. Lighthouse in devtools-throttling mode (real 4x CPU slowdown,
not the Lantern simulation) shows a different main cost: a TBT of about 650 ms on
wall-framing-takeoff, and its longest task attributed to a script was **pf-site.js**, the shared
chrome file every page loads, at about 250 ms. Lighthouse's forced-reflow insight pointed at the
scroll-accessibility sweep (`SCROLL_A11Y_SCRIPT` in `build.mjs`). That sweep gives a sideways
scrolling box a keyboard tab stop (axe `scrollable-region-focusable`, WCAG 2.1.1).

**What it cost, and why.** I timed it inside the page with Playwright and 4x CPU throttling on
wall-framing-takeoff (4,204 elements):
- On DOMContentLoaded, `collect()` took 130 to 147 ms and `measure()` 12 to 16 ms (3 runs).
- The sweep called `getComputedStyle(el).overflowX` on every element. Layout was already clean at
  that point (a forced `offsetHeight` before it took 0 ms). Even so, the **first** sweep took about
  98 ms and a second, identical sweep right after it took 15 ms. The cost is Chrome creating a
  computed-style object for each element the first time anything asks, not the style values.
- Skipping the 812 elements inside `hidden` cards saved only about 15 ms, so that was not the fix.

**What changed** (`platform/pages/build.mjs`, `SCROLL_A11Y_SCRIPT`):
1. **Ask only the elements a rule could make scroll.** The sweep now reads the page's stylesheets
   (185 rules on wall-framing-takeoff) and collects the selectors of rules that set
   `overflow-x` (or `overflow-inline`) to auto, scroll or overlay. It adds `[style*="overflow"]`,
   runs one `querySelectorAll` and then checks each match with `getComputedStyle`. It gets 7
   selectors and 40 elements to check instead of 4,204. Rules inside a media query that does not
   match are included, so this is a superset, and the final check is unchanged. It falls back to
   the full sweep when a stylesheet's rules cannot be read (any cross-origin sheet except Google
   Fonts', which holds only `@font-face`) or when `querySelectorAll` rejects the list. The one
   thing it misses is the browser's own stylesheet, which gives `<textarea>` `overflow:auto`. A
   textarea takes focus already, so it needs no tab stop.
2. **Measure after the paint, not inside the event.** The sweep and the `scrollWidth` check now run
   in a `setTimeout` queued from `requestAnimationFrame`, coalesced so a burst of input events
   queues one check. Before, the check ran inside DOMContentLoaded and every `input`/`change`/`click`,
   just after a calculator had rewritten its result panel, so the browser had to lay the page out
   then and there. Table wrapping stays synchronous, so a new wide table is never left unwrapped
   for a frame and can't push the page sideways.

**Numbers.** Lighthouse 12.8.2, mobile, `--throttling=devtools`, same session, 3 runs each, local
build served by `platform/pages/lighthouse.mjs`:

| wall-framing-takeoff | longest pf-site.js task (ms) | TBT (ms) | perf |
|---|---|---|---|
| before | 244, 266, 243 (avg 251) | 638, 657, 646 (avg 647) | 84, 83, 83 |
| rule scan only | 193, 181, 168 (avg 181) | 664, 615, 595 (avg 625) | 83, 84, 85 |
| rule scan + after the paint (shipped) | 131, 135, 104 (avg 123) | 530, 619, 581 (avg 577) | 86, 84, 85 |

| ai-bookkeeper | longest pf-site.js task (ms) | TBT (ms) | perf |
|---|---|---|---|
| before | 93, 92, 86 | 170, 121, 106 (avg 132) | 97, 99, 99 |
| shipped | 77, 72, 83 | 108, 109, 117 (avg 111) | 99, 99, 98 |

After the change pf-site.js shows up as two tasks (the second was 87 to 97 ms on
wall-framing-takeoff). Page TBT on a single run moves by ±50 ms, so treat the TBT averages as a
direction. The task lengths are the cleaner signal. Simulated-mode Lighthouse (the default) did not
move, for the reason below.

**Parity check.** For 61 built pages (hub, research, writing, stories, 11 flagships, 3 posts, 45
other directories), each at 390 px and 1280 px, I loaded the old and new pf-site.js and compared
which elements carried `data-pf-scrollable`. I checked once after load, then again after clicking
the page's first primary button. 121 of 122 matched; tab stops on load were 90 old and 89 new.
The one difference: on wall-framing-takeoff at 390 px, the board-length table inside a **closed**
`<details>` gets no tab stop until it is opened. Chrome doesn't lay out closed-details content, so
after the paint the table measures 0 wide. The old sweep's read inside DOMContentLoaded forced that
layout. For a keyboard user nothing changes: Enter on the summary opens it, the `click` re-check
runs, and the next Tab lands on the table with both scripts (checked in Playwright).

**Tests.** Two new tests in `platform/pages/build.test.mjs` ("the scroll pass ...") run the real
shared file against a stub page. They check that nothing is measured inside the triggering event,
that a `<p>` no overflow rule names is never asked about, that only a box that really scrolls gets a
tab stop, and that a non-Google cross-origin sheet or a rejected selector falls back to the full
sweep. Both would fail on the old script.

**How to reproduce.** Build. Then install `lighthouse@12.8.2` into a scratch prefix and run
`LIGHTHOUSE=... node platform/pages/lighthouse.mjs --pages=wall-framing-takeoff/,ai-bookkeeper/ --throttling=devtools`.
The JSON lands in `/tmp/lh-*/`; read `long-tasks` and `forced-reflow-insight`. Setting `TMPDIR` to a
long scratch path makes chrome-launcher fail (`checkReady`), so leave it at the default.

## Still weakest, and what I would do next

1. **Simulated FCP 3.3 s on wall-framing-takeoff and ai-bookkeeper is mostly Lantern counting
   modulepreloads as render-blocking.** The LCP element is a static `<p>` with 0 ms load delay and
   2.9 s "render delay". Under devtools throttling, FCP/LCP is 1.5 s. The build's `preload.mjs` puts
   38 `<link rel="modulepreload">` in the `<head>`, and Lantern's pessimistic FCP graph treats
   high-priority scripts as blocking. Moving the preload links to the end of `<body>` (they would
   still be found by the preload scanner) is worth an A/B with both throttling modes. It also needs
   the time until the tool can be used, which is what the preloads were added for (2026-11-07). Don't
   remove them on Lantern's word alone.
2. **The ask-voice button appends a `<style>` element after load** (`ASSISTANT_LAUNCHER_JS`). That
   invalidates style for the whole document, which costs a lot on a 4,200-element page. Lighthouse
   attributes 35 ms of forced reflow to that line. Its CSS could live in `pf-chrome.css`, which every
   page already loads.
3. wall-framing-takeoff's own module script still has a 300 ms task and the DOM is 4,204 nodes.
   `content-visibility:auto` on below-the-fold cards is still untried. pf-site.js's sweep no longer
   reads every element, so it won't defeat that experiment.
4. Still open from earlier notes: `lighthouse.mjs --min-a11y=100` in the nightly browser checks
   (control-plane CI, own PR), and a desktop run (`--form=desktop`).
