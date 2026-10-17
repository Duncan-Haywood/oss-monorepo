# Beams that sit closer than an occluder diameter share occluders: the exact blind probability of a lidar behind a Poisson occluder field, and where an independent-beam twin fails

## Question
A lidar simulator that models partial occlusion (foliage, crowds, rubble) often drops each beam independently with the single-beam occlusion probability. That matches the mean number of returns. Does it match the probability that the sensor is blind, which is what a planner that needs at least one return cares about, and how many beams does the twin think it needs?

## Model
Opaque occluders of radius `ρ` have centres forming a Poisson process; projected on the lateral axis its intensity is `μ` per unit length (beams long compared with `ρ`, end effects ignored). A beam at lateral position `y` is blocked iff a centre lies in `(y−ρ, y+ρ)`. Because the centres in disjoint intervals are independent, for any beam set `S`
`P(all of S clear) = exp(−μ·|∪_{k∈S}(y_k−ρ, y_k+ρ)|)`.
One beam: `p = e^{−2ρμ}`. Two beams at spacing `s`: `exp(−μ(2ρ+min(s,2ρ)))`, equal to `p²` iff `s ≥ 2ρ`. The blind probability follows by inclusion–exclusion, `P(blind) = Σ_{S}(−1)^{|S|} P(S clear)`. The independent-beam twin says `(1−p)^K`. Parameters: `ρ = 0.5 m`, `p = 0.5`, eight beams unless stated; `K ≤ 16` for the exact sum.

Two facts follow. (i) The twin is exact if and only if the spacing is at least the occluder diameter (beams then see disjoint strips, so are independent). (ii) For any closer spacing the clear indicators are positively associated, so the mean count is unchanged but its variance and `P(blind)` rise; at `s = 0` the beams coincide and `P(blind) = 1−p`.

## Results
(all numbers from `experiments/results.txt`)
1. **Pairs.** Both-blocked probability is 0.500 (`s = 0`), 0.466 (0.1 m), 0.420 (0.25), 0.354 (0.5), 0.297 (0.75) and exactly the twin's 0.250 from `s = 1 m` on.
2. **Eight beams.** Blind probability exact vs twin (0.0039): 0.381 at 5 cm (97×), 0.266 at 10 cm (68×), 0.0815 at 25 cm (20.9×), 0.0201 at 50 cm (5.2×), 0.0102 at 75 cm (2.6×), 0.0039 at 1 m and 2 m. Variance of the number of clear beams is 13.3, 10.9, 6.10, 3.45, 2.66, 2.00 against 2.00 for the twin; the mean is 4.0 for both.
3. **Beams needed.** For blind probability ≤ 0.01 the twin (and any spacing ≥ 1 m) needs 7 beams; the exact model needs 9 at 75 cm, 10 at 50 cm, 16 at 25 cm and more than 16 at 10 cm. For ≤ 0.001: 10 beams at ≥ 1 m, 13 at 75 cm, 15 at 50 cm, more than 16 at 25 cm.
4. **Ensemble twin.** Sampling occluder fields (200,000) gives blind probability 0.08150 ± 0.00061 for eight beams at 25 cm, against the exact 0.08145 and the independent twin's 0.00391.
5. **Occluder size at fixed visibility.** With `p = 0.5` and eight beams at 25 cm, the twin is exact for `ρ = 0.05` and `0.125 m` and the exact blind probability is 0.0201, 0.0815, 0.2095 for `ρ = 0.25, 0.5, 1.0 m` (5.2×, 20.9×, 53.6× the twin).

## Limitations
Stylised, no lidar data. One-dimensional lateral projection with end effects ignored (a ray segment also meets occluders whose centres lie within `ρ` of its ends), a single occluder radius, opaque binary occluders (no foliage transmission, no partial hits, no beam divergence), Poisson placement with no clustering (clustered occluders would raise the shared-occlusion effect further or reduce it depending on scale), parallel rather than fanned beams, static scene. The exact sum is exponential in the beam count and is used only for `K ≤ 16`.

## Next steps
Fanned-beam geometry and time-varying fields (occluders moving between scans); fitting `ρ` and `μ` from pairs of logged adjacent-beam returns, which identify them since pair statistics depend on `s`; combining with extinction along a beam (`fog-twin`) and dropout (`dropout-twin`); scoring blind-probability forecasts (`twin-elicitation`).

## References
- Stoyan, D., Kendall, W. S. & Mecke, J. (1995). *Stochastic Geometry and its Applications*, 2nd ed. Wiley.
- Hall, P. (1988). *Introduction to the Theory of Coverage Processes*. Wiley.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
