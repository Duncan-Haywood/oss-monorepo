# PGLib-OPF v23.07 cases

`pglib_opf_*.m` (typical operating conditions) and `pglib_opf_*__api.m` (active power increase,
built so that thermal limits bind) from the IEEE PES Power Grid Library, Optimal Power Flow
benchmarks (Babaeinejadsarookolaee et al. 2019, arXiv:1908.02788), fetched 2026-11-11 from
`https://raw.githubusercontent.com/power-grid-lib/pglib-opf/master/` (`api/` for the API set).
`BASELINE.md` is the library's published PowerModels.jl v0.19.9 + IPOPT objectives, used to
validate the solvers here. Licence: Creative Commons Attribution 4.0 (`LICENSE`, copied from the
library); the individual case headers name their original sources.

The 500 to 2,000-bus cases (case500_goc, case588_sdet, case793_goc, case1354_pegase, case1803_snem,
case1888_rte, case1951_rte, case2000_goc; TYP, `api/` and `sad/`) were fetched 2026-11-13 from the same
location for milestone 6 of `research/grid-linopf` (the second held-out set); none of them was used
by any earlier step.

The 2,001 to 2,999-bus cases (case2312_goc, case2383wp_k, case2736sp_k, case2737sop_k, case2742_goc,
case2746wop_k, case2746wp_k, case2848_rte, case2853_sdet, case2868_rte, case2869_pegase; TYP, `api/` and `sad/`)
were fetched 2026-11-20 from the same location for the confirmation split of `research/grid-linopf`
(`experiments/run_confirm.py`); none of them was used by any earlier step.
