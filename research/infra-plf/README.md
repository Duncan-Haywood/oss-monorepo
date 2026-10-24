# infra-plf: do nodal loss penalty factors repair the DC OPF's merit order on the IEEE 30-, 39- and 118-bus cases?

Track 21 (`infra`), grid first. Follow-up to [`infra-dcopf`](../infra-dcopf) (its next step 2): a lossless DC OPF orders generators by raw marginal cost, and a uniform loss share fixed the price level but only 13 to 32 % of the excess cost of the dispatch. The classical fix is a nodal penalty factor per generator, PF_i = 1/(1 &minus; &part;Loss/&part;P_i) (Wood and Wollenberg, *Power Generation, Operation and Control*, ch. 13). This project takes the sensitivities from the AC power flow by finite difference, re-solves the DC OPF with each generator's cost scaled by its penalty factor, and scores the dispatch by an AC power flow at the original costs against the AC OPF. Produced with AI assistance (Claude). No CU Boulder group's work is reproduced and no connection is claimed.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/infra-plf/

**Headline (pandapower MATPOWER cases, modelled not measured; `experiments/results.txt`; cost of each dispatch under AC minus the AC optimum, % of AC optimum).**
- **IEEE 118-bus:** penalty factors cut the excess of plain DC at 0.6, 0.8 and 1.0 of load (0.73 to 0.56 %, 0.75 to 0.46 %, 1.48 to 0.97 %), recovering 23 to 38 %, against 13 to 32 % for the uniform share. At 1.1 of load they are **worse** than both (2.45 % against 1.68 % plain and 1.15 % uniform).
- **They do not converge there.** At 0.8, 1.0 and 1.1 of load the damped fixed-point iteration hit its 20-pass cap with the dispatch still moving by 2.5, 62 and 75 MW per pass. The 1.0 and 1.1 rows are therefore the cost of a point on an oscillation, not a fixed point; only 0.6 (8 passes, 0.04 MW) is converged on this case.
- **IEEE 30- and 39-bus:** differences from plain DC are within 0.1 % of cost and change sign (case30 recovers 67 and 48 % at 0.6 and 0.8 of load and is worse at 1.0; case39 recovers &minus;34, 74 and 28 %), so no ranking is supported. Voltage violations are identical to plain DC (case39: 15, 5, 1 buses).
- **Reading:** nodal factors help modestly where the iteration converges, but they are no repair of the merit order on this benchmark: the remaining gap is cost curves that are nearly flat in the penalty range, which makes the linearisation unstable, and reactive limits that no loss factor touches.

## Method (`src/infra_plf/plf.py`)
Cases, load scaling (0.6, 0.8, 1.0, 1.1, P and Q together) and the AC-check of a dispatch are as in `infra-dcopf`. Per pass: AC power flow at the current dispatch; &part;Loss/&part;P_i by raising generator i by 1 MW (slack absorbs); cost curve of generator i scaled by 1/(1 &minus; s_i); last AC losses added to load uniformly; DC OPF solved; next linearisation point is the mean of old and new dispatch (damping 0.5, because with undamped passes a two-generator linear-cost case oscillated between two extremes). Stop when the dispatch moves under 0.05 MW or after 20 passes. The slack has s = 0.

## Checks (`tests/`, 3)
A three-bus case where the cheap source sits on an 80 km line and the dearer one beside the load: the near generator's sensitivity is negative and the penalty-factor dispatch costs less under AC than plain DC and no less than the AC optimum; on case118 the penalty-factor dispatch is no worse than plain DC and not below the AC optimum.

## Limitations
- Non-converged rows (above) are reported as found. A different damping, a trust region or a Newton step on the factors might converge; not tried.
- The 1.1 rows of case30 and case39 returned no AC OPF solution; non-convergence is not separated from infeasibility.
- Branch limits do not bind on case118, so this is a losses-only study; LMPs and congestion rent are untouched (`infra-dcopf` next step 1).
- Finite difference at 1 MW; one solver; benchmark cases' own costs, not market prices. Research only: operational dispatch needs the operator and licensed engineers.

## Next steps
1. A converging scheme (adaptive damping or a Newton step on the factors) to see whether 1.0 and 1.1 of load on case118 repair or stay worse.
2. Locational marginal prices with the factors on a case whose limits bind.
3. Voltage-band constraints for case39.

## Reproduce
```bash
pip install pytest numpy pandapower
cd research/infra-plf
python -m pytest -q tests                  # 3 tests, about 10 s
PYTHONPATH=src python experiments/run.py   # tens of minutes without numba; writes experiments/results.txt
```

## References
- Wood, A. J., Wollenberg, B. F., Sheble, G. B., *Power Generation, Operation and Control*, Wiley (book; edition not checked, no DOI).
- Thurner, L. et al. (2018), pandapower, *IEEE Trans. Power Systems* 33(6), doi:10.1109/TPWRS.2018.2829021.
- Zimmerman, R. D., Murillo-Sanchez, C. E., Thomas, R. J. (2011), MATPOWER, *IEEE Trans. Power Systems* 26(1), doi:10.1109/TPWRS.2010.2051168.
- [`infra-dcopf`](../infra-dcopf) (this repository).

## Outside dependencies
pandapower and the MATPOWER case data it ships.
