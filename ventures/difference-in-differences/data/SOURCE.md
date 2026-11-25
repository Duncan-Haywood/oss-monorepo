# castle.csv

- **What:** the 50 US states, 2000-2010 (550 rows): `homicide` (homicides per
  100,000 people), `l_homicide` (its natural log), `post` (1 from the first
  full year a castle-doctrine law was in force) and `first_treated` (the first
  year with `post` = 1; 0 if none by 2010). States are numbered `state_01` to
  `state_50` from the source's `sid`; the source carries no state names, so
  none are added here.
- **Original study:** Cheng, Cheng and Mark Hoekstra (2013). Does Strengthening
  Self-Defense Law Deter Crime or Escalate Violence? Evidence from Expansions
  to Castle Doctrine. *Journal of Human Resources* 48(3), 821-854.
  https://doi.org/10.3368/jhr.48.3.821. Homicide counts come from the FBI
  Uniform Crime Reports.
- **Retrieved from:** the `castle` dataset (`castle.dta`) in the `causaldata`
  Python package, version 0.1.5, by Nick Huntington-Klein, FSL-1.1-MIT licence,
  downloaded from PyPI on 2026-11-17 (`causaldata-0.1.5.tar.gz`, SHA-256
  5604fb84000c6a8ae3e93630b3624e9f2af4f8700e4465ec3586998b3522fd1c). The
  package's metadata names the Federal Bureau of Investigation as the source of
  the crime data and says the data are used in the difference-in-differences
  chapter of Cunningham's *Causal Inference: The Mixtape*.
- **Licence:** the package is FSL-1.1-MIT licensed; the underlying crime statistics are
  a work of the US federal government.
- **Processing:** kept the six columns above; derived `first_treated` from
  `post` (checked to switch on once and stay on in every state); rounded
  `homicide` to 6 and `l_homicide` to 8 decimals. Result: 21 treated states
  (first full year 2006: 1, 2007: 13, 2008: 4, 2009: 2, 2010: 1) and 29 never
  treated. SHA-256 of `castle.csv`:
  a89f44af55242ae17c42ffa861b9680955bbdd0aacb46e099dd630b7df74fd3e.
- **Not a replication.** The paper's estimates use population weights,
  region-by-year effects and covariates; this example uses none of them.
