---
title: "The 1099 vendor tracker now shows its first field on a phone screen"
seo_title: "1099-NEC vendor tracker: the form now starts on the first phone screen"
date: 2026-11-22
tags: [polish, design, seo]
description: "The 1099-NEC, 1099-K and S-corp salary tools stacked link notes above the form. Moving them to a card near the end cut 300 to 450 px of scrolling."
---

The [1099-NEC vendor tracker](https://marisstella.app/1099-vendor-tracker/) answers one
January question: which contractors need a 1099-NEC now that the threshold went from $600 to
$2,000. On a 390×844 phone its first input started 1,213 px down the page. A reader saw the
title, the intro, a "what you can now do" box, two "see also" notes and the edge of a card,
then had to scroll before typing anything.

Each note was useful (one points to the
[1099-K reconciliation worksheet](https://marisstella.app/1099k-reconciliation-worksheet/), one
to the [1099-NEC vendor CSV checker](https://marisstella.app/1099-vendor-csv-checker/)), but
they answered "what next?" before the reader had started. They now sit, word for word, in a
"Related guides and tools" card just above the common questions, together with the links to
the page's own guides.

| page (390×844 phone) | first field before | after |
|---|---:|---:|
| [1099-NEC vendor tracker](https://marisstella.app/1099-vendor-tracker/) | 1,213 px | 801 px (on screen) |
| [1099-K threshold checker](https://marisstella.app/1099-k-threshold-checker/) | 1,353 px | 958 px |
| [S-corp reasonable compensation calculator](https://marisstella.app/s-corp-reasonable-compensation-calculator/) | 1,456 px | 1,152 px |

The other two are closer but not there yet; the next steps are written down for the next run.

Two fixes to the measuring itself came with it. Our fold probe counted the footer's "Don't
count my usage" checkbox as a page's first field on pages whose footer sits inside `<main>`,
which put two product pages at the top of the "deepest form" list for the wrong reason. It
now skips the footer. And the check that stops "see also" notes piling up above a tool only
looked inside a page `<header>`; it now also reads the opening of pages that have none, which
is how these two 1099 checkers slipped past it.

These numbers are layout measurements in a headless browser, not visitor data: we don't know
how many people scroll past the intro, only that they no longer have to.
