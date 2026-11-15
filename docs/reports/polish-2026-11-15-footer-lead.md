---
kind: polish
date: 2026-11-15
---
# Polish 2026-11-15: footer lead line only claims "runs in your browser" on browser tools

Track: polish/0. Picked from `polish-2026-11-15-embed-gate.md`, "Still weakest" item 1 (the footer
lead "Free and private, like this one — everything runs in your browser" under ShootFlow, Vendor
Watch and the other no-control pages). Open PRs checked (all 60 listed): none touch the footer.

## What changed

- `platform/pages/build.mjs`: `injectChrome` takes `browserTool` (default `true`, so every other
  caller is unchanged). False gives `FOOTER_LEAD_NOT_A_BROWSER_TOOL`, "More from the same free,
  open-source catalogue." A tool with `externalCallHosts` keeps its lookup sentence either way.
- `addSiteChrome`: the `names` pass that already reads each entry page now also records
  `hasOwnControls(entry)`. Each page gets `browserTool = entryHasControls || hasOwnControls(page)`.
- `platform/pages/footer-lead.test.mjs`: 4 tests (default, false, lookup hosts, and an
  `addSiteChrome` run over a calculator + a docs tool with one control page).

**First version was wrong.** I first decided from the entry page alone. Measuring the built site
showed quick-pick-survey (`rank.html`, `decide.html`) and ai-engineering-academy (ten calculator
pages) are hubs whose calculators live inside them; the entry-only rule would have taken "like this
one" off 12 real calculators. Hence the "or this page" half.

## Measured (full build of main vs. full build of this branch, `measure.mjs` loop over `dist/`)

| | before | after |
|---|---|---|
| pages with "like this one" | 3,563 | 3,535 |
| no-control pages in a no-control-entry tool saying it | 28 | 0 |
| pages with the neutral lead | 0 | 28 |
| `check.mjs` | — | 10,294 pages, no dead links |
| vendor-watch / quick-pick-survey scrollWidth at 390 | — | 390 / 390 |

Screenshots of the footer at 390 px: `img/polish-footer-lead-{vendor-watch,quick-pick-survey}-after-390.png`.
`node --test 'platform/pages/*.test.mjs'`: 1,709 tests; 6 failed on this post's 220-character description, fixed, and the 7 affected files re-run: 109/109 pass.

## Still weakest, and what I would do next

1. **The "More free tools" heading on those 28 pages** is fine, but the related links under it are
   chosen by category, and on Vendor Watch they're Shopify/Salesforce CSV checks: a reader of a
   self-hosted monitor gets unrelated tools. `relatedTools` could weight tools that share a tag.
2. **"Need this tool to do more?"** on ShootFlow's docs pages calls a docs page a tool. Small; same
   flag could pick "Need this to do more?".
3. Carried over: ShootFlow's "What exists today" bullet; `.pager` defined twice in the writing
   STYLE; research index card ledes; topic-page titles four lines on phones; band column vs tool
   column alignment at 1,280 px (`polish-2026-11-15-band-inset.md`).
