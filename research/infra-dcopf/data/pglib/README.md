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
