# Allies who fade: how fast can a bloc on the robots' side dissolve before the crowd's passing side tips back?

Short note; the description, tables and limitations are in `../README.md`, every number in `../experiments/results.txt`.

**Question.** In the committed-minority walking model of `society-blocs`, if a bloc of 20% of people who always walk the
robots' side converts to ordinary memory-rule walkers at rate `c` per round, what committed robot share still tips the crowd?

**Method.** Agent simulation, N = 200, memory 9, ε = 0.02, 4000 rounds, 12 seeds per cell, all memories start on the status-quo
side; stubborn people keep memories and convert with probability `c` per round.

**Findings.** The least grid robot share at which at least half the crowds tip is 0.02, 0.05, 0.10, 0.10, 0.15, 0.20 at
`c` = 0, 0.001, 0.003, 0.01, 0.03, 0.1. Tips form within about 40 to 55 rounds, then persist after allies are gone. Holdouts
that never convert make marginal cells worse; holdouts that fade too change little.

**Limitations.** Stylised binary game, swept rather than measured conversion rates, well-mixed meetings. Not evidence about real pedestrians.

**References.** Young (1993), *Econometrica* 61(1):57–84. Centola et al. (2018), *Science* 360(6393):1116–1119. Companions: `society-blocs`, `society-converts`.
