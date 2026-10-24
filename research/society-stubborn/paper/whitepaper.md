# Stubborn walkers raise the robot share needed to tip a crowd's passing side

Short note; the full description, tables and limitations are in `../README.md`, every number in
`../experiments/results.txt`.

**Question.** In the committed-minority walking-convention model of `society-robotnorms`, how does
a share `s` of people who never adapt (always walk right) move the robot share that tips the rest?

**Method.** Exact mean-field map `F(x) = P(Bin(M,q) ≥ (M+1)/2)` with
`q = ρ + (1−ρ)[(1−s)(x(1−ε)+ε/2) + sε/2]`; tipping share = least `ρ` whose basin from `x = 0` passes
1/2 (bisection). Agent simulation, N = 200, 500 rounds, 12 seeds per cell, ε = 0.02.

**Findings.** At `M = 9` mean-field `ρ_c` is 0.217, 0.240, 0.283, 0.329 at `s` = 0, 0.2, 0.4, 0.5;
memory 5 and 9 coincide at `s ≥ 0.4`. Simulation (grid step 0.02) agrees within 0.02 at every `s` under the "majority past 1/2" criterion. Stubborn people leave the cost of committed robots (conflicts per human
meeting) near 0.12 at `ρ = 0.10` and 0.23–0.27 at 0.20, and adaptive robots at the 0.020 error floor.

**Limitations.** Stylised binary game, fixed stubborn block, well-mixed meetings, 12 seeds. Not
evidence about real pedestrians.

**References.** Young (1993), *Econometrica* 61(1):57–84. Xie et al. (2011), *Phys. Rev. E* 84:011130.
Centola et al. (2018), *Science* 360(6393):1116–1119. Moussaïd et al. (2009), *Proc. R. Soc. B*
276(1668):2755–2762. Companion: `society-robotnorms`, `society-twinfidelity`.
