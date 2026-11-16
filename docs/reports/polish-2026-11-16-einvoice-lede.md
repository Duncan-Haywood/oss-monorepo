# Polish: E-invoice Preflight's hero, from a 250-word list to a lede

Date: 2026-11-16. Track: polish/0. Not from a previous "Still weakest" list: those had moved
to the blog's topic pages, and today's six polish runs all worked there. This run built the site and
screenshotted the hub, six flagships, research and Stories at 390 and 1,280 px, then picked the
weakest thing a visitor sees first. That was flagship 5, `einvoice-preflight`: under its h1 sat one
paragraph listing 15 faults in a single comma-separated sentence, followed by "After using this,
you can now review a structured invoice in the browser in seconds". On a phone it ran 25 lines.
Open PRs searched (`polish in:title`): #11730, #14012 and #12397, none touch this page.

## What changed (`ventures/einvoice-preflight/index.html`)

- The lede is three sentences: what you drop in, what comes back (a rule ID and the fix, plus
  the official EN 16931, XRechnung and Peppol rules that already run on the page), and that the file
  stays in the tab. Every claim is something the page already did; the filler sentence is gone.
- The 15 faults are now a list inside a visible `<details>` ("What the built-in rules catch"),
  two columns at desktop width. The text is still in the page for search and assistants; the
  `FAQPage` JSON-LD and `featureList` are unchanged and still name every check.
- Nine of the twelve "Load ..." example buttons fold into "More broken examples (9)". "Load a
  broken example", "Load a passing example" and "Repair the arithmetic" stay out. The button ids
  and labels are unchanged, so the page script and `page.test.mjs` still find them.
- Summaries get a focus ring; nothing animates.

## Measured (Playwright on the built site, `node platform/pages/build.mjs`)

| | 390 before | 390 after | 1,280 before | 1,280 after |
|---|---|---|---|---|
| lede paragraph height | 552 px | 181 px | 264 px | 104 px |
| top of the tool (`main.layout`) | 925 px | 595 px | 596 px | 476 px |
| "Check invoices" button | 1,471 px | 1,140 px | 1,120 px | 999 px |
| `scrollWidth` | 390 | 390 | 1,280 | 1,280 |

At 1,280 the drop zone and the result panel are now both above a 900 px fold, with room to spare.
With both folds opened at 390 the page still has no sideways scroll.

Screenshots: `img/polish-2026-11-16-einvoice-lede-{before,after}-{390,1280}.png`.

Tests: `node --test page.test.mjs page-create.test.mjs` 13/13, plus the other page tests that
read `index.html` (mixed-vat, official, rule-reference, sdi-codes, vs-avalara, examples) 39/39;
`node --test 'platform/pages/*.test.mjs'` (see the run record).

## Still weakest, and what I would do next

1. **Other tool heroes with the same wall.** A scan of the first paragraphs between each
   `ventures/*/index.html` h1 and its first form: 65 run past 90 words, 6 past 120.
   Longest: where-to-sell-calculator 179, ada-title-ii-evidence 154,
   import-landed-cost-calculator 134, freight-accessorial-auditor 129, s3-bucket-exposure-check 128,
   lomb-scargle-periodogram 121. Same fix: three sentences and a `<details>` for the list. A check
   with a word budget would need an exceptions list for the long tail at first; I did not add one.
2. **The phone CTA row stacks** on this page ("Try a broken example" wraps under "Check an
   invoice") because the h1 type is large. A smaller CTA padding at 390 would keep one row.
3. Carried over: the hub's 980 to 1,180 px empty margin; the tools topic index without ledes;
   401 research and 409 tool posts that name no project.
