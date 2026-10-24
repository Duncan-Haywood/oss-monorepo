# Allies on the robots' side cut the robot share needed to tip a crowd's passing side

Short note; the full description, tables and limitations are in `../README.md`, every number in
`../experiments/results.txt`.

**Question.** In the committed-minority walking-convention model of `society-robotnorms` and
`society-stubborn`, how do shares `sl` of people who always walk the robots' side and `sr` who always walk the
status-quo side move the robot share that tips the rest?

**Method.** Exact mean-field map `F(x) = P(Bin(M,q) ≥ (M+1)/2)` with
`q = ρ + (1−ρ)[(1−sl−sr)(x(1−ε)+ε/2) + sl(1−ε/2) + sr ε/2]`; tipping share = least `ρ` whose basin from `x = 0`
passes 1/2 (bisection). Agent simulation, N = 200, 500 rounds, 12 seeds per cell, ε = 0.02.

**Findings.** At `M = 9`, `sr = 0`, mean-field `ρ_c` is 0.217, 0.176, 0.131, 0.080, 0.023 at `sl` = 0, 0.05, 0.10,
0.15, 0.20 and 0 at 0.25: about 0.8 robots saved per ally at small `sl`. Opposing blocs raise the self-tipping `sl`
(0.219, 0.233, 0.254, 0.300 at `sr` = 0, 0.1, 0.2, 0.3). Simulation agrees with mean field within 0.01 at seven bloc
mixes. Equal blocs are a knife edge. Opposing blocs alone give 0.195 conflicts per human meeting at `sl = sr = 0.10`.

**Limitations.** Stylised binary game, fixed blocs, well-mixed meetings, 12 seeds. Not evidence about real pedestrians.

**References.** Young (1993), *Econometrica* 61(1):57–84. Xie et al. (2011), *Phys. Rev. E* 84:011130.
Centola et al. (2018), *Science* 360(6393):1116–1119. Companion: `society-robotnorms`, `society-stubborn`.
