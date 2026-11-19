---
kind: polish
topics: [design, depth, seo]
date: 2026-11-19
---
# Polish: flagship ledes cut to one or two sentences, detail in a fold

Date: 2026-11-19. Track: polish/0.
Picked item 1 of "Still weakest" in `polish-2026-11-19-flagship-hero-order.md` ("The ledes are
long"). `polish_queue.py --days 2` listed it open; no open PR had `polish` in its title.

## What was wrong

With the buttons moved above the lede (PR #17779), the next thing a phone visitor read was a
paragraph of 7 to 11 lines at 390 px, about half of it in bold, so nothing stood out. On
ai-bookkeeper the first card started at 909 px, below the first screen of a 390×844 phone.
einvoice-preflight already did it the other way: a short `p.lede` and a `<details>` fold ("What the
built-in rules catch") for the detail.

## What changed

Seven flagships take einvoice-preflight's pattern:

- `p.lede`: one or two sentences, at most two bold phrases.
- `details.hero-more`: the rest of the old lede, reworded so it doesn't repeat the lede. Each
  summary says what is inside ("What else it does", "How it assigns people", "The two methods it
  runs"...). Folded text is still in the HTML, so search engines and `llms.txt` readers keep it.
- Disclaimers stay visible. On ai-bookkeeper the `note` now holds only the independence line and
  "Not accounting or tax advice"; the AI-optional sentence moved into the fold. On sales-agent the
  "Pairs with" links moved into the fold; the one-rule note (the agent never does more without you)
  stays visible. open-tennis-robots keeps its status note ("no robot has been built yet") and its
  "free to build, change and sell" paragraph visible.
- One CSS rule per page, appended to the existing `/* flagship-hero */` style: summary in the
  page's headline colour, weight 600, a 3 px `:focus-visible` outline. Works without JavaScript.

No title, `h1`, meta description or JSON-LD changed.

## Measured (Playwright, `--only` previews of main vs this branch, full site chrome)

| page | lede lines 390 before → after | first card top 390 before → after (px) | first card 1280 before → after |
|---|---|---|---|
| ai-bookkeeper | 11 → 5 | 909 → 738 | 476 → 447 |
| shift-roster-builder | 10 → 5 | 802 → 720 | 526 → 518 |
| open-tennis-robots | 8 → 4 | 813 → 758 | 517 → 537 |
| changepoint-detector | 8 → 3 | 687 → 605 | 384 → 401 |
| wall-framing-takeoff | 8 → 4 | 802 → 744 | 505 → 522 |
| sales-agent | 8 → 5 | 707 → 653 | 454 → 470 |
| league-schedule-generator | 7 → 4 | 725 → 692 | 455 → 497 |
| einvoice-preflight (unchanged) | 7 | 595 | 463 |

At 390 px every page's first card moved up, by 33 to 171 px, and all eight now start above
844 px. **The cost is on desktop.** At 1280 the old ledes were already only 2 to 4 lines, so the
summary line (~35 px) adds more than the shorter lede saves on five pages (+8 to +42 px). I judged
the phone gain worth it: the hero now reads as headline, buttons, one sentence, then a choice.

Word counts of the lede (the new check's measure): 53 to 86 before, 23 to 39 after
(einvoice-preflight: 50).

Screenshots (390×844): `img/polish-short-lede-{before,after}-ai-bookkeeper-390.png`,
`img/polish-short-lede-{before,after}-shift-roster-builder-390.png`.

## The check

`platform/pages/flagship-hero-order.test.mjs` gains `ledeWords()` and a test: on each flagship with
a header hero, the first paragraph after the `cta-row` is at most 50 words. On main it fails for all
seven pages this PR edits; with this PR it passes.

## Still weakest, and what I would do next

1. **Desktop could keep the fold open.** A two-line inline script
   (`if (matchMedia('(min-width: 900px)').matches) el.open = true`) right after each fold would give
   desktop its old text back with no layout shift. I left it out because the sites work without
   JavaScript and a fold that changes state by width can surprise; measure if desktop matters more.
2. **The jump-chip `nav.pf-jump`** on ai-bookkeeper, shift-roster and league (carried over, item 3
   of `polish-2026-11-19-flagship-hero-order.md`) is now the tallest part of the ai-bookkeeper hero
   at 390 (three rows of chips). Moving it below the first card would bring the form fully on screen.
3. **Eyebrows wrap to two lines on a phone** on five flagships (`AI BOOKKEEPER · DOUBLE-ENTRY ·
   RUNS IN YOUR BROWSER · NOTHING UPLOADED`). Two items is plenty; the rest is said in the lede.
4. **Extend the lede check beyond flagships**: the same pattern applies to every venture with a
   `header` hero and `cta-row` (`grep -l 'class="cta-row"' ventures/*/index.html`); count first.
5. Carried over: `polish-2026-11-19-flagship-hero-order.md` items 2 and 4.
