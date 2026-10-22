# Allies placed together on a ring crowd

Short note; details in `../README.md`, every number in `../experiments/results.txt`.

**Question.** How large a block of committed robots can a ring crowd take before the passing-side convention stops tipping?

**Method.** The `society-robotnorms` walking-side rule on a ring (N = 200, M = 9, ε = 0.02, partners within k sites), robots in
evenly spaced blocks of b; 20 seeds, 500 rounds. Block 1 and one block reproduce that project's section E.

**Findings.** At k = 2, ρ = 0.12, blocks of 1 tip every crowd, blocks of 3 or more none; at ρ = 0.20 blocks up to 3 still tip.
The largest tipping block grows with k (2 at k = 1 or 2, 4 at k = 3 or 5, 8 at k = 10).

**Limitations.** Stylised 1D ring; four block sizes per k; no real data. Produced with AI assistance (Claude).
