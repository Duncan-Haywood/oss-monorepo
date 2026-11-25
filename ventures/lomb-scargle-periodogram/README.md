# Lomb-Scargle periodogram: find the periods in unevenly sampled data

**Which periods are in these measurements, taken at uneven times?** Paste a
time column and a value column (optionally errors, and an instrument or site
column) and the tool runs the **generalised Lomb-Scargle periodogram**
(Zechmeister & Kürster 2009), error-weighted and with one offset per
instrument, then:

- lists the strongest periods with amplitude, power and a **false alarm
  probability** from Baluev's (2008) analytic bound;
- **pre-whitens**: removes each period found and searches again, until the
  next peak's false alarm probability passes a threshold (1% by default);
- computes the **spectral window** (the periodogram of the sampling times
  alone) and, for each period, the power at its **aliases** f ± f_window, and
  flags a period as ambiguous when an alias carries over 80% of its power;
- gives each period's 1σ uncertainty (Montgomery & O'Donoghue 1999), a
  phase-folded plot with the other periods removed, and the periodogram as CSV.

Live page: https://marisstella.app/lomb-scargle-periodogram/ (runs in the
browser; nothing is uploaded).

```
node cli.mjs data/hd164922-rv.csv --jitter 2.6 --signals 6
node cli.mjs readings.csv --time date --value level --min-period 0.5
node cli.mjs series.csv --csv > periodogram.csv
```

Agents: `node platform/agents/tools.mjs describe lomb-scargle-periodogram`
prints the papers; `call lomb-scargle-periodogram analyze --input '{"csv": "..."}'`
runs it (or pass `t`, `y`, and optionally `e` and `g` arrays).

## How it works

At each trial frequency f the model `y = a cos(2πft) + b sin(2πft) + c_g` is
fitted by weighted least squares (weights 1/σ², σ² = error² + jitter²), with
one offset c_g per group. The power is the share of chi-square the sinusoid
removes beyond the offsets alone, `p = (χ²₀ − χ²(f)) / χ²₀`. With one group
this is exactly Zechmeister & Kürster's equations 5 and 10-20; for several
groups the cosine, sine and data are centred within each group before the
sums are formed, which is the same fit with the offsets profiled out.

The grid runs from 1/(longest period) to 1/(shortest period) in steps of
1/(5T) (VanderPlas 2018, §7.1), each peak refined on a finer grid and a
parabola. The cosines and sines advance by rotation from one frequency to
the next and are recomputed exactly every 256 steps (a test checks the grid
against direct evaluation to 1e-10). Default shortest period: twice the
median gap between samples, which VanderPlas warns is a convenience, not a
Nyquist limit; the page says so whenever the default is used.

