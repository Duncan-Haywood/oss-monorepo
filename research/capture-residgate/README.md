# capture-residgate: does trimming sync windows by their distance from the fitted clock line, with no tuned threshold, beat the peak-sharpness gate on real audio?

Track 13 (autonomous multi-angle capture), the first "next step" of `capture-syncgate`, which gated GCC windows on peak-to-sidelobe ratio (PSR) and needed a threshold that depends on the clip. A camera clock is a straight line over an hour, so a window whose delay is far off the fitted line is wrong whatever its peak looks like, and the threshold can be in milliseconds. **Headline:** with gamma 0.25 at 0 dB SNR, trimming windows more than 2 to 20 ms off a Theil-Sen line (3 rounds) cuts the share of cuts jumping over a 30 fps frame from **0.014 to 0.009** (10 real clips, 12 seeds), and the three tolerances give the same result, so no clip-specific tuning is needed. At -10 dB it helps much less than the PSR gate: **0.461** against 0.378 for PSR 6.5 (ungated 0.476, PHAT 0.637); both together 0.374. Trimming does not fix the failure `capture-syncgate` found in choosing gamma on other clips (0.099 held-out at 0 dB, unchanged), because that failure is in gamma, not in the fit.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/capture-residgate/

**Builds on.** `capture-syncgate` (`gcc_psr`, `loco_pick`, the experiment design, imported), `capture-realedit`, `capture-realaudio` (partial whitening after Knapp and Carter (1976), *IEEE Trans. ASSP* 24(4)), `capture-audiosync` (Theil-Sen fit), `capture-syncedit` (edit and cut damage). Iterative trimming of a robust line is a standard device; nothing here is claimed as new. No CU Boulder group in `prompt.md` covers this.

## What is real and what is not
Real: the audio, the same 10 LibreOffice gallery clips as `capture-syncgate`. Not real: delay, white noise, clock rates (+-40 ppm, assumed), loud events and the one-frame limit, all inherited unchanged.

| input | value | source |
|---|---|---|
| Cameras, edit, clocks, windows | as `capture-syncgate` | that README |
| gamma | 0.25, 0.5, 1.0 | `capture-realaudio` |
| Trim tolerance | none, 2, 5, 20 ms off the line | grid; 2 ms is about 32 samples at 16 kHz, 20 ms a bit over half a frame |
| PSR gate | none, 6.5 | the `capture-syncgate` pick at -10 dB |
| Floor | the 3 windows closest to the line are always kept | choice, needed for a line |
| Trials | 12 seeds per clip per cell | |

