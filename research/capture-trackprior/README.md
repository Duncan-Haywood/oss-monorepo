# capture-trackprior: can a delay prior taken from a camera's own earlier windows give the oracle-prior gain in GCC audio sync?

Track 13 (autonomous multi-angle capture), the second "next step" of `capture-aliaswin`. **Headline (mostly negative):** no. `capture-aliaswin` showed an oracle prior of +-10 ms (centred on the true delay) takes the four failing real clips from 37.5% wrong windows to 0%. Replacing the oracle with a prior tracked from the camera's own earlier estimates (a Theil-Sen line, half-width from its scatter) does **not** reproduce that: with 1 prior-free bootstrap window it is no better than no prior (0.374 vs 0.375 wrong on the 4 failing clips) and **locks onto a wrong alias for the rest of the hour on 37% of their cameras**; 5 bootstrap windows get it to 0.225 wrong (14% of cameras lost). A half-width capped under the clip's period makes things worse with 1 bootstrap window, because the cap is below the drift between windows and breaks clips that worked (0.338 wrong on the six clips that were at 0.000). Where an estimate fails, the tracked prior keeps it failed instead of retrying.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/capture-trackprior/

**Builds on.** `capture-aliaswin` (`gcc_search`, the oracle ceiling, the ten-clip design), `capture-residgate`, `capture-realaudio` (partial whitening after Knapp and Carter (1976), *IEEE Trans. ASSP* 24(4)), `capture-audiosync`. Tracking a drifting delay with a robust line is standard (Theil 1950; Sen 1968, *JASA* 63); nothing here is claimed as new. No CU Boulder group in `prompt.md` covers this.

## What is real and what is not
Real: the audio, ten LibreOffice gallery clips. Not real: the 0.8 s delay, the +-40 ppm clock drift (uniform, constant per camera), white noise at 0 dB. Disclosed leak: the half-width cap uses each clip's autocorrelation period measured on the clean clip, which a deployed system would have to estimate. The oracle cell is a ceiling.

| input | value | source |
|---|---|---|
| window / gamma | 2 s / 0.25 | `capture-aliaswin` best 2 s setting |
| windows | 12 over an hour, 327 s apart; scored: windows 5 to 11 | same design as `capture-aliaswin`; scoring the same windows in every cell makes bootstrap lengths comparable |
| trials | 252 scored windows per clip and cell (12 seeds x 3 cameras x 7) | |
| drift bound used for the one-point prior | 40 ppm x gap | the simulation's own drift range; a crystal tolerance, not measured |
| fit | Theil-Sen on the last 6 estimates; half-width 4 x 1.4826 x MAD + 2 ms (+ 10% of the drift bound) | my choice, not tuned |

