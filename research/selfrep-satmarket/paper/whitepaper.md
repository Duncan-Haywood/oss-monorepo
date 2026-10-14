# When the goods market saturates: a dynamic-programming check of a replicating shop's reinvestment policy

*Produced with AI assistance (Claude). Stylised simulation study; every input is assumed.*

**Question.** In `selfrep-reinvest`, a printer shop with linear revenue should copy flat out and then switch to goods in one step, about one e-folding time before the horizon. Does that survive a goods market with diminishing returns?

**Setup.** See `README.md`: fluid fleet `n' = k u n`, revenue `R(g) = a c (1 - exp(-g/c))`, horizon 600 h, exact backward dynamic programming (Bellman, 1957) on a log-spaced fleet grid, compared with bang-bang, constant, logistic and piecewise policies at the same Euler step.

**Findings** (numbers in `experiments/results.txt`). With market capacity `c` large relative to the fleet the optimum is bang-bang. As `c` falls below about 10^4 machine-hours per hour (fleet without switching: 163 000 units) the optimal copy share ramps down over 90 to 300 h and bang-bang loses 4.5 to 7% of the optimum; the best logistic ramp recovers all but about 1 to 1.5%. Higher failure rates slow growth and sharpen the switch again.

**Limits.** The saturation form is a convenient assumption, not a market measurement; cash never binds; DP error is a few tenths of a percent at best and several percent in near-linear cases; no analytic treatment of the singular arc.

**References.** Bellman (1957); Jones et al. (2011); von Neumann (1966); Freitas and Merkle (2004); see `paper/refs.bib`.