## Method (`src/capture_residgate/residgate.py`)
`trimmed_fit`: Theil-Sen line, drop windows with absolute residual over the tolerance, refit, up to 3 rounds. `resid_camera_errors` optionally applies the PSR gate first, so the two can be combined.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-residgate
python -m pytest -q tests          # 8 tests
python experiments/diagnose.py     # about 1 minute; writes experiments/diagnose.txt (section D)
python experiments/run.py          # about 6 minutes on 4 cores; writes experiments/results.txt
```

## Results (from `experiments/results.txt`, section B, gamma 0.25, mean over 10 clips)
| SNR (dB) | trim tol | PSR gate | visible | worst clip |
|---|---|---|---|---|
| 0 | none | none | 0.014 | 0.105 (`untie`) |
| 0 | 2, 5 or 20 ms | none | 0.009 | 0.064 |
| 0 | 2 ms | 6.5 | 0.010 | 0.064 |
| -10 | none | none | 0.476 | 0.967 |
| -10 | 2 to 20 ms | none | 0.461 | 0.960 |
| -10 | none | 6.5 | 0.378 | 0.961 |
| -10 | 2 ms | 6.5 | 0.374 | 0.961 |

- **At 0 dB the gain is real but small and sits in one clip.** `untie` goes 0.105 to 0.064; `soft` and `space2` are unchanged or slightly worse in event damage. With ten clips and one clip carrying most of it, treat it as suggestive.
- **The tolerance does not matter between 2 and 20 ms**, which is the claimed advantage (a physical, clip-free threshold), but it is also why the method does little: the windows it removes are the grossly wrong ones, and the damaging errors are the moderately wrong ones that the line fit already averages out or cannot detect.
- **At -10 dB residual trimming cannot work well**: when most windows are noise the first line is itself fitted to noise (`space2` 0.94 to 0.96, `wallewal` 0.918 to 0.929-0.943 with trimming). PSR looks at each window on its own and so does better; combined it adds 0.004.
- **Trimming drops many windows without helping:** at 0 dB with a 2 ms tolerance it drops 26% of `wallewal` windows and 67% of `space2` windows, with no visible gain, because the fit is robust anyway. Section D below diagnoses it: the dropped windows are wrong, not noisy (period aliasing in `space2`, partly in `wallewal`; early-start windows in `untie` and `soft`).
- **Leave-one-clip-out (section C)** picks 0.25 for nine of ten clips and 0.5 for `wallewal` held out, in every rule at 0 dB: 0.099, the `capture-syncgate` result again. The failure belongs to the choice of gamma, so a better gate does not touch it.

## D. Why a 2 ms tolerance drops so many windows (`experiments/diagnose.py`, `diagnose.txt`)
The earlier guess (sub-sample interpolation noise plus clock wobble) is wrong: the simulated clock is an exact line and the median error of the windows that are right is 0.001 to 0.07 ms. Measured against the true delay (0 dB, gamma 0.25, 432 windows per clip, a design like section A with its own random draws), the windows the 2 ms tolerance removes are wrong estimates:

| clip | dominant autocorrelation period (ms), height | right (within 2 ms) | wrong, on a multiple of the period | wrong, other |
|---|---|---|---|---|
| `space2` | 12.12, 1.00 | 0.345 | **0.655** | 0.000 |
| `wallewal` | 28.69, 0.88 | 0.738 | 0.118 | 0.144 |
| `untie` | 20.44, 0.85 | 0.662 | 0.000 | 0.338 |
| `soft` | 48.69, 0.77 | 0.752 | 0.000 | 0.248 |
| other six | 2 to 53, 0.05 to 0.94 | 1.000 | 0.000 | 0.000 |

- **`space2` is period aliasing.** Its autocorrelation is 1.00 at 12.12 ms (a near-pure tone), the cross-correlation has a copy of the true peak there, and noise makes the copy win: all 65.5% of its wrong windows sit within 0.5 ms of 1 to 8 periods (errors of 12.1, 24.4, 48.6 ms). With the period replaced by 1.37 times itself the share is 0.000 for every clip, so this is not chance. It matches the 67% dropped in the section above.
- **`wallewal` is part alias** (28.7 ms period, 11.8% of windows) **and part gross** (14.4%, errors of hundreds of ms).
- **`untie` and `soft` are all gross** (errors near 0.75 to 1 s). Their wrong windows start early in the clip (mean start 0.27 s and 0.16 s against 0.86 s and 0.75 s for the right ones), so it is something about the first part of these 4 s clips, but I checked loudness (not quiet) and in-band energy (not different) and did not find the cause.
- **What it means for the gate.** A fitted line cannot tell an aliased window from a good one by a time threshold when the alias is most of the clip (`space2`: 66% aliased, so the first line is fitted to aliases too). Dropping them is right; what is missing is a way to get them right: a longer window, a lower gamma on tonal clips (`capture-realaudio`), or a prior from the first sync. The 12 ms and 29 ms periods are small next to a 30 fps frame (33 ms), which is why `space2`'s event damage stayed low in section B.

Not tested: the cause of the `untie` and `soft` early-start failures; whether a longer window removes the aliasing (expected, not run).

## Limitations
Ten clips from one gallery; 12 seeds per cell; synthetic delay and white noise, no reverb or wind; the tolerance and PSR grids are small; a 4-camera, 120 s edit only. Clock rates are assumed, not from a crystal curve (see `capture-syncfilter` for that). The one-frame criterion is assumed, and viewer tolerance is not measured.

## Next steps
- Choose gamma per window (or per clip from its own correlation shape) rather than across clips, since that is where the held-out failure lives.
- Replace the gallery with openly licensed field recordings with real wind and a second real camera.
- Find why `untie` and `soft` fail on windows starting in the first half second, and test whether longer windows or a lower gamma remove the period aliasing in `space2` and `wallewal` (section D).

## Owner steps
Record a hand clap on two owned cameras at the start and end of a long take to get real clips and real drift.

## Outside dependencies
The 10 clips come from the LibreOffice install; delay, noise and clocks are simulated.

*Produced with AI assistance (Claude Code).*
