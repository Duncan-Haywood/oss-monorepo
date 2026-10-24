# capture-syncfilter: does a robust fit or a Kalman filter hold a camera's clock better between audio re-syncs than a least-squares line?

Track 13 (autonomous multi-angle capture), the first "next step" of `capture-syncslope`. **Headline:** when the clock rate comes from a sourced crystal temperature curve instead of an assumed wobble, it moves only 15 to 20 ppm in 6 h, the plain offset hold keeps two cameras within a 40 ms tolerance 98 to 100% of a 6 h shoot at one audio re-sync per 300 to 1800 s, and a fitted line only pays at 3600 s (37 to 43% of the shoot out of tolerance down to 9%). A least-squares line, a Theil-Sen (robust) line and a Kalman filter with a rate state give the same numbers on those scenarios. They separate only on `capture-syncslope`'s assumed 30 ppm wobble: a Kalman filter tuned to fast rate wander keeps re-syncs at 900 s to 0.9% out of tolerance where the other fits give 27% and the offset hold 13%, and at 1800 s every hold fails (19 to 58%). The gate that decides which estimates to believe matters more than the fit. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/capture-syncfilter/

**Builds on.** `capture-syncslope` (the question, the window cut with the correction in force, the strict 5 ms line gate and reset rule), `capture-syncbudget` (the 40 ms stand-in tolerance from EBU R37 (2007) and the offset hold) and `capture-audiosync` (GCC-PHAT and the synthetic audio, imported from its `src/`). Crystal curve: Corning Frequency Control / Tele Quarz, *Worldwide Data Book* (2001), "Technical Introduction: Crystals", section on AT-cut temperature characteristics (<https://oliverbetz.de/cms/files/Artikel/Quarzoszillator/technicalintro_crystals_e.pdf>). No CU Boulder group in `prompt.md` covers this and none is claimed.

## What is and is not real
Audio is synthetic (`capture-audiosync`), independent noise per camera, exact fractional delay. No real recording was used.

| input | value | status |
|---|---|---|
| Crystal curve | `a1 (T-Tinv) + a3 (T-Tinv)^3`, a3 = 1.05e-4 ppm/K^3, a1 = -0.085 ppm/K per arcmin of cut-angle error | sourced (Corning/Tele Quarz 2001; the sheet says a3 is good to +-20% for a correctly designed resonator) |
| Turnover (inflection) temperature | 25 C (camera A), 35 C (camera B) | the sheet gives 25 to 35 C; which camera gets which is my choice |
| Cut-angle error | +5 and -5 arcmin | assumed, a plausible-looking worst pair, not sourced |
| Camera temperatures | A warms 25 K with a 900 s time constant after power-on (+10 K of sun in `sunday`); B at ambient; ambient 20 C, or 15 C rising 10 K over 6 h with a 3 K hourly gust (`sunday`) | assumed |
| Initial rate offset | 20 ppm | assumed (a crystal's calibration tolerance), the same order as `capture-syncbudget`'s 40 |
| `static`, `wobble10`, `wobble30` | 40 ppm, plus 0, 10 or 30 ppm sinusoid of 3600 s period | assumed, as in `capture-syncslope`; kept to answer its open question |
| Tolerance, windows, gate margin, 6 h shoot, 0.8 s start offset | 40 ms, 2 s (first 10 s), 5 ms, 6 h, 0.8 s | choices carried over |

The cameras' audio clock is assumed to be an AT-cut crystal. A 32 kHz tuning-fork crystal has a parabolic curve (not covered by the sheet section read here) and would drift differently. Real boards add ageing (the sheet quotes under 2 ppm per year for metal-can crystals, negligible over 6 h), load-capacitance pulling and activity dips, none modelled.

## Method (`src/capture_syncfilter/filt.py`)
Every `every_s` seconds a 2 s window (10 s for the first, trusted) is cut with the correction in force and GCC-PHAT estimates the residual. Each hold decides whether to accept the estimate and then extrapolates a line (value, rate) until the next one. After two rejections in a row the next estimate is trusted and the model restarts.
- **offset:** last accepted estimate; gate 100 ppm x elapsed + 5 ms.
- **slope_strict:** least-squares line through the last 8; gate 5 ms from the line (`capture-syncslope`'s slope_reset).
- **slope_wide:** the same line, gate 5 ms + 30 ppm x elapsed, i.e. the rate may differ from the fit by 30 ppm. This isolates the gate from the fit.
- **theilsen_wide:** Theil-Sen (median of pairwise slopes, median intercept) with the wide gate.
- **kalman:** state [delay, rate]; measurement sd 1 ms; rate a random walk of 5 ppm per sqrt(hour) (1 sigma); gate 4 sigma of the innovation + 5 ms. `kalman_q1` and `kalman_q20` use 1 and 20 ppm per sqrt(hour). The 1 ms sd is a guess; nothing here measures GCC-PHAT's error at -12 dB.
- Score: share of the shoot (1 s grid) with |applied correction - true delay| > 40 ms; 6 seeds, SNR -12 and -15 dB.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-syncfilter
PYTHONPATH=src python -m pytest -q tests          # 8 tests (needs ../capture-audiosync)
PYTHONPATH=src python experiments/run.py          # about 15 minutes; writes experiments/results.txt
```
Tests check the crystal curve against the sheet's formula, that the physical rate stays within 30 ppm, that delay is the integral of rate, that Theil-Sen ignores an outlier that moves least squares, that the Kalman filter learns a 40 ppm rate, that every fit beats the offset hold on a steady clock at 1800 s, and that the wide gate survives a wobble that locks out the strict one (with a noisy stand-in for GCC-PHAT, for speed).

## Results (from `experiments/results.txt`, SNR -12 dB; -15 dB differs in the third decimal except where noted)
The relative clock rate over the shoot: `warmup` 19.1 to 28.8 ppm, `sunday` 13.9 to 33.5 ppm, `wobble10` 30 to 50, `wobble30` 10 to 70.

Share of the shoot out of tolerance (offset / slope_strict / slope_wide, theilsen_wide, kalman all equal where one number follows):

| scenario | 300 s | 900 s | 1800 s | 3600 s |
|---|---|---|---|---|
| warmup (sourced curve) | 0 | 0 | 0.003 all | 0.434 / 0.156 / 0.087 |
| sunday (sourced curve) | 0 | 0 | 0.018 / 0.011 / 0.011 | 0.366 / 0.167 / 0.094 |
| wobble10 (assumed) | 0 | 0.021 / 0.009 / 0.002 | 0.421 / 0.140 / 0.043 | 0.759 / 0.127 all |
| wobble30 (assumed) | 0 | 0.130 / 0.270 / 0.270 | 0.302 / 0.579 / 0.194 | 0.803 / 0.134 all |

For wobble30, theilsen_wide is 0.270 at 900 s and 0.187 at 1800 s; kalman (q 5) is 0.270 and 0.579; kalman_q20 is **0.009** and 0.507.

- **The sourced curve is far gentler than the assumed wobble.** A3 x (40 K)^3 is 6.7 ppm; with a 25 K warm-up and 5 arcmin of angle error the two crystals differ by about 10 ppm at most. The 10 and 30 ppm sinusoids in `capture-syncslope` swing the rate by 20 and 60 ppm peak to peak; this model swings it by 10 (`warmup`) to 20 ppm (`sunday`), mostly a one-way ramp, not an oscillation. Conclusion changes: with realistic crystals a re-sync every 900 s needs no fit at all.
- **A fit helps at one hour, and which fit is immaterial.** At 3600 s the offset hold is out of tolerance for 37 to 43% of the shoot, any fitted line for 9 to 17%. The strict line gate is worse (0.156, 0.167) than the wide one (0.087, 0.094) because it rejects a true estimate early in the warm-up and resets. Least squares, Theil-Sen and Kalman are identical to three decimals (one exception at -15 dB: Theil-Sen 0.135 vs 0.094 in `sunday`, a single false peak entering its median).
- **Only a tuned Kalman filter handles a fast wobble.** At 900 s a 30 ppm wobble moves a quarter of a period between estimates. Least-squares and Theil-Sen lines extrapolate a rate that has already turned (27% bad); the offset hold is better (13%) because it never extrapolates; the Kalman filter with q = 20 ppm per sqrt(hour) down-weights its own rate state and ends at 0.9% (2.5% at -15 dB). The default q = 5 does not (27%). That is a tuned result against an assumed wobble: its q was chosen from three values on the scenario it wins, so treat 0.9% as an upper bound on what tuning buys.
- **At half the wobble period (1800 s) nothing works** (19 to 58% bad, offset 30%): the sampling aliases the wobble.
- **SNR hardly matters** from -12 to -15 dB, as in `capture-syncslope`.

## Limitations
Synthetic audio, an assumed temperature profile, assumed cut-angle errors and an assumed 20 ppm start offset; one crystal type; a stand-in tolerance; 6 seeds. The 1 ms Kalman measurement sd is a guess, and q was tuned on the scenario it wins (and the wobble itself is not shown to occur in cameras). Correction steps at each re-sync are not scored. The sheet gives one a3 for the family; a real part may differ by 20%. A real clip pair with a clap at both ends would replace all of this.

## Next steps
- Measure a real camera's audio-clock drift over a warm-up (clap at start, 30 min, 60 min) and compare with `warmup`.
- Measure GCC-PHAT's residual error at -12 dB on `capture-audiosync`'s audio and use it as the Kalman R.
- Feed the 900 s offset hold into `capture-edit`'s cut quality, since up to 1800 s the offset hold is good enough that the question moves to the cut itself.

## Owner steps
Record a clap at the start of a take, again after 30 and 60 minutes, on two owned cameras, from power-on.

## Outside dependencies
Python, NumPy, pytest and the sibling project `capture-audiosync`. The crystal curve is from a manufacturer data book; no real recordings.
