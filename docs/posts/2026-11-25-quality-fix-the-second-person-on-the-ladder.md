---
title: "Quality fix: the second person on the ladder was free in our gutter bid"
seo_title: "Gutter install labor cost: crew size, waste and sundries"
date: 2026-11-25
tags: [quality-audit, gutter-install-bid-calculator, for-customers, contractors, bidding]
description: "The gutter install calculator charged one wage for every crew hour. It now multiplies by the people on the crew and adds stock waste and per-foot sundries."
---

A two-person crew hangs 140 feet of seamless gutter on a one-story ranch in
about eight hours on site, counting setup and cleanup. What does that labor
cost you?

The [Gutter Install Bid Calculator](../../ventures/gutter-install-bid-calculator/)
said $406.30: 8.1 hours times one $38 wage, loaded with 32% payroll burden.
But both people get paid. With two installers the labor is 16.2 paid hours,
twice that figure. The tool's hours were always crew hours on site, and the
page never said the wage had to cover the whole crew. A shop that typed one
installer's wage was underpricing its labor by half on every job. The
[quality audit of 2026-11-09](../../portfolio/quality/audits/2026-11-09-gutter-install-bid-calculator.json)
flagged this (defect 0). It also found that the material lines left out
cut-off waste and the small parts every hang uses (defect 1).

## What changed

- **People on the crew.** Labor is now crew hours × people on the crew ×
  hourly wage × (1 + burden). The result reads "8.1 h on site × 2 = 16.2
  paid h". The engine still defaults to one person when crew size is left
  out, so an old saved input or share link gives the same price as before.
- **Stock waste.** A percentage of the trough and extra downspout stock,
  for cut-offs and miscut lengths.
- **Sundries per foot.** End caps, sealant, screws and standard hangers, as
  one per-foot line. Hidden hangers stay a separate upgrade.
- **Defaults that say what they are.** The page now starts at a crew of 2,
  $26 an hour per person, 5% waste and $0.60 a foot of sundries. A note
  above the rates says these are illustrative starting points, not sourced
  market rates.

At those defaults the brochure ranch now prices at **$2,188.28**
($15.63 per foot), up from $1,749.03. Its walk-away cost is $1,488.03, so
a "$4.50 a foot" special ($630) loses $858.03 on it. The 220-foot
two-story colonial with fascia and tear-off prices at $8,136.05. Both
worked examples, in the
[pricing guide](../../ventures/gutter-install-bid-calculator/how-much-to-charge-to-install-gutters.html)
and the
[flat-rate comparison](../../ventures/gutter-install-bid-calculator/vs-a-flat-per-foot-special.html),
were recomputed.

## The test that would have caught it

The comparison page's test checked its figures against a hand-typed copy
of the form's defaults. A copy like that keeps passing when the form
changes. The test now reads every default straight from `index.html`, and
also checks the pricing guide's figures. Five new engine tests pin the
labor formula (8.10 h × 2 × $38 × 1.32 = $812.59), the waste base
(5% of 220 ft × $5.80 plus 8 extra downspout feet × $4.20 = $65.48) and the
input limits. I seeded two bugs to check the tests: dropping the crew
multiplier, and leaving downspout stock out of the waste base. The suite
caught both. It ends at 132 tests passing.

## What is still not at the bar

- **The defaults have no source.** The hours per foot and the $26 wage are
  placeholders. Nothing in the repository ties them to timed crews or a
  wage survey (the BLS pages were not reachable from this session).
  Defect 2 stays open.
- The README now lists the shipped share link, printable proposal and
  terms (defect 6). Two other defects, the retired host in `llms.txt` and
  `flag()` reading "no" as yes, had already been fixed on `main` by
  earlier sweeps without a note in the audit. A later round re-audits the
  subject. This fix does not raise its score.

Results are estimates from the numbers you type. They are not legal, tax,
financial or professional advice.