Baluev's bound for the highest peak up to f_max, in the standard
normalisation: `FAP = 1 − (1 − P₁) e^(−τ)`, `P₁ = (1 − z)^(N_K/2)`,
`τ = γ(N_H) W (1 − z)^((N_K−1)/2) √(N_H z / 2)`, `W = f_max √(4π Var t)`,
`γ(N) = √(2/N) Γ(N/2)/Γ((N−1)/2)`. Degrees of freedom count the G offsets,
`N_H = N − G`, `N_K = N − G − 2` (Baluev's single floating mean is G = 1).
Very small values are carried as log10 so they print as `1e-89` rather than 0.

## Example: HD 164922's four planets in 401 velocities

The example is 401 radial velocities of the star HD 164922 from Keck/HIRES
and the Automated Planet Finder, 1996 to 2015, published by Fulton et al.
(2016) and shipped in the radvel package (MIT; `data/SOURCE.md`). With the
jitter radvel's example fit starts from (2.6 m/s):

| # | Period found (days) | ± 1σ | Amplitude (m/s) | FAP | Planet, published period |
| --- | --- | --- | --- | --- | --- |
| 1 | 1,196.96 | 3.6 | 7.26 | 1e-89 | b, about 1,200 (radvel example starts at 1206.3) |
| 2 | 75.7517 | 0.049 | 1.93 | 1e-13 | c, 75.77 (Fulton et al. 2016) |
| 3 | 12.4667 | 0.0016 | 1.48 | 1e-7 | d, 12.46 (Benatti et al. 2020) |
| 4 | 41.7457 | 0.019 | 1.37 | 1e-7 | e, 41.76 (Rosenthal et al. 2021) |
| 5 | 4.71122 | 0.00031 | 1.02 | 0.58% | none listed |

What this does and does not show:

- **Planets d and e were announced after these data were published**, by
  papers with more data (HARPS-N for d; the California Legacy Survey's full
  Keck/APF set for e). That the same 401 points already carry peaks at both
  periods, at false alarm probabilities near 1e-7, is a check made knowing
  the answer, not a discovery. It does say the tool's pre-whitening would
  have pointed at both.
- **The fifth peak is not a planet anyone has reported.** It changes with the
  settings: without jitter the fifth peak is 60.86 days instead, and the
  tool flags it as ambiguous (its 45.65-day alias carries 90% of its power).
  At FAP 0.3-0.6% under a white-noise model that this star's activity is
  known to break, it is the kind of peak the page's limits section is about.
- **Period 1 is 0.8% short of radvel's starting value.** A sinusoid is the
  wrong shape for an orbit with any eccentricity, and the 19-year span holds
  under six cycles; the 1σ of 3.6 days is the white-noise formula's and is
  optimistic. A Keplerian fit (radvel itself) is the right next step.
- The instrument offsets matter little for this file: run with `--group ""`
  the same four periods come out within 0.3%. They matter when instruments
  differ by more than the signal.

## Verification

`node --test *.test.mjs` (about a second). The checks that pin the maths:

- **astropy 6.1.4** (`eval/reference.py` writes `eval/reference.json`; numpy
  2.1.3, scipy 1.14.1; astropy is BSD-3-Clause and was used only to produce
  the numbers): on the 276 post-upgrade Keck points, power matches
  `LombScargle(fit_mean=True, center_data=True)` to 1e-9 at eight
  frequencies with and without errors, and on 60 synthetic points at 25
  frequencies; the Baluev false alarm probability matches astropy's
  `method="baluev"` to 1e-8 relative at five powers (astropy snaps
  `maximum_frequency` onto its grid first, 0.5000012 for 0.5, and the
  fixture records the snapped value); the best period agrees with astropy's
  `autopower` grid to within one grid step.
- With three groups and per-point errors, power equals the chi-square
  reduction of a brute-force least-squares fit (sinusoid plus three offsets,
  Gaussian elimination) to 1e-10.
- Power is unchanged by shifting times by 2,450,000, scaling values by 7,
  or adding 100 to one group.
- Two sinusoids (123 and 9.7 days, amplitudes 6 and 2) in gappy, seasonal
  sampling with a 30-unit offset between two groups: both periods within 3σ,
  amplitudes within 0.4, the offset within 0.5.
- Pure noise: the first peak's FAP is above 5% and the search stops.
- Nightly sampling: the spectral window is above 0.9 at one day, and a
  0.8-day signal is flagged ambiguous with its 4-day alias.
- HD 164922: the four published periods above, within 1.2% (b) and 0.2%
  (c, d, e).
- `page.test.mjs`: disclaimer, privacy line, labels on every input, no
  network calls in any module, JSON-LD and FAQ shown on the page, BibTeX.

## Files

| File | What |
| --- | --- |
| `engine.mjs` | the periodogram, the bound, pre-whitening, the window, CSV and report output; no imports, no DOM |
| `index.html` | the page: inputs, periodogram, table of periods, folded plot, data plot |
| `cli.mjs` | the command line (`--help`) |
| `example-data.mjs` | the example CSV, embedded so the static page can load it |
| `data/` | the example, its unmodified source file, and `SOURCE.md` (licence, citation) |
| `eval/` | the astropy reference script and its output |
| `usage.mjs` | anonymous local feature counts (off under Do Not Track, with an opt-out) |

## Limits

A low false alarm probability says white noise of the stated size rarely
makes such a peak; it says nothing about cause, and correlated noise or
underestimated errors make it optimistic. Sinusoids only (an eccentric orbit
or an eclipse spreads power into harmonics). Pre-whitening is greedy, one
period at a time with earlier ones held fixed. Not modelled: Keplerian
orbits, multi-band or multi-term periodograms, bootstrap or Bayesian
significance, correlated-noise models.

## Credits and licence

Implemented from the papers' mathematics (`PAPERS` in `engine.mjs`): Lomb
1976, Scargle 1982, Zechmeister & Kürster 2009, Baluev 2008, VanderPlas
2018, Montgomery & O'Donoghue 1999. No third-party code was ported. Example
data: Fulton et al. 2016 via radvel (MIT, notice in `data/SOURCE.md`).
Code: FSL-1.1-MIT (`LICENSE`).

**No warranty.** Statistical output from data you supply; not legal, tax,
financial, medical or professional advice. Not affiliated with the authors
of the cited papers, their institutions, the observatories, or the radvel
and astropy projects.
