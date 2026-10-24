# house-season: does the month a house build starts change how long it takes and the interest paid?

A project of track 12, open-source residential construction (`PROJECTS.md`, milestone 8; the seasonal calendar is a next step named by `house-schedule`). It replaces `house-schedule`'s flat 15% weather loss with a monthly calendar and a cold-weather concrete cure, and starts the same Monte Carlo build in each of the twelve months. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-season/

**Headline (stylised, the weather numbers are my assumptions).** With cold winters, **a December start takes 231 working days against 211 for July: a swing of about 20 days, or 0.3 percentage points of the price in interest (3.27% against 2.99%)**. With a mild climate the swing is 4 days. **Ordering materials at day 0 saves about 63 days in every month, so the start month and the ordering lever add instead of interacting**: the seasonal penalty is the same size with or without it (22 days against 20). Starting in April or September in the cold climate costs about what the flat 15% model predicts (+0.7 d); the flat model hides the winter penalty and slightly overstates summer.

**Builds on.** [`house-schedule`](../house-schedule), whose tasks, crews, inspections, lead times, interest formula and random draws are reused unchanged (the code imports it; with a flat climate it reproduces its numbers exactly, and a test checks that). No weather data was consulted. It builds on none of the CU Boulder groups in `prompt.md`.

**Not a design, not a schedule for a real house.** Research code. The monthly loss fractions and cold-cure stretches are shaped like a cold-winter and a mild climate but are assumptions, not measurements of any place. Nothing here has been reviewed by a licensed professional.

## Method
- `src/house_season/model.py` copies `house_schedule.simulate`'s loop with two changes: an exterior task's weather loss is the climate's loss for the calendar month it starts in, and the 7-day concrete cure is stretched by a monthly cold factor (up to +100% in January in the cold climate).
- Working days convert to calendar days at 7/5. A build starts on the 1st of the month.
- Climates: `cold` (loss 40% in January to 8% in July, annual mean 20%), `mild` (18% to 10%, mean 13%), and `flat` (15% every month, `house_schedule`'s model).
- 3,000 builds per start month, common random numbers across months and climates, with and without ordering all materials at day 0.

## Reproduce
```bash
pip install pytest
cd research/house-season
python -m pytest -q tests                      # 6 tests
python experiments/run.py > experiments/results.txt   # under a minute, deterministic
python experiments/figure.py                   # experiments/season.svg
```

## Results (from `experiments/results.txt`, working days)
| start | cold: mean | cold: interest, % of price | mild: mean |
|---|---|---|---|
| Jan | 229.9 | 3.25 | 215.7 |
| Apr | 214.4 | 3.03 | 212.4 |
| Jul | 211.4 | 2.99 | 211.8 |
| Oct | 219.4 | 3.10 | 213.1 |
| Dec | 231.3 | 3.27 | 215.5 |

The flat-15% baseline is 213.7 days (3.02%).
- **Winter starts cost days; summer starts barely help.** The best cold-climate start (July) is 2.3 days under the flat model; the worst (December) 17.6 over. The penalty is lopsided because losses are convex in the loss rate and the winter months are far from the mean.
- **The cure matters less than the framing and siding months.** Exterior tasks that start in the cold are stretched by `w/(1-w)`; the cure stretch alone is at most 7 extra days and happens only in the first weeks.
- **Ordering early shifts every month by the same amount** (gain 60 to 64 days). The ordering lever neither fixes nor worsens the seasonal one in this model.
- **The start month is a free lever**: if a buyer can pick when to break ground, avoiding November to February in a cold climate is worth about two weeks at no cost, in this model.

## Limitations
The loss fractions are assumed, not taken from weather records; real winters also stop interior work through heat and utilities and delay inspections, none of which is modelled. A loan structure other than a flat 8% draw would change the interest. Seasonal labour and material prices are ignored (lumber and labour are often dearer in building season, which could offset the winter penalty). One model of one house, uncalibrated; the sizes are set by my assumptions, and the shape (winter hurts, ordering is additive) is the only finding I would defend.

## Next steps
Replace the assumed monthly fractions with sourced precipitation and freeze-day counts for named climate zones (NOAA normals) and report which zones need the winter penalty at all; add seasonal price multipliers and see whether they cancel the penalty; let permit wait and inspector availability vary by month.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python standard library, `house-schedule` (this repository) and `pytest` for tests. No weather data, no prices.
