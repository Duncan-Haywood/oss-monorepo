# capture-syncgate: does dropping doubtful sync windows, with settings chosen on other clips, keep a multi-camera edit in sync on real audio?

Track 13 (autonomous multi-angle capture), taking the first two "Next steps" of `capture-realedit`: choose gamma on some clips and test on others, and add a peak-to-sidelobe confidence gate. **Headline:** at 0 dB SNR a gate that drops windows whose correlation peak is under 8 sidelobe standard deviations, with gamma 0.25, leaves **0.019** of cuts jumping over a 30 fps frame when the threshold is picked on the other nine clips (PHAT ungated: 0.342). At -10 dB the gate helps but does not rescue the edit: 0.391 held-out against 0.476 ungated (0.637 for PHAT). Choosing gamma on other clips *without* a gate does not hold up: 0.099 at 0 dB, because one clip (`wallewal`) is the one clip where gamma 0.5 collapses and the other nine cannot tell.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/capture-syncgate/

**Builds on.** `capture-realedit` (real-clip cut damage, imported), `capture-realaudio` (`pair_from_clip`, partial whitening after Knapp and Carter (1976), *IEEE Trans. ASSP* 24(4)), `capture-audiosync` (Theil-Sen fit), `capture-syncedit` (clocks, edit, cut damage) and `capture-edit`. The peak-to-sidelobe ratio is the standard peak-quality measure from correlation tracking; here it is computed over the GCC output outside +-12 samples of the peak. No CU Boulder group in `prompt.md` covers this and none is claimed.

## What is real and what is not
Real: the audio, the same 10 LibreOffice gallery clips as `capture-realedit` (read at run time, not copied). Not real: delay, white noise, clock rates (+-40 ppm, assumed), loud events and the one-frame visibility limit, all inherited unchanged from `capture-realedit`. The PSR thresholds (5.5, 6.5, 8) were set from a probe of noise-only peaks (a wrong peak sits near 5 for 2 s windows at 16 kHz; right peaks are mostly 6 to 70) and are a grid, not a derived value.

| input | value | source |
|---|---|---|
| Cameras, edit, clocks, windows | as `capture-realedit` | that README |
| gamma grid | 0.25, 0.5, 1.0 | `capture-realaudio` (0.25 was chosen there) |
| PSR threshold grid | none, 5.5, 6.5, 8 | probe on these clips, see above |
| Gate floor | fewer than 3 survivors: keep the 3 highest-PSR windows | choice, needed for a line fit |
| Trials | 12 seeds per clip per cell | |

## Method (`src/capture_syncgate/syncgate.py`)
`gcc_psr` returns the delay and PSR (peak minus mean, over standard deviation, of the correlation away from the peak). `gated_camera_errors` drops windows under `psr_min` before the Theil-Sen fit and reports the share dropped. `loco_pick` is leave-one-clip-out: for each clip, the setting with the lowest mean visible-cut share over the other nine is applied to it, and its score on the held-out clip is what is reported.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-syncgate
python -m pytest -q tests          # 5 tests
python experiments/run.py          # about 4 minutes on 4 cores; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
Mean over 10 clips of the share of cuts with a jump over one frame:

| SNR (dB) | rule | in-sample or held-out | visible |
|---|---|---|---|
| 0 | PHAT, no gate | reference | 0.342 |
| 0 | gamma 0.25, no gate | in-sample | 0.014 |
| 0 | gamma 0.25, best of 4 thresholds | held-out (leave-one-clip-out) | **0.019** |
| 0 | gamma chosen, no gate | held-out | 0.099 |
| 0 | gamma and threshold chosen | held-out | 0.096 |
| -10 | PHAT, no gate | reference | 0.637 |
| -10 | gamma 0.25, no gate | in-sample | 0.476 |
| -10 | gamma 0.25, threshold chosen | held-out | **0.391** |

- **The in-sample caveat of `capture-realedit` is half right.** Gamma 0.25 stays the best on every fold at -10 dB, and the gate's threshold choice is stable (8 on nine of ten folds at 0 dB; 6.5 on nine of ten at -10 dB). But at 0 dB, choosing gamma too picks 0.5 when `wallewal` is held out, because on the other nine clips 0.5 ties 0.25 or beats it (`soft` 0.03 at 0.25 against 0.00 at 0.5; `untie` 0.105 against 0.00). `wallewal` then scores 0.852. With nine clips and one hard case, leave-one-out cannot see the failure of the setting it is about to choose.
- **The gate trades one failure for another.** At 0 dB it clears `soft` (0.03 to 0.00) and `untie` (0.105 to 0.00) but breaks a clip that was fine: `space2` goes 0.000 to 0.006 and `wallewal` 0.000 to 0.077 with the 8-threshold, where the gate drops 75% of windows (the 3-window floor); I did not diagnose why those clips' true peaks fall under the threshold.
- **At -10 dB the gate helps a little and cannot fix the clips that lack signal.** `drama` 0.705 to 0.175 and `soft` 0.566 to 0.087, but `falling`, `space2` and `wallewal` stay at 0.90 to 0.96: when almost every window is noise there is nothing reliable to keep, and the floor of 3 windows is then 3 noise peaks.
- **The gate needs strong gamma to matter.** With PHAT it changes little (0.342 to 0.32 at 0 dB) and slightly raises loud-event damage, (a likely cause, not tested: PSR on a fully whitened correlation separates right and wrong peaks poorly on a tonal clip).

## Limitations
Ten clips from one gallery, mostly effects; 12 seeds per cell; synthetic delay and white noise; no reverb or wind. The leave-one-clip-out picks come from a 12-setting grid, so with ten clips the held-out numbers are noisy (one clip is 1/10 of the mean). Thresholds were set from a probe on these same clips (noise-only peak level), so a mild leak remains even in "held-out". Share of cuts is the scored quantity; viewer tolerance is not measured. The "dropped" column counts the fall back windows too.

## Next steps
- Gate on PSR of a *fitted-line residual* instead (drop windows far from the line), which does not depend on how peaky a quiet clip is.
- Replace the gallery with openly licensed field recordings with real wind, and re-pick on those.
- Add more than 10 clips so the leave-one-out can see a failure like `wallewal`'s from the others.

## Owner steps
Record a hand clap on two owned cameras at the start and end of a long take, outdoors, to get real clips and real drift.

## Outside dependencies
The 10 clips come from the LibreOffice install; the delay, noise and clocks are simulated here.

*Produced with AI assistance (Claude Code).*
