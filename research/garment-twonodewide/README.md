Follow-up to [`garment-twonodepen`](../garment-twonodepen) (track 6, `PROJECTS.md`), taking the last item of its next steps: "retune on a wider set of rooms to see whether the 'outside' reversal is a training-set artefact". Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Builds on.** `garment-twonodepen` (equal-units swing penalty, tuning, gates, grids), through it `garment-twonodeprop`, `garment-twonodelag` and `garment-twonodeheld`. Zhang et al. (2019), cited in `garment-thermal`, motivates the gating idea; the actuators here are toys, not models of that textile. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source; none re-read in this run.

## Method
Same model, gates, grids (54 on/off bands, 72 proportional bands), lags (0, 2, 5, 10 min), choice sets ("ours", "ref") and cost as `garment-twonodepen`; only the room sets change, and only penalties 0.01 and 0.1 C per swing are run. Both gates are tuned either on the **narrow** training rooms (22, 24, 26 C; the original set) or on **wide** ones (20, 22, 24, 26, 28 C), each room in both rest-to-walk and walk-to-rest directions. Both are then scored, unchanged, on the same three held-out groups, none seen in either training set: 23 and 25 C (inside both ranges), 21 and 27 C (outside narrow, inside wide), 18 and 30 C (outside both). Exhaustive and deterministic.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodewide
python3 experiments/run.py      # about 70 s; writes experiments/results.txt
python3 experiments/figure.py   # writes experiments/wide_gain.svg
python3 -m pytest -q tests      # 4 tests
```

## Results (from `experiments/results.txt`; proportional minus on/off cost in C, penalty term included; negative = proportional better)
Wins and mean difference over the 8 (choice set, lag) cases per row:

| penalty | tuned on | 23, 25 C | 21, 27 C | 18, 30 C |
|---|---|---|---|---|
| 0.01 | narrow | 7 wins, -0.019 | 7 wins, -0.055 | 1 win, +0.001 |
| 0.01 | wide | 7 wins, -0.028 | 7 wins, -0.059 | 0 wins, +0.003 |
| 0.1 | narrow | 8 wins, -0.052 | **4 wins**, -0.064 | 8 wins, -0.007 |
| 0.1 | wide | 7 wins, -0.032 | **7 wins**, -0.103 | 6 wins, -0.001 |

- **The reversal is partly a training-range artefact.** At the highest penalty, proportional won only 4 of 8 cases at 21 and 27 C when tuned on the narrow range, and 7 of 8 (mean edge 0.103 C against 0.064 C) when tuned on the wide one. In the wide-tuned runs the proportional band is in several cases narrower than the on/off band (for example 33.6-33.8 against 33.6-34.2 C).
- **Far outside any training room nothing separates the gates.** At 18 and 30 C the mean difference is at most 0.007 C in either direction, below what this model can resolve, so the original "outside" reversal does not show up as a robust effect at those rooms either. (The earlier test rooms, 20 and 28 C, are training rooms here and so were not re-scored.)
- **Mixed effect inside the range.** Wide training slightly weakened the proportional edge at 23 and 25 C when the penalty is 0.1 (-0.052 to -0.032 C): tuning for more rooms costs fit on the middle ones.
- Figure: `experiments/wide_gain.svg`.

## Limitations
Stylised and preliminary. Same assumptions as `garment-twonodepen`: one person, one clothing level, constant humidity, two assumed transmittances, an assumed penalty scale and swing count, and linear-ramp proportional law. Only two penalties. Eight cases per row, and the cases share a model, so wins are not independent evidence. Differences are hundredths to tenths of a degree on a proxy. The mechanism (a tuned band that generalises better) was not isolated. Simulated comfort is not a claim about any real garment.

## Next steps
A PI law and a minimum dwell time; a wear model that depends on rate; held-out persons and clothing levels (rooms are now covered); a full penalty sweep with the wide training set.

## Owner steps
None required. Measuring a real gating textile's range, lag and switching life is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodepen` code and what it reuses. Transmittances, lags, penalties, body and environment parameters are assumptions from outside this project.
