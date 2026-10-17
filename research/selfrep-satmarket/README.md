# selfrep-satmarket: when the goods market saturates, does the replicating shop's bang-bang switch turn smooth?

Follow-up to `selfrep-reinvest` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking two of that project's listed next steps: a saturating goods market, and a dynamic-programming solution to certify the local-search policies. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-satmarket/

**Builds on.** `research/selfrep-reinvest` (its fluid fleet model and policy families; imported for a test, not copied) and `research/selfrep-growth` (the per-copy work `W` = 50.0 h, imported), which come from `research/selfrep-closure` (RepRap Prusa Mendel; Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). Backward dynamic programming is the method of Bellman (1957), *Dynamic Programming*, Princeton University Press. The question follows von Neumann (1966) and Freitas and Merkle (2004). No paper's result is reproduced. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Model** (`src/selfrep_satmarket/model.py`, standard library). Fleet size `n` (continuous), copy share `u` in [0, 1], growth `n' = k u n` with `k = (1 - fail)/W`. The rest of the fleet makes goods at `g = (1 - u) n` machine-hours per hour, and revenue is concave: `R(g) = a c (1 - exp(-g/c))`, with market capacity `c` (machine-hours per hour) and `a` = 1. As `c` grows this is the linear market of `selfrep-reinvest` (a test checks that the two models give the same bang-bang values). Cash never binds. Objective: total revenue over T = 600 h, final fleet worth nothing, Euler step 1 h shared by every policy.
- **Policies.** Best bang-bang switch (grid, step 1 h); best constant `u`; best logistic ramp; a 20-segment piecewise policy improved by coordinate ascent from the best bang-bang (local search, a lower bound); and the **DP policy**.
- **DP.** Backward induction `V_t(n) = max_u [R((1-u) n) dt + V_(t+dt)(n(1 + k u dt))]` on a fleet grid uniform in `log n` (400 points from 1 to the largest Euler-reachable fleet) and 21 values of `u`, with linear interpolation. The reported DP policy is the feedback rule read from the table and then simulated with the same Euler scheme as the others, so its J is directly comparable. The table's own value `V0` differs from that J by the interpolation error, shown in the results.
- Every input (`a`, `c`, failure rate, `W`) is an assumption of this project; `c` is swept because no real market capacity is known.

## Reproduce
```bash
cd research/selfrep-satmarket
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, <1 s (needs ../selfrep-reinvest)
python3 experiments/run.py                                # about 40 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; percentages are of the simulated DP policy's goods value)
- **The linear case is bang-bang, as before.** At `c` = infinity the DP policy copies until t = 550 h with a one-step interior control, and the best bang-bang switch (549 h) equals it to the printed precision. The best smooth ramp is 99.7%.
- **Saturation spreads the switch out.** Fleet size without any switch would reach about 163 000 units. For `c` = 10^6 and 10^5 the optimum is still nearly bang-bang (bang-bang 99.99% and 99.4%, with 3 and 21 h of interior control). From `c` = 10^4 downward the DP policy ramps the copy share down over 90 to 300 h (e.g. at `c` = 1000, u = 1.00 at t = 300 h, 0.95 at 350 h, 0.46 at 400 h, 0.30 at 450 h, 0.15 at 500 h, 0.00 at 550 h), and the best bang-bang reaches 93 to 95.5% of the DP policy's value. The switch comes earlier too: copying below half time from t = 492 h at `c` = 10^4 and from 287 h at `c` = 100.
- **A smooth ramp recovers most of the gap, a fixed ramp shape does not recover all of it.** The best logistic ramp reaches 98.5 to 99.1% for `c` between 100 and 10^4; the 20-segment local search 99.3 to 99.7%. The best constant split is 24% of the DP value at `c` = 10^4, 57% at 1000 and 78% at 100: less bad as the market saturates, still far behind.
- **Failures sharpen the switch again.** At `c` = 1000, bang-bang is 95.6% / 99.5% / 99.99% of the DP policy at 20% / 40% / 60% failed builds, with 108 / 32 / 6 h of interior control, because a slower-growing fleet reaches the saturating region later.
- **DP certification and its error.** The DP policy is at least as good as every other policy in every row (largest margin 6.7% over bang-bang) except where the others tie it at the printed precision. The table value `V0` is within 0.3% of the simulated policy value for 3000 ≤ `c` ≤ 10^4 and at `c` = 100 to 1000 with no failures, up to 1.0% in the failure sweep, but 2.8 to 5.6% above it for `c` ≥ 10^5, where the value function is steep and the linear interpolation is coarse. Table 3 shows the policy J moving by less than 0.01% between 200 and 800 grid points at `c` = 1000. The DP optimum is the optimum of the discretised problem (grid in `n` and `u`), not a proof about the continuous one.

## Limitations
- Stylised. All parameters are assumed; the saturation form `a c (1 - exp(-g/c))` is a convenient concave choice, not a market measurement, and a different concave form (or a falling price) would move the numbers. The findings are shapes: bang-bang is optimal when revenue is linear, an interior ramp appears when the fleet grows large relative to the market, and the sharpness returns with slow growth.
- Cash never binds, so vitamin costs and imports are not in this model (see `selfrep-reinvest` for those). Homogeneous printer fleet, continuous fleet size, no demand growth, no terminal fleet value.
- DP error is a few tenths of a percent where the DP is accurate and several percent in the near-linear rows, as above. Margins smaller than that should not be read as a ranking.
- No Pontryagin analysis of the singular arc is given; the interior ramp is shown numerically only. No comparison with Lackner and Wendt (1995), which has not been read for this project.

## Next steps
Combine saturation with the cash constraint of `selfrep-reinvest` (a two-state DP); add a terminal fleet value; derive the singular-arc condition and compare it with the DP ramp; a falling-price market in place of the exponential form.

## Owner steps
- Estimate the real demand curve for printed goods the shop could sell (price against quantity) and replace `c`.

## Outside dependencies (vitamins)
Python standard library only. The printer's own vitamins are those listed in `selfrep-closure`.
