# Research log: capture-trackprior

## 2026-10-29 · Gated tracking with re-acquisition (planned, then results below)
- **Hypothesis.** Re-acquiring when the unrestricted GCC peak is `ratio` times higher than the best peak inside the
  tracked prior cuts lock-loss (cameras with every scored window wrong) on the four failing clips from 0.368 (1 bootstrap
  window, no gate) to under 0.15, without breaking the six clips at 0.000 wrong. Refuted if lock-loss stays above 0.25
  at every ratio in 1.2..3, or if the six good clips exceed 0.02 wrong.
- **Analysis.** `experiments/gated.py`: same windows as `run.py`, boot in (1, 3), ratio in (1.2, 1.5, 2, 3), reported
  with the ungated track and no-prior cells; wrong share, lost-lock share, share of windows re-acquired.
- **Outcome (`experiments/gated.txt`, 12 seeds x 3 cameras x 7 scored windows per clip and cell).** Supported on lock-loss,
  not on the wrong-window share. On the four failing clips, lock-loss falls from 0.368 (ungated, 1 bootstrap) to 0.076 at
  ratio 1.2, 0.097 at 1.5, 0.139 at 2 and 0.271 at 3; the six good clips stay at 0.000 wrong at every ratio. The wrong share
  is lowest at ratio 1.5 (0.221 on the four, against 0.375 with no prior and 0.225 for the 5-bootstrap ungated track).
  `space2` is not fixed (0.60 to 0.81 wrong against 0.659 with no prior): a gate that trusts the peak height cannot pick
  between a tone's aliases, which have equal heights. Ratio 1.2 re-acquires in 15% of windows on the failing clips.
