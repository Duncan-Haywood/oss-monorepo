---
title: "Timing a 3D print from its moves: within 2% of PrusaSlicer on 21 files"
seo_title: "Estimate 3D print time from G-code moves"
date: 2026-11-24
tags: [ventures, 3d-printing, gcode, pricing, algorithms]
description: "The 3D print price calculator now times G-code with no slicer summary from its moves: median 0.2%, worst 1.7% from PrusaSlicer's own estimate."
---

The [3D print price calculator](https://marisstella.app/3d-print-price-calculator/) prices one print from filament, power, wear, failures and labour. Two of those numbers come off the slicer: grams of filament and hours on the printer. Since last month the page could read both from the summary comments that PrusaSlicer, OrcaSlicer, Bambu Studio, Cura and Simplify3D write into the G-code. But not every file has a summary. Other slicers, CAM tools, print hosts and post-processing scripts can drop it or never write it, and then the page had nothing to offer.

Now it reads the moves. Each `G0`/`G1` line (and `G2`/`G3` arc) becomes a block with a length, a requested speed and a direction. The planner caps each block's speed and acceleration by the limits the file sets (`M201`, `M203`, `M204`, `M205`). It decides how fast the head may take each corner, using the jerk rule from Marlin's classic planner, or junction deviation when the file sets `M205 J`. Then it runs a backward and a forward pass, so every block can actually reach its neighbours' speeds at its acceleration. Each block is timed as accelerate, cruise and decelerate, or as a triangle when it is too short to reach full speed. The filament figure is the net sum of the extruder moves.

## How close it lands

We sliced PrusaSlicer's bundled models (Benchy, the Stanford bunny, a torus, a box, a sphere, an M3 nut and a recycling symbol) plus one robot-arm part from this repository. We used PrusaSlicer 2.7.2, the stock settings, Marlin 2 settings with the limits written into the file, fast and slow printer limits, arc fitting, relative extrusion and a spiral vase. The estimator read every file whole and ignored the comments, then we compared its figure with the one PrusaSlicer wrote:

| | result |
|---|---|
| files | 21 |
| median gap to PrusaSlicer's estimate | 0.2% |
| worst | 1.7% (Benchy at 500 mm/s², jerk 20) |
| 4h 19m bunny | 4h 19m 27s vs 4h 19m 49s |
| filament | 2.00 mm short on every file: the closing retraction, which PrusaSlicer counts and we net out |

Two fixes on the way there were worth keeping. The first version treated jerk as the plain change in each axis's speed at a corner. Marlin's classic planner is looser when an axis reverses: it holds the reversal to the jerk on the larger side, not the sum of both. Switching to that cut the median gap from 0.7% to 0.3%. The second fix timed the `G28 X0` that ends the stock end code as a move back to zero, as PrusaSlicer does. The worst file then went from 11.7% (a 22-second print, so 2.6 seconds) to 1.7%.

The honest caveat is the printer. Most files don't state their limits, so the page then uses PrusaSlicer's built-in defaults (1,500 mm/s², jerk 10). A Benchy sliced for a fast printer (4,000 mm/s²) then reads 9.2% long, and one for a slow printer 2.5% short. A file that carries its `M20x` lines gets the 0.3% and 1.7%.

## Two bugs that came out of real files

To get a second reference, we pulled 15 Cura files people have committed to public GitHub repositories. Cura's estimate is printer-blind in the same way, so the time column there spreads widely (−86% to +109%), and each outlier had a plain cause. One file ends with a five-minute `G4 S300` pause, which Cura leaves out. Another's header was Cura's unfilled template: `;TIME:6666`, `Filament used: 0m`, bounds of 2.14748e+06. The calculator used to read that template as a 1.85-hour print with no filament. It now sets the template aside and times the moves instead: 0.26 hours, 2.94 g.

The browser check found the second bug. PrusaSlicer with no filament profile writes `total filament used [g] = 0.00`, because it has no density to weigh with. The calculator took that at face value and priced a free print. It now reads zero as unknown and weighs the `filament used [cm3]` line in the same file: 10.68 cm³ of PLA, 13.24 g.

## What it does not do

It does not time heaters (`M109`, `M190`), bed probing (`G29`) or the firmware's finer behaviour: minimum segment time, input shaping, pressure advance, Klipper's minimum cruise ratio. It gives the same kind of number a slicer gives, not a stopwatch reading. The method, both tables and the script that rebuilds the 21 files are in [`eval/motion-vs-prusaslicer-2026-11-24.md`](../../ventures/3d-print-price-calculator/eval/motion-vs-prusaslicer-2026-11-24.md). The planner is [`gcode-motion.mjs`](../../ventures/3d-print-price-calculator/gcode-motion.mjs), MIT licensed, about 370 lines, with no dependencies, and it runs in the browser. The file you choose is never uploaded.

Next, if people use it: a Klipper reference to check the junction-deviation path against, and a "parts per plate" field, so a plate's hours divide into a per-part price.

*Written with AI assistance. PrusaSlicer, Cura, Marlin and Klipper are named to describe compatibility; this project is not affiliated with or endorsed by any of them.*
