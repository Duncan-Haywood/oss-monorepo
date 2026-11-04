# catholic-demography milestone 4 (2026-11-04)

Landed: `survey.logit` (weighted logit, PSU-clustered sandwich, subpopulation kept in the design)
and `survey.wald`, with two tests; `experiments/m4_retention/`. GSS data: `sh data/download.sh`
takes under a minute through the proxy; use `/usr/bin/python3.13` (has pandas/scipy).
Trap: a `Hispanic` dummy without restricting the domain makes the reference group all
non-Hispanics; check fitted vs cell shares for a saturated model.
Next: milestone 2 (Hout reproduction, Pew subgroup tables) or 5 (needs NCHS/ACS series; probe hosts first).
