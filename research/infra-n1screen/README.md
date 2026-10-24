# infra-n1screen: does a DC (LODF) screen find the N-1 outages an AC power flow flags?

Track 21 (`infra`), grid first. Grid operators check "N-1 security" (does the system survive losing any one line or transformer?) by screening every outage with a linear DC power flow and only running AC on the flagged ones. This project asks how many of the outages that an AC power flow calls insecure the DC screen never flags, and what extra margin on the screen closes the gap. Produced with AI assistance (Claude). No method transfer from outside power systems; the benchmark use of MATPOWER cases follows the pandapower literature. No CU Boulder group's work is reproduced and no connection is claimed.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/infra-n1screen/

**Headline (modelled in pandapower on five MATPOWER/IEEE cases, every line and transformer outage; not a measured system; results in `experiments/results.txt`).**
- **A plain DC screen misses a real share of insecure outages, and never raises a false alarm at a threshold of 1.0.** At a rating of 25 % above the base-case flow, the screen misses **25 % (case14), 17 % (case30), 13 % (case39), 40 % (case57) and 14 % (case118)** of the outages the AC power flow calls insecure. Its false alarms are 0 to 6 % of what it flags.
- **A margin fixes the misses but costs false alarms.** Flagging when the DC flow exceeds **0.8 of the rating** misses nothing on all five cases (at 25 % headroom). The price is false alarms: 4, 5, 7 and 27 on cases 14, 30, 39 and 57, and **102 on case118, where the screen then flags all 186 outages (84 are truly insecure)**. At 0.9 of the rating the misses are 12 %, 8 %, 3 %, 11 % and 6 %, with 0 to 27 false alarms.
- **The misses are mostly reactive and voltage effects, not losses.** Judging AC by MW alone (what DC computes) the miss rate falls to 20 %, 6.5 %, 8 %, 20 % and 12 % (case14, 30, 39, 57, 118; one headroom, 25 %). The rest of the gap is MVA overloads from reactive flow and new voltage-band violations.
- **Ranking is better than flagging.** Of the 10 worst AC overloads, the DC ranking has 8 to 10 in its own top 10 on four cases and 5 on case57 (recall@10 = 0.8, 0.9, 1.0, 0.5, 0.9).
- **The miss rate climbs as ratings loosen** (fewer outages are insecure): at 100 % headroom the screen misses 53 to 68 % on cases 14, 30, 57 and 118, 14 % on case39 (not monotone there). I did not test why the remaining ones are missed beyond the MW-only split above.

## Method (`src/infra_n1screen/n1.py`)
- **Cases.** `case14`, `case30`, `case39`, `case57`, `case118` from `pandapower.networks` (MATPOWER). The case's own dispatch, no re-optimisation after an outage (no corrective action; that is the preventive-security question, next steps).
- **Truth.** For each of the 20 to 186 branches (lines and two-winding transformers), take it out of service and run an AC power flow (`runpp`). A non-converged AC solve counts as insecure (6 on case57; see limits).
- **Screen.** The same outage run through `rundcpp`, which is the LODF/PTDF linear screen (a closed-form 3-bus check is in the tests). A branch is overloaded if its DC MW flow exceeds `screen_margin` x rating.
- **Insecure** (AC truth) = any other branch's MVA over its rating, a bus that was inside the voltage band at base and is now outside, or non-convergence.
- **Ratings are swept, not taken from the cases.** pandapower's `max_i_ka` limits never bind on case118 (see `infra-dcopf`), so rating = (1 + headroom) x max(base-case MVA, 10 % of the largest base flow), with headroom 0.1, 0.25, 0.5, 1.0. Nothing about which headroom a real operator uses is claimed; the conclusion is read across the sweep.
- **Voltage.** Only a *new* violation counts: case57 starts with 39 buses outside 0.94 to 1.06 pu and case14 and case39 with 3 and 1, so counting base-case violations would call everything insecure (the first run of this project did exactly that and was discarded; the test `test_base_case_voltage_violations_are_not_counted...` guards it).

## Checks (`tests/`, 7)
A 3-bus triangle with equal reactances gives the DC flows 30/30/60 MW and, after the direct line is lost, 90 MW on the remaining path (closed form); AC and DC agree on that lossless unit-voltage triangle within 0.5 %; an islanding outage never returns a false 10 MW flow; rating floor and headroom arithmetic; the screen's confusion counts partition the outages on case14; recall@k bounds; the base-voltage rule above.

## Limitations
- **Single-branch outages, base dispatch only.** No generator or double outages, no unit commitment, no post-contingency redispatch or tap/switching action, which is what real N-1 studies allow.
- **Ratings are a sweep (assumed).** Different cases have different real margins; read the trend across headroom, not one cell. Short-term emergency ratings are not modelled.
- **The DC base is the case's dispatch, with the slack absorbing the lossless mismatch;** part of the DC/AC difference is that, not the outage itself. I did not separate it.
- **AC non-convergence is treated as insecure.** It happens on 6 of 80 outages on case57 only; pandapower's solver failing is not proof the grid would collapse, and it sits in the miss and TP counts accordingly.
- **Small samples:** 20 to 186 outages per case; percentages from 20 outages move by 5 points per outage. The result is a benchmark, not a statement about any real system.
- Safety-critical note: research on a benchmark. Any operational security assessment needs the system operator and licensed engineers.

## Next steps
1. Add post-contingency redispatch (a security-constrained OPF) and see how many of these "insecure" outages disappear with preventive action.
2. Replace pandapower's DC solve with a true PTDF/LODF matrix screen on `case300` and time it against the AC loop (the reason the screen exists).
3. Learn the screen: a small model of AC overload from the DC flow and the outage's reactive loading, scored by miss rate at equal false alarms.

## Reproduce
```bash
pip install pytest numpy pandapower
cd research/infra-n1screen
python -m pytest -q tests                     # 7 tests, about 10 s
PYTHONPATH=src python experiments/run.py      # about 1 min; writes experiments/results.txt
```

## References
(Not looked up in this run; check before citing.)
- Thurner, L. et al. (2018), pandapower, *IEEE Trans. Power Systems* 33(6), doi:10.1109/TPWRS.2018.2829021.
- Zimmerman, R. D., Murillo-Sanchez, C. E., Thomas, R. J. (2011), MATPOWER, *IEEE Trans. Power Systems* 26(1), doi:10.1109/TPWRS.2010.2051168.
- Stott, B., Jardim, J., Alsac, O. (2009), DC power flow revisited, *IEEE Trans. Power Systems* 24(3), doi:10.1109/TPWRS.2009.2021235.

## Outside dependencies
Python, numpy and pandapower (pip). The cases are MATPOWER's, shipped in pandapower. No data or services.
