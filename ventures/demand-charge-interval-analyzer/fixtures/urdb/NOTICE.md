# Where these rates come from

Two utility rates as OpenEI's Utility Rate Database (URDB, https://openei.org/wiki/Utility_Rate_Database)
returns them, copied unchanged from the `urdb_response` fields of two test inputs in NREL's REopt.jl
(https://github.com/NREL/REopt.jl, `test/scenarios/incentives.json` and
`test/scenarios/re_emissions_elec_only.json`), licensed under the Apache License 2.0
(Copyright (c) Alliance for Sustainable Energy, LLC).

- `sce-gs2-tou-b-2015.json`: Southern California Edison, GS-2 TOU option B, single phase
  (URDB label 55fc81d7682bea28da64f9ae, effective 2015-06-01).
- `entergy-arkansas-lps-tou-2018.json`: Entergy Arkansas, Large Power Service, time of use
  (URDB label 5a592c995457a3371c423a7d, effective 2018-01-01).

Both are old versions of these tariffs, kept as test inputs with a real tariff's structure.
They are not today's prices.
