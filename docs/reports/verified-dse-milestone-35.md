# verified-dse milestone 35 (agent note)

`experiments/theory/disjoint_check.py` (about 100 s, no flow) tests the `QUANTILE.md` claim for disjoint pilot pairs. General statement false (counterexamples N <= 7); no violation at the claim's threshold (hill-climb N <= 12; clique and hub at N = 50); rigorous version is independent pairs with repeats allowed. Open: re-measure coverage with that scheme (edit `bound.pilot_quantile` sampling in `src/verified_dse`), then the regret-side theorem. OpenROAD still absent here, so more designs remain blocked.
