# house-schedule-check: an independent second schedule model. Does it agree with house-schedule on what shortens a house build?

(Question as first asked: how much do early ordering, prefabricated panels and fewer handoffs shorten a house build?)

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-schedule-check/

Cross-check for [`house-schedule`](../house-schedule) (track 12, milestone 8), which landed while this was being built, so this is a deliberately separate model (13 tasks, different baseline for ordering, list scheduling) rather than a duplicate. Produced with AI assistance (Claude). Built for the owner's question: how much do sequencing, prefabrication and fewer handoffs cut the build time and the interest paid while it runs?

**Headline (stylised, every input assumed).** In a Monte Carlo schedule of 13 trades and inspections, **ordering the long-lead items (trusses, windows) on day 0 instead of when their predecessor starts cuts the mean build from 205 to 181 calendar days (-11%)**. Prefabricated wall and roof panels alone cut 1.5%, and merging roofing and siding into the framing crew changed nothing (+0.3%, within noise). All three together: 171 days (-17%), and construction-loan interest falls from 1.89% to 1.72% of construction cost. **The size of the handoff gap matters more than any lever tested**: moving it from 0.5 to 5 working days moves the baseline from 184 to 248 days. These are findings about this model and its assumed inputs, not about real builds.

**Agreement with `house-schedule`.** Same ranking in broad terms: early ordering of long-lead items is the biggest lever (here -11%, there -29%); a factory shell or prefab panels help little unless ordering is early too; the handoff gap matters a lot. The sizes differ because the baselines and assumed lead times differ, which is itself the finding: the magnitudes are set by assumptions. We disagree on nothing the two models can both test, but crew-merging was tested only here and did nothing. Neither model is calibrated to data.

**Builds on.** The ideas in `PROJECTS.md` track 12 and the results of `house-schedule`, read for the comparison above only; no code shared. Weather, inspection and lead-time parameters are my assumptions: I did not check them against NAHB, Census Survey of Construction or any builder data in this run, and the NAHB "Cost of Constructing a Home" cycle-time figures were not consulted. It builds on none of the CU Boulder groups in `prompt.md`.

**Not a design, not a schedule for a real house.** Research code; nothing here is reviewed by a licensed professional or a contractor.

## Method
- **Tasks.** 13 tasks (site, foundation, framing, roof, windows, MEP rough, insulation, drywall, siding, finishes, MEP final, exterior, final) with mean durations in working days (`src/house_schedule/model.py`), a precedence graph, a trade per task, one crew per trade (tasks of one trade run one at a time).
- **Randomness.** Duration is Gaussian (sd 25% of the mean, floored at 1 day). Weather-exposed tasks lose a working day with probability 0.15 each, repeatedly (geometric). Five tasks are followed by an inspection: 1 to 3 days wait, 15% chance of failing, then 3 to 5 days of rework and reinspection. Trusses and windows arrive uniformly 15 to 30 and 20 to 45 working days after they are ordered. A crew that is not on site (first call, or idle more than a day) pays an exponential mobilisation gap, mean 2 working days.
- **Scenarios.** *Baseline*: long-lead items are ordered when the last predecessor of the task that needs them starts. *Order early*: ordered at day 0. *Prefab panels*: 60% of framing, roof and window work is moved to a factory that works in parallel with the foundation, which cuts the on-site duration of those tasks by 30% and their weather exposure by 36% (the factory's own time and cost, and transport, are not modelled). *One framing crew*: roofing and siding go to the framing crew.
- **Interest.** Cost is drawn as each task finishes, in proportion to its mean duration (a crude proxy for cost); 8% a year accrues on the drawn balance until the house is done. Land interest is excluded.
- It is a list-scheduling Monte Carlo with resource limits, not an event-queue simulator, and 1 working day is 1.4 calendar days.

## Reproduce
```bash
pip install pytest
cd research/house-schedule-check
python -m pytest -q tests                    # 6 tests
python experiments/run.py > experiments/results.txt   # a few seconds, deterministic
python experiments/figure.py                 # experiments/schedule.svg
```

## Results (from `experiments/results.txt`, 4,000 builds per scenario)
| scenario | mean calendar days | p90 | interest, % of cost |
|---|---|---|---|
| baseline | 205 | 228 | 1.89 |
| order long-lead items day 0 | 181 (-11.4%) | 202 | 1.76 |
| prefab wall/roof panels | 202 (-1.5%) | 225 | 1.91 |
| one framing crew | 205 (+0.3%) | 229 | 1.90 |
| all three | 171 (-16.7%) | 190 | 1.72 |

- **Ordering is the lever, and the baseline decides how big it is.** The 11% exists because the baseline orders windows only when framing starts and the assumed lead times (up to 45 working days) are long against framing's 15. A builder who already orders at the foundation sees less. Treat -11% as an upper-bound illustration, not an estimate.
- **Prefab saves little here** because framing waits on the foundation and on the long-lead items; moving work off site does not help when the site is not the constraint. Its gain is larger together with early ordering (the combination saves more than the sum of parts: -16.7% against -13.2%).
- **Merging crews did nothing**: roofing and siding are not on the critical path in a way a shared crew changes, and the merge saves no mobilisation in this graph. A negative result for this model.
- **Interest is small**: 1.7 to 1.9% of construction cost, so even a 17% shorter build saves 0.17 points. Interest does not make the case for faster builds; carrying the land and the owner's rent or mortgage during the build, not modelled, might.
- **The savings from the all-three package are stable (15 to 18%) across rain 0 to 30%, inspection failure 0 to 30%, handoff gap 0.5 to 5 days and duration noise 10 to 40%** (section B of `results.txt`). The baseline itself is not: the handoff gap alone changes it by 35%.

## Limitations
- **Every parameter is an assumption.** No data from builders, NAHB or the Census was used. Real durations, lead times, inspection regimes and weather vary by place and year.
- **Stylised graph.** Thirteen tasks, one crew per trade, no overlap of trades within a floor, no material delivery or crane constraints, no storeys or house size.
- **Prefab is flattering on time and silent on cost.** Factory time and cost, transport, crane and joints are not modelled; `house-offsite` (milestone 7) should do that.
- **Interest is a proxy**: draws follow task duration, not real draw schedules.
- Life-safety, code and permitting timelines are not checked; no design here is buildable on this project's say-so.

## Next steps
Take task durations and inspection waits from a source (a builder's records or a Census cycle-time table), model storeys and house size, add a discrete-event (SimPy) version, and combine with `house-offsite`.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python standard library only.
