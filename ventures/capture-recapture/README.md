# Capture-recapture: how many are there, counting the ones you never saw?

**You caught some, marked them, caught again, and some were already marked:
how big is the population?** Paste capture histories (one row per animal, a
0/1 per occasion), two-sample counts, or capture frequencies, and get the
population size by Lincoln-Petersen and Chapman, the closed-population
models M0, Mt and Mb by maximum likelihood with profile-likelihood intervals
and AIC weights, Chao's estimator for animals that differ in catchability,
and the jackknife. In the browser, from the command line, or from an agent.
The same arithmetic estimates defects missed by several reviewers, or cases
missing from several registries (multiple-list estimation).

**Live:** <https://marisstella.app/capture-recapture/>

Who it is for: field biologists and wildlife students running a mark-recapture
survey; ecology and statistics instructors; software teams estimating how many
defects their reviewers have not found; epidemiologists with overlapping case
lists. Free, FSL-1.1-MIT licensed, nothing uploaded.

## What it computes

| Piece | Source | What you get |
| --- | --- | --- |
| Lincoln-Petersen, Chapman | Seber 1982; Chapman 1951 | two-sample estimates, Seber's variance for Chapman, normal interval |
| M0, Mt, Mb | Otis et al. 1978; Darroch 1958 | maximum-likelihood N (the best whole number), profile-likelihood interval, curvature SE, capture probabilities, AIC and Akaike weights |
| Chao Mh | Chao 1987 | r + f1²/(2 f2), its variance and the log-transformed interval; the bias-corrected r + f1(f1−1)/(2(f2+1)) as a point estimate |
| Jackknife | Burnham & Overton 1978 | orders 1 and 2, point estimates |
| Groups | — | one closed-population estimate per value of a group column (a year, a site), and a chart of them all |

## The example: chorus frogs at Lily Pond, 1986 to 2014

The USGS released 29 breeding seasons of capture histories of boreal chorus
frogs at Lily Pond, Colorado (Muths 2020; `data/SOURCE.md`), three to five
survey days a season. Treating each season as a closed population
(`node cli.mjs data/lily-pond-chorus-frogs.csv --group year`):

- **2010**, the best-recaptured season (57 of 270 frogs caught more than
  once): Mt, best by AIC, gives **539, 95% interval 455 to 656**, about two
  frogs for every one seen. Chao gives 706 (565 to 914).
- **1999**: 120 frogs, catches falling 68, 39, 23. **Mb wins AIC with 95% of
  the weight and says 135; Mt says 493.** Mb reads falling catches as most
  frogs already being marked, Mt as falling activity; only effort records can
  settle it.
- **2007**: one recapture among 88 frogs; Mt's interval is 474 to about
  33,300. The tool says the data cannot pin it down.

These are per-season closed-population readings of a dataset whose authors
fitted open-population models across years; they are not a reanalysis of that
study's conclusions.

## Use it from code

```sh
node cli.mjs data/lily-pond-chorus-frogs.csv --group year
node cli.mjs --n1 60 --n2 55 --m 22                    # two samples
node cli.mjs --frequencies 43,16,8,6,0,2,1 --k 18       # capture frequencies
node cli.mjs histories.csv --history ch --freq n --json
```

Agents: `node platform/agents/tools.mjs describe capture-recapture` prints the
papers; `node platform/agents/tools.mjs call capture-recapture analyze --input '{"n1":60,"n2":55,"m":22}'`
(or `{"histories":["101","011","100"]}`, `{"text":"id,o1,o2\n..."}`,
`{"frequencies":[43,16,8],"k":18}`).

## Verification

- **Independent reference** (`eval/reference.py`, numpy 2.5.3, scipy 1.18.1):
  the engine profiles the capture probabilities out in closed form from the
  sufficient statistics; the reference instead enumerates all 2^k histories,
  builds each cell probability from the model, and maximises the full
  multinomial numerically with `scipy.optimize.minimize` for each N, its
  likelihood checked against `scipy.stats.multinomial.logpmf`. On six
  simulated studies (M0, Mt, Mb, heterogeneous and two-sample), every model's
  whole-number MLE agrees exactly, the log-likelihood to 1e-7 and the profile
  limits to 1e-6; one Mb fit with no finite estimate agrees too
  (`reference.test.mjs`).
- **Published example:** Chao (1987, section 3.1) analysed the capture
  frequencies of 135 penned cottontail rabbits. The engine reproduces her
  N = 134 and normal interval (87, 181); her log-transformed interval is
  printed as (103, 202) and the engine gives 102.4 to 202.4, a gap of under one
  animal at the lower end whose cause we have not traced (rounding of the
  printed inputs is one possibility). M0 gives 96, the Schnabel-type value the
  paper quotes.
- **Hand-worked checks** in `engine.test.mjs`: Lincoln-Petersen, Chapman and
  Seber's variance for 60, 55 and 22; the sufficient statistics of a small
  table; Chao and jackknife formulas; everyone caught every time gives N = r;
  no recaptures gives no finite M0 or Mt.
- **Coverage simulation** (`eval/coverage.mjs`, output in
  `eval/coverage-output.txt`, 1,000 studies per scenario): when the data come
  from a model, that model's 95% interval covers the true N 94.5% to 95.5% of
  the time. Under heterogeneity (p ~ Beta(2, 6)) M0, Mt and the AIC-chosen
  model cover 2.4% to 13.4% and underestimate by about 19%; Chao covers 85.5%
  and underestimates by 7.6%. Under no heterogeneity Chao overestimates
  (median +13.9% with four occasions, +64% with two), and Mb fitted to Mt data
  is wild (19.6% with no finite estimate). Those are properties of the
  estimators, and the page says so.
- **Property tests:** reversing the occasions leaves M0, Mt and Chao
  unchanged; a frequency column equals repeated rows; groups equal separate
  runs; the page's quoted numbers are pinned to the engine.

The whole-number MLE can differ by a few animals from programs that maximise
over continuous N or solve Darroch's closed-form equation (for 60, 55 and 22,
Mt gives 148 here and 150 by Darroch's equation, which equals
Lincoln-Petersen).

## Limits

A closed population only: no births, deaths or movement between occasions.
Marks are assumed kept and read correctly, animals caught independently. No
heterogeneity likelihood models (Mh mixtures, Mth, Mbh), no covariates
(Huggins), no open-population models (CJS, Jolly-Seber, robust design), no
spatial capture-recapture.

## No warranty

Provided free and as-is, without warranty of any kind. A statistical estimate
from the captures you enter, not wildlife-management, regulatory,
epidemiological, legal or other professional advice. Not affiliated with the
authors of the cited papers or the U.S. Geological Survey. FSL-1.1-MIT licence.

AI-assisted: written with an AI coding agent; the method follows the cited
papers and the numbers are reproducible from the files above.
