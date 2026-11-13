---
kind: polish
topics: [layout, mobile, seo, tooling]
date: 2026-11-13
---
# Polish, 2026-11-13: the intro is not the link hub (eBay, Etsy, Reverb)

**Why.** Item 2 of "Still weakest" in `polish-2026-11-13-answer-leads-etsy-garnishment.md`: "The Etsy
intro under the lead is a 20-link paragraph (about 1,100 px at 390)." Before taking it I measured
whether it was one page or a pattern.

## How it was measured

Full local build of main (`node platform/pages/build.mjs`, 9,098 pages), served with
`python3 -m http.server`, pre-installed Chromium, third-party requests blocked, reduced motion,
390 x 844. For each of the 1,346 venture `index.html` pages: the document y of the first visible
input/select/textarea (outside the site header, nav and search), 150 ms after `load`, and the height
of the tool's own `<header>`.

| 1,346 tool pages at 390 px | first input at |
|---|---|
| median | 750 px |
| 90th percentile | 1,005 px |
| past one 844 px screen | 380 |
| past two screens (1,688 px) | 18 |

The 18 over two screens are mostly not calculators (hearth-and-horizon, saints-by-candlelight, the
self-hosted app landing pages: their first input is a footer checkbox). Among real calculators the
worst were **ebay-fee-calculator 1,940** (header 1,704 px), clothing-design-studio 1,722,
appointment-deposit-calculator 1,613, quarterly-estimated-tax-calendar 1,460, **etsy-profit-calculator
1,451** and **reverb-fee-calculator 1,451**. The three marketplace fee calculators share one cause:
the paragraph under the answer lead names every comparison and every guide page, in one sentence.

## What changed

1. **etsy-profit-calculator**: the intro keeps one sentence of what the tool does, then a wrapping row
   of 10 short jump links (`<nav class="jump" aria-label="On this page">`: Etsy Plus, Personalization,
   ... Guides). The 13 guide links moved, every one kept, to a new `#guides` section, "Questions this
   answers, one page each", above the FAQ (two columns from 600 px).
2. **ebay-fee-calculator**: the 25-clause "whether ... still beats ..." sentence is now one sentence
   naming the groups (returns and refunds, offers and coupons, Promoted Listings, shipping, Store tiers,
   auction vs Buy It Now), and a closed `<details>`, "Jump to one of the 24 comparisons below", holds
   a link to each section by its own `h2` plus the FAQ. The two "vs." links stay in the intro.
3. **reverb-fee-calculator**: same as Etsy: 10 jump links, the 10 guide links in a `#guides` list.
4. **`platform/pages/intro-links.test.mjs`** (new): fails a venture whose header has a paragraph with
   more than 8 links; the six pages already over (clothing-design-studio 40, ai-bookkeeper 33,
   league-schedule-generator 28, shift-roster-builder 21, state-residency-day-counter 10,
   3pl-quote-normalizer 10) may shrink but not grow, and the test asks for an entry's removal once the
   page is fixed.

Jump links are 32 px tall (above the 24 px target size). Colours: chip text 15.6:1 (Etsy), 15.8:1
(Reverb); the eBay summary `#3569cb` on `#eef2f7` 4.63:1. No new request, no script.

## Numbers (390 x 844 and 1,280 x 844, first input's document y / tool header height)

| page | 390 before | 390 after | 1,280 before | 1,280 after |
|---|---|---|---|---|
| ebay-fee-calculator | 1,940 / 1,704 | **884 / 648** | 1,204 / 965 | 724 / 485 |
| etsy-profit-calculator | 1,451 / 1,215 | **949 / 713** | 988 / 749 | 742 / 503 |
| reverb-fee-calculator | 1,451 / 1,215 | **973 / 737** | 927 / 689 | 705 / 467 |

No sideways scroll at either width. Venture suites: eBay 505/505, Etsy 196/196, Reverb 123/123;
`answer-lead.test.mjs` 50/50 (the Etsy lead is untouched).

Screenshots, 390 px: [eBay before](img/polish-2026-11-13-intro-walls-ebay-390-before.png) ·
[eBay after](img/polish-2026-11-13-intro-walls-ebay-390-after.png) ·
[Etsy after](img/polish-2026-11-13-intro-walls-etsy-390-after.png).

## Still weakest, and what I would do next

1. **The six KNOWN pages in `intro-links.test.mjs`.** clothing-design-studio (two paragraphs of 40 and
   37 links, first input 1,722 px) and ai-bookkeeper (33) are flagships, so their intros are seen; the
   same jump row + guides list works. league-schedule-generator and shift-roster-builder already have a
   "Make a schedule" button in the header, so they hurt less.
2. **appointment-deposit-calculator (1,613) and quarterly-estimated-tax-calendar (1,460)** are long
   for other reasons (no link wall); read them one by one.
3. **A shared jump-row component.** Three pages now carry near-identical `.jump` CSS in their own
   `<style>`. If a fourth wants it, put it in the venture chrome instead.
4. Carried over: topic-page titles four lines on phones; `.pager` defined twice in the writing STYLE;
   the ticker's third line at 320 px.
