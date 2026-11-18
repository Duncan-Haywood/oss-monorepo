"""Stale penalty factors at the steepest real ramps (next step 2 of the README).

Factors from the AC optimum L hours earlier (L = 1, 3, 6, 12, 24) are applied to hour h.
For each L, h is the N_RAMP hours of 2017 with the largest |k(h) - k(h-L)| in the AEP shape
(scaled so the year's peak is PEAK_K of case118's load), the worst case for ageing.
Metric as in run_hourly_profile.py: AC cost of the dispatch above the AC optimum of hour h.
Writes experiments/results_stale_factors.txt."""
import statistics as st
from infra_dcopf import (load_case, scaled, solve_ac, solve_dc, ac_check_of_dispatch,
                         ac_optimum_penalty_dc, previous_interval_penalty_dc)
from run_hourly_profile import profile, PEAK_K

LAGS = [1, 3, 6, 12, 24]
N_RAMP = 10

def excess(nc, s, ac):
    c = ac_check_of_dispatch(nc, s) if s is not None else {}
    return 100 * (c["cost"] - ac.res_cost) / ac.res_cost if c.get("converged") else float("nan")

if __name__ == "__main__":
    prof = profile()
    keys = sorted(t for t in prof if t.startswith("2017"))
    net = load_case("case118")
    cache = {}
    def ac_at(t):
        if t not in cache:
            nc = scaled(net, prof[t]); cache[t] = (nc, solve_ac(nc))
        return cache[t]
    out = open("experiments/results_stale_factors.txt", "w")
    print(f"case118, AEP 2017 shape (peak k={PEAK_K}); excess AC cost over AC optimum (%) at the {N_RAMP} steepest L-hour ramps", file=out)
    print("lag_h  dk  hour  plain%  stale%  oracle%", file=out)
    summ = {}
    for L in LAGS:
        cand = sorted(((abs(prof[keys[i]] - prof[keys[i - L]]), keys[i], keys[i - L]) for i in range(L, len(keys))), reverse=True)
        chosen = []
        for d, t, tp in cand:                      # spread out: skip hours within 3 h of one already taken
            if all(abs(keys.index(t) - keys.index(c[1])) > 3 for c in chosen):
                chosen.append((d, t, tp))
            if len(chosen) == N_RAMP: break
        rows = []
        for d, t, tp in chosen:
            nc, ac = ac_at(t); ncp, acp = ac_at(tp)
            if ac is None or acp is None:
                print(f"{L} {d:.3f} {t} no AC solution", file=out, flush=True); continue
            dc = solve_dc(nc); orc, _ = ac_optimum_penalty_dc(nc, ac)
            sv, _ = previous_interval_penalty_dc(nc, acp, ncp)
            e = [excess(nc, s, ac) for s in (dc, sv, orc)]
            print(f"{L} {d:.3f} {t} {e[0]:7.3f} {e[1]:7.3f} {e[2]:7.3f}", file=out, flush=True)
            rows.append(e)
        summ[L] = rows
    print("\nsummary: mean over converged hours (plain, stale, oracle), n", file=out)
    for L, rows in summ.items():
        ok = [r for r in rows if all(x == x for x in r)]
        if ok:
            m = [st.mean(r[j] for r in ok) for j in range(3)]
            print(f"lag {L} h: {m[0]:.3f} {m[1]:.3f} {m[2]:.3f} n={len(ok)}", file=out)
    out.close()
