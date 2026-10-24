# selfrep-terminal: how does a resale value for the finished fleet move the switch from copies to goods?

Follow-up to `selfrep-reinvest` and `selfrep-singulararc` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking the "terminal fleet value" next step that both list. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-terminal/

**Builds on.** `research/selfrep-reinvest` (its fluid fleet model and `run` simulator, imported by relative path, not copied) and `research/selfrep-growth` (the per-copy work `W` = 50.0 h and vitamin cost `V` = 170.3, imported), which come from `research/selfrep-closure` (RepRap Prusa Mendel; Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). The question follows von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. No paper's result is reproduced or compared; the only theory is the elementary calculation below. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Model.** The `selfrep-reinvest` model with cash free: fleet `N`, copy share `u`, `N' = k u N` with `k = (1 - fail)/W`, goods worth `a` per machine-hour. New: the objective adds `s` per machine left at the horizon `T`, an assumed resale or scrap value.
- **Closed form.** Copy flat out until `ts`, then make goods: `J(ts) = N0 e^(k ts) [a (T - ts) + s]`. Setting `dJ/dts = 0` gives `T - ts = 1/k - s/a`, and the second derivative is negative, so this is the maximum. The goods phase shrinks from one e-folding time `1/k` by `s/a`. If `s >= a/k` the derivative is never negative on `[0, T]`, so the shop copies until the end. This is elementary calculus of the switch, not a new result, and it assumes the copy-then-switch structure found in `selfrep-reinvest`; it does not prove that no other policy beats it here.
- **Numerics.** `src/selfrep_terminal/model.py` evaluates `J` with the `selfrep-reinvest` Euler simulator (step 0.25 h) plus `s N_T`, and grid-searches the switch time at 1 h resolution.

## Reproduce
```bash
cd research/selfrep-terminal
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # about 20 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; horizon T = 600 h, a = 1 per machine-hour, all assumed)
- **The grid switch matches the closed form.** For failed-build shares 0, 0.2 and 0.4 and `s` from 0 to 1.5 a/k, the grid optimum is within 1 h of `T - 1/k + s/a`. For zero failures `ts` = 550, 555, 562, 575, 600 h for `s` = 0, 5, 12.5, 25, 50 per machine.
- **The threshold is one e-folding time of goods.** The shop never switches once `s >= a/k`: 50.0 per machine with no failures, 62.5 at 20% failures, 83.3 at 40%. As shares of the assumed vitamin cost `V` = 170.3 that is 29%, 37% and 49%. A machine that resells for more than that is worth building until the last hour.
- **Ignoring the terminal value costs real value.** Switching at the `s = 0` time (550 h, no failures) when the fleet is worth `s` = 12.5, 25, 50 achieves 97.4%, 91.1% and 73.8% of the optimum.
- **Euler error.** At 0.25 h the simulated optimum is 97.1-97.3% of the analytic value at zero failures (98.1-99.1% with failures). It scales the absolute values and not the location of the optimum, as in `selfrep-reinvest`.

## Limitations
- **Every input is assumed**, including `s`, which is a fraction of `a/k` here and not a measured resale price. `a`, `W`, `V` and the failure shares are as in earlier projects and equally assumed. The numbers show the shape (shorter goods phase, threshold at `a/k`), not forecasts.
- Fluid model with a free-cash assumption: no cash constraint, unlimited goods demand at a fixed price, homogeneous fleet, no wear-out. A resale market would also saturate (`selfrep-satmarket` does this for goods, not for machines).
- A terminal value linear in `N` keeps the problem linear in the control, so the bang-bang structure is built in. Only the copy-then-switch family is checked numerically; there is no dynamic-programming certificate for this objective.
- The fleet is valued at `s` per machine whatever its age or condition.

## Next steps
Combine the terminal value with the saturating market of `selfrep-satmarket` (DP with a terminal reward); give the terminal value a cash-constraint (two-state) version; replace the linear `s` with a resale price that falls with the number of machines offered.

## Owner steps
- Find the real resale value of a used RepRap-class printer (with a source and date for each price) and set `s` from it.
- Replace the assumed goods value `a` with the price the shop's goods fetch, as for `selfrep-reinvest`.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-reinvest`, `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printers it describes are those of `selfrep-closure`.
