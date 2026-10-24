# capture-aliaswin: does a longer window, a lower gamma or a delay prior fix the period aliasing and early-start failures of GCC audio sync on real clips?

Track 13 (autonomous multi-angle capture), the third "next step" of `capture-residgate` (section D). **Headline:** on the four of ten real clips that fail, the lever is how much audio the two cameras *share*, not gamma. With the offset used throughout this track (0.8 s), a window of W s shares only W - 0.8 s. At 0 dB SNR (white noise, gamma 0.25) the share of delay estimates more than 2 ms off on the four failing clips falls from **0.97 at 1 s to 0.38 at 2 s and 0.16 at 3 s** (all ten clips: 0.62, 0.15, 0.07). Choosing gamma at 2 s only moves it between 0.38 and 0.76 (PHAT, gamma 1, is worst). A delay prior removes the failures only if it is tighter than the clip's period: an oracle prior of +-10 ms gives 0.000 wrong at 2 and 3 s, but +-50 ms leaves `space2` at 0.655 wrong (its aliases are at 12.1, 24.4 and 48.6 ms). The early-start failures of `untie` and `soft` are mostly explained by a short shared segment; the shared audio in their wrong windows is only 2 to 5 dB quieter, so the loudness explanation is weak.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/capture-aliaswin/

**Builds on.** `capture-residgate` (`alias.py`, section D: the failures and their classification), `capture-realaudio` (clips, partial whitening after Knapp and Carter (1976), *IEEE Trans. ASSP* 24(4)), `capture-audiosync`. Nothing here is claimed as new; the finding that GCC needs a window comfortably longer than the offset is textbook, and this measures it on the clips this track already uses. No CU Boulder group in `prompt.md` covers this.

## What is real and what is not
Real: the audio, ten LibreOffice gallery clips. Not real: the delay (0.8 s plus +-40 ppm drift over an hour), white noise at 0 dB (nominal, set from the whole segment's power), and the oracle prior (it is given the true delay, so it is a ceiling, not a method). All inherited from `capture-residgate`.

| input | value | source |
|---|---|---|
| Window | 1, 2, 3 s | 0.5 s cannot hold a 0.8 s offset; clips are 3.9 to 8.7 s, and `falling` (3.94 s) is too short for 3 s, so those cells use 9 clips |
| gamma | 0, 0.25, 0.5, 1 | `capture-realaudio` |
| Delay search | +-1.5 s, or +-50 / +-10 ms about the true delay | oracle prior, a ceiling |
| Trials | 432 windows per clip and cell (12 seeds x 3 cameras x 12 windows) | as `capture-residgate` section D |
| wrong | error over 2 ms | as `capture-residgate` |

## Method (`src/capture_aliaswin/aliaswin.py`)
`pair_at` builds the two cameras' windows as `capture_realaudio.pair_from_clip` does and also returns the window start. `gcc_search` is a partially whitened GCC with the peak picked only inside `center +- half` (parabolic refinement). `experiments/overlap.py` asks whether the audio the two cameras share is quieter in wrong windows.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-aliaswin
python -m pytest -q tests            # 3 tests
python experiments/run.py            # about 3 minutes on 4 cores; writes experiments/results.txt
python experiments/overlap.py        # about 1 minute; writes experiments/overlap.txt
```
Needs the LibreOffice gallery sounds (`/usr/lib/libreoffice/share/gallery/sounds`).

## Results (`experiments/results.txt`, section B: share of windows wrong; mean over clips)
| window | gamma | prior | all clips | 4 failing clips |
|---|---|---|---|---|
| 1 s | 0.25 | none | 0.623 | 0.972 |
| 2 s | 0 / **0.25** / 0.5 / 1 | none | 0.183 / **0.150** / 0.166 / 0.363 | 0.458 / **0.376** / 0.414 / 0.761 |
| 3 s | **0** / 0.25 / 0.5 / 1 | none | **0.059** / 0.072 / 0.083 / 0.208 | **0.133** / 0.163 / 0.187 / 0.468 |
| 2 s | 0.25 | +-50 ms (oracle) | 0.080 | 0.201 |
| 2 s | 0.25 | +-10 ms (oracle) | 0.000 | 0.001 |
| 3 s | 0.25 | +-10 ms (oracle) | 0.000 | 0.000 |

- **The shared segment decides.** 1 s windows share 0.2 s and fail on nearly everything (wrong at gamma 0.25: `soft` 0.91, `untie` 0.98, `space2` and `wallewal` 1.00). At 3 s, `soft` and `untie` go to 0.000 wrong at gamma 0 to 0.5, and `wallewal` to 0.03 to 0.05. `space2` does not: it stays 0.52 to 0.70 aliased at 2 and 3 s, whatever the gamma up to 0.5.
- **`space2` is not a window problem.** A tone with autocorrelation 1.00 gives a true-peak copy one period away, and more audio does not remove it. PHAT (gamma 1) makes it gross instead of aliased (0.99 wrong at 2 s). Only a prior tighter than the period works: +-50 ms keeps 0.655 wrong (at 12.1 ms steps), +-10 ms gives 0.000.
- **Gamma is a second-order lever** at 2 s: best is 0.25 on average, but per clip the best differs (`wallewal` wants 0, `soft` wants 0.5 or more), the held-out failure from `capture-syncgate`. At 3 s the best is 0.
- **Early-start failures (section C, 2 s, gamma 0.25).** `untie` is wrong in 77% of windows starting in the first half second, 11% from 0.5 to 1 s and 0% later; `soft` 59%, 0%, 0%. Because camera B is delayed by 0.8 s, such a window shares clip audio from about 0.5 to 1.2 s into the clip only. `overlap.txt`: median shared-audio SNR in right windows is +1.0 dB for both clips and -3.6 dB (`soft`) / -0.9 dB (`untie`) in wrong ones, so the shared part is somewhat quieter, but none falls below -6 dB, so loudness explains only part; the content of the first second (what it is) may matter more, and I did not isolate it.

## Limitations
Ten clips from one gallery; white noise only; one SNR (0 dB); 3 s windows start in a range of about 0 to 0.2 s of a 4.2 s clip, so each clip then contributes nearly one distinct window (its 0.000 and 1.000 are not 432 independent trials: treat 3 s per-clip results as one draw of content); the oracle prior is given the true delay; the wrong-window count is the metric, not cut damage (`capture-syncedit`). The shared-segment rule comes from this simulation, which delays a fixed segment by 0.8 s; a real pair of continuous recordings has the same overlap W - tau when windows are cut at the same clock time.

## Next steps
- Choose the window as offset + 2 s on the first sync, then run the full edit (`capture-syncedit`) with it and measure cut damage.
- Estimate the period from the clip's own autocorrelation and set the prior half-width below it, with the prior taken from the previous window's line fit rather than from the truth.
- Test the first-second hypothesis for `untie` and `soft` by swapping the shared content between clips at equal SNR.

## Owner steps
None. (Real two-camera clips with a hand clap remain the owner step in `capture-residgate`.)

## Outside dependencies
The ten clips come from the LibreOffice install; delay, noise and clocks are simulated.

*Produced with AI assistance (Claude Code).*
