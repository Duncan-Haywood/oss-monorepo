# Pre-registration: a 95% range from the GARCH fit for `--garch` cuts (2026-11-13)

Written and committed before the run it describes. Context: README, "Cuts searched jointly with a GARCH likelihood":
the ranges on `--garch` cuts came from the independent-noise meanvar cost, and the output warned they are "too narrow"
with clustered volatility. That claim was never measured.

**Method** (`garchCost` in `engine.mjs`). The same profile-likelihood range as every other model (`changeIntervals`:
positions between the neighbouring cuts weighted by exp(-cost / 2), the smallest set holding 95%), with the cost twice the
negative GARCH segment log-likelihood at the fitted shared (a, b). Used only when the search reads the noise as clustered.
There is no free parameter, so nothing is tuned. A 10-series smoke run at n = 200 (seed shift 0) was looked at while
writing the script: 4 and 8 kept series, coverage 75% / 75% and 100% / 88%; it decides nothing.

**Run.** `node eval/meanvar-garch-range.mjs 400 4000003 200,400` (fresh seeds, 400 series per cell; GARCH(1,1) noise
omega 0.1, a 0.2, b 0.7; one change at n / 2: sd 1 to 2, or mean +1.5). Scored among series where `--garch` reads the
noise as clustered and finds exactly one cut within 15 points of n / 2. Both ranges on the same series.

**Bar** (all at once): the GARCH range holds the planted index in at least 90% of kept series in each of the four cells,
and its coverage is at least the independent-noise range's in each cell.

If it passes, `--garch` ranges come from the GARCH fit and the "too narrow" warning goes. If it fails, the README records
the coverage of both, and the warning is rewritten to say what was measured.
