# A closed-form smooth switch for a replicating shop with a saturating goods market

*Produced with AI assistance (Claude). Stylised study; every input is assumed.*

**Question.** `selfrep-satmarket` found numerically that a replicating printer shop facing diminishing returns should ramp its copy share down smoothly rather than switch in one step. Can the ramp be written in closed form, and does it match dynamic programming?

**Result.** Pontryagin's maximum principle (Pontryagin et al., 1962; Bryson and Ho, 1975) gives three arcs: copy flat out, then a singular arc on which goods output grows linearly at rate `k c`, then goods only for the last `1/k` hours. The entry time solves one scalar equation. In the Euler model it earns 99.96% to 100.00% of the DP policy's value across market sizes and failure shares, and its `u(t)` agrees with the DP's to within 0.06 at the nine times compared (c = 1000).

**Limits.** Necessary conditions, not a proof of optimality; the concave revenue form is assumed and the result depends on it; open loop; no cash constraint; no terminal fleet value.

**References.** Pontryagin et al. (1962); Bryson and Ho (1975); Bellman (1957); Jones et al. (2011); see `paper/refs.bib`. Details and numbers: `README.md`, `experiments/results.txt`.
