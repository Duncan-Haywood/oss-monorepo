# Allies as patches on a 2D grid crowd

Short note; details in `../README.md`, every number in `../experiments/results.txt`.

**Question.** Does the ring result that clustered committed robots stop tipping a crowd's passing side once a block is wider than the neighbourhood carry over to a 2D grid?

**Method.** The `society-allies` rule on a 16 × 16 torus (M = 9, ε = 0.02, partners within Chebyshev radius k), robots in square patches; 20 seeds, 500 rounds. Spread robots at k = 7 bracket the well-mixed mean-field threshold 0.2165.

**Findings.** At robot share 0.25, patches up to about 2k + 1 sites wide tip every crowd; wider patches tip few or none, and one 8 × 8 patch tips none at any k up to 5. The sweep confounds patch size with patch count.

**Limitations.** Stylised square torus; no real data. Produced with AI assistance (Claude).
