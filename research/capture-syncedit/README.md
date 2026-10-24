# capture-syncedit: does a residual audio-sync error show at the cuts of an automatic multi-camera edit?

Track 13 (autonomous multi-angle capture), closing the third "Next steps" item of `capture-audiosync` ("feed synced clips to `capture-edit` and measure whether a 5 ms residual changes cut quality"). **Headline:** it cannot change *quality*, by construction, and the question worth asking is continuity at each cut. With sync errors from the real `capture-audiosync` estimator, a Theil-Sen fit over 12 windows leaves **0%** of cuts with a visible jump from 0 dB down to -10 dB SNR (2 s windows; down to -15 dB with 5 s windows), while a sync made once at the start and never redone leaves **50%** of cuts jumping over one 30 fps frame (mean jump 40 ms). Below the fit's threshold it flips: at -15 dB (2 s windows) 69% of cuts jump a median 0.28 s and 11% of cuts repeat or drop a loud event; at -20 dB, 94% and 22%. A threshold, not a slope. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/capture-syncedit/

**Builds on.** `capture-audiosync` (GCC-PHAT, Theil-Sen, synthetic audio) and `capture-edit` (noisy scores, Viterbi edit, Poisson loud events). No CU Boulder group in `prompt.md` covers this and none is claimed.

## Why not edit quality
In `capture-edit`, camera quality is a property of what a camera sees at its own world time. A camera whose clock is late is late in score and picture together, so the mean true quality of the chosen shots cannot move. What a sync error damages is the **cut**: cutting from camera A (error a) to B (error b) jumps the picture by b - a in world time. Two counts per cut:
- **visible**: |b - a| over one frame (33.3 ms at 30 fps, the criterion `capture-audiosync` uses; assumed, not measured on viewers);
- **event**: a loud moment (clap, jump, speech onset) inside the jump, so it is shown twice or never. Events are Poisson at 0.5 per second (`capture-edit`'s default, assumed).

Analytic check (tested): with event rate r and jump J the share is 1 - exp(-rJ); a 40 ms jump gives 2%, a 0.5 s jump 22%.

## Method (`src/capture_syncedit/syncedit.py`)
4 cameras, a 120 s Viterbi edit (sigma 0.3, cut cost 1.0, as in `capture-edit`), placed at a random point of a 1 h shoot. Camera 0 is the reference; each other camera has a clock rate uniform in +-40 ppm against it (swept range, none sourced) and a 0.8 s start offset. Its sync error at the clip is measured, not assumed: 12 GCC-PHAT windows over the hour on synthetic speech-like audio, then either the first window alone (**once**) or a Theil-Sen line (**fit**). 12 seeds; `jump_ms` is the mean |b - a| over a run's cuts.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-syncedit
python -m pytest -q tests                     # 5 tests
python experiments/run.py                     # about 3 minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
| sync | window | SNR (dB) | cuts with jump over a frame | cuts with an event in the jump | mean jump (ms) | median worst camera error (ms) |
|---|---|---|---|---|---|---|
| once | 2 s | 10 | 0.496 | 0.023 | 40.0 | 48.4 |
| fit | 2 s | 0 | 0.000 | 0.000 | 0.0 | 0.0 |
| fit | 2 s | -10 | 0.000 | 0.000 | 0.0 | 0.0 |
| fit | 2 s | -15 | 0.692 | 0.109 | 288.9 | 552.7 |
| fit | 2 s | -20 | 0.940 | 0.216 | 471.2 | 847.9 |
| fit | 5 s | 0 | 0.000 | 0.000 | 0.0 | 0.0 |
| fit | 5 s | -10 | 0.000 | 0.000 | 0.0 | 0.0 |
| fit | 5 s | -15 | 0.000 | 0.000 | 0.0 | 0.0 |
| fit | 5 s | -20 | 0.983 | 0.240 | 522.8 | 847.9 |

- **A residual of a few ms is invisible at the cuts.** Where the fit succeeds the error is below the 0.005 ms the table rounds to, matching `capture-audiosync`; the 5 ms of the original question is far under one frame and changes nothing.
- **Syncing once is the real loss.** At a 40 ppm range the clip drifts a median 48 ms from the reference, so half of the cuts jump over a frame, though only about 2% repeat or drop a loud event because a 40 ms jump rarely spans one.
- **Failure is large, not small.** When the peak is lost the error is hundreds of ms, so the damage jumps from none to most cuts at once: pick windows and SNR margin so the pipeline stays on the right side of the threshold, and gate on the estimator's confidence rather than trusting a bad fit.

## Limitations
Synthetic audio and exact simulated delays (see `capture-audiosync`); real wind and codec effects will move the threshold (`capture-realaudio` found real clips fail earlier). One frame as the visibility limit is an assumption; no viewer test. Event rate 0.5/s assumed. The clock-rate range is swept, not sourced. A shifted camera is also assumed to keep the same quality score, which ignores a sync error between a camera's audio and its own picture.

## Next steps
- Set the visibility criterion from published cut-continuity or audio-video asynchrony thresholds and re-count.
- Run the edit with sync errors from `capture-realaudio`'s real clips.

## Owner steps
Record a clap on two owned cameras at the start and end of a long take to get real drift.

## Outside dependencies
None beyond numpy: no real footage, no viewers, no cameras.
