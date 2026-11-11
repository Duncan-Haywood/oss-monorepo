# PGLib-OPF v23.07 cases

`pglib_opf_*.m` (typical operating conditions) and `pglib_opf_*__api.m` (active power increase,
built so that thermal limits bind) from the IEEE PES Power Grid Library, Optimal Power Flow
benchmarks (Babaeinejadsarookolaee et al. 2019, arXiv:1908.02788), fetched 2026-11-11 from
`https://raw.githubusercontent.com/power-grid-lib/pglib-opf/master/` (`api/` for the API set).
`BASELINE.md` is the library's published PowerModels.jl v0.19.9 + IPOPT objectives, used to
validate the solvers here. Licence: Creative Commons Attribution 4.0 (`LICENSE`, copied from the
library); the individual case headers name their original sources.
