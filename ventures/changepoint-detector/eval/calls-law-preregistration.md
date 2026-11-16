# The clumping-law check on real call-centre counts: pre-registration (2026-11-16)

Written before `clumpingLaw`, `nb1Dispersion` or `analyze` was run on this series. Before writing it the data were
read only for shape: 164 weekdays (2003-03-03 to 2003-10-24) of 169 five-minute counts each, 11 to 465 calls a slot.

## Why

The NB1 section of the README ends: "Not checked: a real count series known to clump in proportion to its level
(call centre arrivals in batches, insurance claims per event)". Every law-check number so far is on simulated NB1
and NB2 ramps. This asks whether `clumpingLaw`, reading one series alone, names the law a real series follows, where
"the law it follows" is read from evidence the check never sees.

## Data

`data/bank-calls-5min.csv`: `fpp2::calls`, "five-minute call volume handled on weekdays between 7:00am and 9:05pm,
beginning 3 March 2003 for 164 days" at a large North American bank (Rob Hyndman; via the Rdatasets mirror).
Retrieved 2026-11-16. One row per day. Within a day the level runs from tens of calls a slot (early, late) to a few
hundred (late morning), so the level span the law check needs (3 times) is there on each day.

## The reference law (what the check is scored against)

Read across days, which the check never does. Expected count `E_sd = a_(s,w) * b_d`: slot s, weekday w (Monday to
Friday each get their own daily profile), day d; fitted by alternating the two multiplicative margins to convergence
(Poisson maximum likelihood for the two-way table). The dispersion ratio of a cell is `z = (y - E)^2 / E`.
Cells are cut into ten deciles of E. Under NB1, mean z is flat in E (about phi); under NB2 it rises as 1 + E / r.

- Reference `nb2` if mean z in the top decile is at least 1.5 times that in the bottom decile, and the least-squares
  slope of z on E over all cells has a 95% interval (a day-block bootstrap, 1000 resamples of the 164 days, seed 1)
  above 0.
- Reference `nb1` if the top-to-bottom ratio is between 0.8 and 1.25 and the bottom-decile mean z is above 1.2.
- Otherwise `unclear`.

Known weakness, stated in advance: a daily profile that differs from the fitted one (a busy Monday morning, a
mailing, a system outage) leaves residuals proportional to E, so its squared residuals grow as E^2 and look NB2. The
weekday-specific profile removes part of that, not all. The within-day differences the check reads see the same
thing (a burst inside a day), so the two readings share this confound; the reference is "what clumping the series
shows at five minutes", not "what the callers do".

## The check under test

For each of the 164 days separately, `clumpingLaw(x)` on its 169 raw counts (no exposures, as the shipped check runs:
it reads the raw counts). Also recorded, no bars: `nb1Dispersion` and `negbinSize` per day, and on the first five
whole weeks (845 counts, `--period 169`) the number of changes `analyze` reports with `--model poisson` under
`--overdispersion nb` and `nb1`, plus the `clumping` field each run returns.

## Bars

- **L1 (agreement).** If the reference is `nb2`: the check says `nb2` on at least 60% of days (99 of 164) and `nb1`
  on at most 10% (16). If the reference is `nb1`: the same with the laws swapped.
- **L2 (no wrong advice).** The opposite-law answer is the one that would trigger a wrong `clumpingWarning`; L1's
  10% line is that bar.
- If the reference is `unclear`, L1 and L2 have no bar: the run is reported as a description and nothing is claimed
  about the check's accuracy.

What happens on each outcome, decided now: if L1 holds, the README says the check agreed with the across-day law on
this one real series (one series, not a calibration). If it fails, the README says so, the check stays as it is (one
series is not enough to retune it), and the failure is named as the open item. No threshold in `clumpingLaw` is
changed in this run either way.

Run once: `node eval/calls-law.mjs > eval/calls-law.out.txt`.
