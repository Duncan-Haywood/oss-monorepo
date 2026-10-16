# garment-twonodeperson: does an infrared-gating band tuned for one person and clothing level still work for other clothing and body sizes?

Follow-up to [`garment-twonodewide`](../garment-twonodewide) (track 6, `PROJECTS.md`), taking the item "held-out persons and clothing levels (rooms are now covered)" from its next steps. Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Builds on.** `garment-twonodepen` (equal-units swing penalty, tuning, grids), through it `garment-twonodeprop`, `garment-twonodelag`, `garment-twonodeheld`, `garment-twonodemet` and `garment-twonodeoptics` (the two-node model, whose `run` already takes clothing insulation, mass and height). Zhang et al. (2019), cited in `garment-thermal`, motivates the gating idea; the actuators are toys, not models of that textile. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** No new source; none re-read in this run.

## Method
Both gates (on/off hysteresis and proportional ramp, grids of 54 and 72 bands) are tuned on the **baseline** person only: 0.5 clo, 70 kg, 1.7 m, rooms 22, 24, 26 C, each in rest-to-walk and walk-to-rest directions (6 scenarios, step at minute 90 of 180). They are then scored unchanged on six held-out groups with the same rooms and steps: 0.3, 0.8 and 1.2 clo; a small person (50 kg, 1.6 m); a large person (95 kg, 1.85 m); and the large person at 0.8 clo. For each group each gate type is also retuned on that group itself, so the **gap** (baseline-tuned cost minus retuned cost, at least 0 up to grid ties) measures how much tuning fails to transfer. Cost is the discomfort proxy plus penalty times swings, as in `garment-twonodepen`; penalties 0.01 and 0.1 C, lags 0 and 5 min, choice sets "ours" and "ref" (8 cells per group). Exhaustive and deterministic.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest
cd research/garment-twonodeperson
python3 experiments/run.py      # about 2 min; writes experiments/results.txt
python3 experiments/figure.py   # writes experiments/person_gap.svg
python3 -m pytest -q tests      # 4 tests
```

## Results (from `experiments/results.txt`; means over the 8 cells per group)
| held-out group | proportional wins | mean gap, on/off | mean gap, proportional | max gap, on/off | max gap, prop |
|---|---|---|---|---|---|
| 0.3 clo | 5 of 8 | 0.022 | 0.006 | 0.058 | 0.024 |
| 0.8 clo | 8 of 8 | 0.051 | 0.005 | 0.133 | 0.020 |
| 1.2 clo | 8 of 8 | 0.088 | 0.024 | 0.375 | 0.075 |
| 50 kg, 1.6 m | 8 of 8 | 0.000 | 0.000 | 0.002 | 0.000 |
| 95 kg, 1.85 m | 8 of 8 | 0.000 | 0.000 | 0.001 | 0.002 |
| 95 kg, 0.8 clo | 8 of 8 | 0.045 | 0.006 | 0.104 | 0.020 |

- **Body size barely matters; clothing does.** Retuning for a 50 or 95 kg person gains nothing measurable (gaps at most 0.002 C). Retuning for a different clothing level gains up to 0.375 C (on/off at 1.2 clo), so a band belongs to a garment more than to a wearer in this model.
- **The proportional gate transfers better.** Its mean gap is smaller than on/off's in every clothing group (for example 0.005 against 0.051 C at 0.8 clo), and the on/off retuned bands move a lot (33.2-34.2 C at 0.8 and 1.2 clo against 33.6-33.8 C at baseline) while proportional bands stay near 33.6-33.8 C.
- **The proportional edge is not universal.** At 0.3 clo it loses in three of the eight cells, all at penalty 0.1 (by 0.006 to 0.024 C). In the other 40 group-cells it is never worse, and better by up to 0.484 C (some by under 0.001 C, a tie at this resolution).
- Figure: `experiments/person_gap.svg`.

## Limitations
Stylised and preliminary. Same assumptions as `garment-twonodepen`: a metabolic step as the only disturbance, constant humidity and air speed, two assumed transmittances, an assumed penalty scale, a linear-ramp law. Mass and height enter only through body surface area and thermal capacity in the two-node model; age, sex, fitness and acclimatisation do not, which may be why body size changes so little. The cells share a model, so wins are not independent evidence. Differences are hundredths to tenths of a degree on a proxy. Simulated comfort is not a claim about any real garment.

## Next steps
A PI law and a minimum dwell time; a wear model that depends on rate; a gate tuned across a mixture of clothing levels; a full penalty sweep.

## Owner steps
None required. Measuring a real gating textile's range, lag and switching life is an owner step.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and the `garment-twonodepen` code and what it reuses. Transmittances, lags, penalties, body and environment parameters are assumptions from outside this project.