## Method (`src/capture_trackprior/track.py`)
`track_camera` searches the first `boot` windows over +-1.5 s, then restricts each search to the line's prediction +- a half-width from the residual scatter (one or two points: the worst-case drift over the gap plus 2 ms). Every estimate joins the history, accepted or not. If the prediction leaves the lags a window can hold, it re-searches without a prior. `experiments/run.py` scores every cell on identical windows.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-trackprior
python -m pytest -q tests            # 6 tests
python experiments/run.py            # a few minutes on 4 cores; writes experiments/results.txt
```
Needs the LibreOffice gallery sounds (`/usr/lib/libreoffice/share/gallery/sounds`).

## Results (`experiments/results.txt`, section B; share of scored windows wrong)
| prior | all 10 clips | 4 failing clips | 6 other clips | cameras with every scored window wrong (4 failing) |
|---|---|---|---|---|
| none (+-1.5 s) | 0.150 | 0.375 | 0.000 | 0.007 |
| oracle +-10 ms | 0.000 | 0.000 | 0.000 | 0.000 |
| track, 1 bootstrap window | 0.150 | 0.374 | 0.000 | 0.368 |
| track, 3 | 0.138 | 0.344 | 0.000 | 0.243 |
| track, 5 | **0.090** | **0.225** | 0.000 | 0.139 |
| track, 1, cap 0.45 x period | 0.372 | 0.424 | 0.338 | 0.424 |
| track, 3, cap 0.45 x period | 0.167 | 0.417 | 0.000 | 0.250 |
| track, 5, cap 0.45 x period | 0.146 | 0.366 | 0.000 | 0.326 |

- **The tracked prior is only as good as its bootstrap.** Wrong share drops with more bootstrap windows (0.374, 0.344, 0.225), as the line then has more chances to start from a right estimate. It never approaches the oracle, because the oracle is told the truth and the tracker is told the failure rate of the thing it is correcting.
- **Lock-in is the failure.** Unrestricted search is wrong independently in each window (0.007 of failing-clip cameras wrong in all scored windows); tracking turns an early alias into a persistent one (0.368 with 1 bootstrap window). So the average wrong share hides a worse reliability profile: a single sync error becomes an hour of mis-sync.
- **A cap under the period needs a drift-tolerant centre.** With 1 bootstrap window the cap (e.g. 0.45 x 2 ms) is smaller than the up-to-13 ms drift between windows, so clips that were fine fail (`applause` 0.889, `drama` 0.472). It is harmless only once the line has a slope (3 or 5 bootstrap windows), where it still does not help.
- **`space2` does not improve (0.55 to 0.89 wrong versus 0.659 with no prior).** Its 12 ms period is below any drift-safe half-width at the first steps, which is the point `capture-aliaswin` made about oracles; a tracker cannot get that precision without a good start.

## Gated tracking with re-acquisition (2026-10-29, `src/capture_trackprior/gated.py`, `experiments/gated.py`)
The first next step. Each window is searched inside the tracked prior and over +-1.5 s; if the unrestricted peak is more than `ratio` times the height of the best in-prior peak, the prior is judged wrong, the unrestricted peak is taken and the line restarts. Same windows as above. Share of scored windows wrong, 4 failing clips (`gated.txt`):

| cell | wrong, 4 failing | wrong, 6 others | cameras lost (4) | windows re-acquired (4) |
|---|---|---|---|---|
| no prior | 0.375 | 0.000 | 0.007 | 0 |
| track, 1 bootstrap, ungated | 0.374 | 0.000 | 0.368 | 0 |
| gated, 1 bootstrap, ratio 1.2 | 0.274 | 0.000 | **0.076** | 0.153 |
| gated, 1 bootstrap, ratio 1.5 | **0.221** | 0.000 | 0.097 | 0.058 |
| gated, 1 bootstrap, ratio 2 | 0.238 | 0.000 | 0.139 | 0.035 |
| gated, 1 bootstrap, ratio 3 | 0.312 | 0.000 | 0.271 | 0.013 |

Gating removes most of the lock-in (0.368 to 0.076 to 0.097 of cameras) and reaches the 5-bootstrap ungated wrong share (0.225) with 1 bootstrap window, with no cost on the clips that worked. It does not approach the oracle's 0: `space2` stays at 0.60 to 0.81 wrong, because a tone's aliases have near-equal peak heights, so height cannot choose between them; `untie` and `soft` keep 0.09 to 0.2. Ratio is a trade (low ratios re-acquire often and give up the prior's protection, high ratios let a wrong lock stay); 1.5 is the best on wrong share and was the best of four values I tried, not tuned further. Three bootstrap windows change little (0.223 at ratio 1.5). Reproduce: `python experiments/gated.py` (about 45 s on 4 cores).

## Limitations
Ten clips; white noise at one SNR; constant drift (a real clock wanders with temperature); one fit and half-width rule, not tuned (the failure mode looks structural, not a tuning gap, but I did not sweep k_mad, `keep` or the floor); 12 seeds and 3 cameras are not independent per clip; the wrong-window count is the metric, not cut damage.

## Next steps
- Recover with a longer (4 s) window rather than the same 2 s window when the gate fires, and gate on something that separates equal-height aliases (the tone case).
- Bootstrap with a long (4 s) window or a clap/chirp, then track with 2 s windows.
- Sweep k_mad, `keep` and the floor.

## Owner steps
None. (Real two-camera clips remain the owner step in `capture-residgate`.)

## Outside dependencies
The ten clips come from the LibreOffice install; delay, noise and clocks are simulated.

*Produced with AI assistance (Claude Code).*
