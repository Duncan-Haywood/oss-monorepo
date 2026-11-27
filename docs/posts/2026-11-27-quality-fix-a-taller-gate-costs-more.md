---
title: "Quality fix: our gate bid priced a 10 ft leaf the same as a 5 ft one"
seo_title: "Pricing an automatic gate by leaf height, not only opening width"
date: 2026-11-27
tags: [quality-audit, automatic-driveway-gate-bid-calculator, for-customers, contractors, bidding]
description: "Our driveway gate bid asked for leaf height, printed it on the proposal, then priced nothing from it. Leaf cost and hang hours now scale with height."
---

A driveway gate that is twice as tall has about twice the pickets, panel and
frame, and it is heavier to hang. The
[Automatic Driveway Gate Bid Calculator](../../ventures/automatic-driveway-gate-bid-calculator/)
asked for the leaf height, checked it and printed it on the customer proposal
("16 ft opening × 6 ft leaf"). It then ignored it. A 10 ft leaf cost the same
as a 5 ft one. The 2026-11-26 quality audit
([audit file](../../portfolio/quality/audits/2026-11-26-automatic-driveway-gate-bid-calculator.json))
rated this a high-severity defect: the proposal stated a scope the price did
not cover.

## What changed

The leaf rate ($ per lineal foot) and the hang hours per lineal foot now apply
at a stated height, **Leaf rates quoted at height**. It is 5 ft by default
and a shop can change it to match its supplier's quote. Leaf dollars and hang
hours scale by leaf height ÷ that height. So a 6 ft leaf on 5 ft rates costs
1.2 times as much, and a 10 ft leaf twice as much.

Checked by hand on the default 12 ft single aluminum swing, which runs
$85 per lineal foot and 0.35 hours per lineal foot:

- at 5 ft: 12 × $85 = $1,020 of leaf and 4.2 hours to hang it;
- at 10 ft: $2,040 and 8.4 hours;
- the extra $1,020 plus 4.2 h × $55.44 loaded wage, with 16% overhead
  and a 28% margin on top, adds $2,018.48 to the price. The page in a
  browser went from $6,505.58 to $8,524.06, exactly that difference.

The two 5 ft presets did not move. The 6 ft ones did. The 16 ft dual steel
swing on masonry now costs $15,278.85 instead of $14,716.71, and is priced at
$21,220.62 instead of $20,439.88. The
[$4,500 special page](../../ventures/automatic-driveway-gate-bid-calculator/vs-a-flat-4500-special.html)
and the
[pricing guide](../../ventures/automatic-driveway-gate-bid-calculator/how-much-to-charge-to-install-an-automatic-gate.html)
now show those figures. The guide's "almost half of that dual bid's cost is
extra work" line now reads about 44%, which is the new share.

## What is still not at the bar

Height now drives the leaf price, but not the operator. A heavier or taller
leaf needs a bigger operator, and every gate style still gets one fixed-price
operator per leaf. Other gaps the audit listed are also still open:

- one photo-eye kit per job, while UL 325 needs entrapment protection for
  each zone;
- a slide leaf priced at the opening width, with no cantilever tail;
- a flat AC trench line.

They are listed under the tool's Limitations. A later audit round re-scores
the tool; this fix does not raise its score.
