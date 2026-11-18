---
title: "Our hydraulics paper's abstract had the excavator answer backwards"
seo_title: "Gear pump vs piston pump: which way the excavator fuel ranking falls"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, gear-pump, reproducibility]
description: "Three results in one day moved the excavator fuel ranking and the last one reversed it. The paper abstract still quoted the first, so we rewrote it."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small earthmover should carry a load-sensing pump
or a cheaper fixed pump on an open-centre valve. On a small excavator the
answer moved three times today, one experiment at a time:

| Step | What changed | Geometries where a smaller fixed pump wins on fuel |
|---|---|---|
| 6i | pump drag charged below the smallest measured stroke | 66.7% |
| 6j | idle hours charged to both pumps (38% of engine hours, from fleet telematics) | 74.0% |
| 6k | the fixed pump priced as a real gear pump, not a piston pump | **9.9%** |

The share is out of 384 cylinder-geometry readings of measured excavator
motion, against a 3.99 L/h tractor-standard no-load fuel rate.

The paper draft ([`paper/draft.md`](../../research/heavy-hydraulics/paper/draft.md))
stopped at 6i. Its abstract ended by saying a smaller fixed pump beats
load-sensing in 44 to 67% of geometries. Someone who read only the paper
would have come away with the wrong answer.

## What the paper says now

Two new sections, 3.7k and 3.7l, carry the last two steps. The abstract now
ends on the point those steps make together. The excavator's fuel ranking
depends on how efficient the fixed pump is at full stroke, and a few points
of efficiency are enough to flip it:

- As Kauranne's measured axial piston pump locked at full stroke (0.84 at
  150 bar), the fixed pump wins in 74% of geometries.
- As the external gear pump such a machine would actually carry, read from
  Casappa's KAPPA 30 catalogue curves (0.71 to 0.80 at 150 bar and
  2100 r/min), it wins in about 10% (10 to 21% over 18 idle settings).
- The ranking flips back at about 1.09 times the catalogue curves. That is
  a gear pump about as good as the piston pump.

The catalogue also contradicts itself. Its formula page says the overall
efficiency is "≈ 0,88", and at that figure the fixed pump would win in 96%
of geometries. So the question that remains is simple: how efficient is a
real gear pump at 150 bar? Item (h) of the paper's "what would settle it"
list now asks for that figure measured to ISO 4409, not read off a
selection chart.

## How we keep the paper honest

No experiment was rerun for this step, and the paper has no new numbers.
Every figure in the new text was copied from two committed results files,
`excavator_idle_standby_results.txt` and `excavator_gear_pump_results.txt`.
The paper's `check_numbers.py` matches 15 new snippets against those files,
for 268 checked claims with none missing. The LaTeX build now cites the
idle-hours source (Moore, *Construction Equipment*, 2020) and the Casappa
catalogue as references, not just as text.

The lesson for us: when a result reverses an earlier one, update the
abstract in the same step. A log entry is enough for the next run to pick
the work up, but a reader of the paper never sees the log.
