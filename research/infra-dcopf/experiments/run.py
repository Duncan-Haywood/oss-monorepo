"""Sweep load level and branch-limit factor on three cases; write results.txt."""
import sys, time
from infra_dcopf import CASES, load_case, compare

LOADS = [0.6, 0.8, 1.0, 1.1]
LIMITS = [1.0, 0.7, 0.5]


def fmt(x, w=9, d=1):
    return f"{x:{w}.{d}f}" if x is not None else " " * (w - 3) + "n/a"


if __name__ == "__main__":
    out = open("experiments/results.txt", "w")
    hdr = ("case    load  lim   AC_cost    DC_cost  DC-AC%   DCinAC_cost  excess%  Vviol  Lover  maxL%   vmax   loss_MW")
    print(hdr, file=out)
    rows = {}
    for name in CASES:
        net = load_case(name)
        for f in LIMITS:
            for k in LOADS:
                t = time.time()
                r = compare(net, k, f)
                d = r.get("dc_in_ac", {})
                if r["ac_cost"] is None or r["dc_cost"] is None:
                    print(f"{name:7s} {k:4.2f} {f:4.2f}  ac_opf={'ok' if r['ac_cost'] is not None else 'no solution'} dc_opf={'ok' if r['dc_cost'] is not None else 'no solution'}", file=out, flush=True)
                    continue
                gap = 100 * (r["dc_cost"] - r["ac_cost"]) / r["ac_cost"]
                if d.get("converged"):
                    ex = 100 * (d["cost"] - r["ac_cost"]) / r["ac_cost"]
                    rows.setdefault((name, f), []).append((k, gap, ex, d["n_bus_v_viol"]))
                    tail = f"{d['cost']:12.1f} {ex:8.3f} {d['n_bus_v_viol']:6d} {d['n_line_over']+d['n_trafo_over']:6d} {d['max_line_loading']:6.1f} {d['vmax']:6.3f} {d['losses_mw']:8.1f}"
                else:
                    tail = "  AC power flow of DC dispatch did not converge"
                print(f"{name:7s} {k:4.2f} {f:4.2f} {r['ac_cost']:9.1f} {r['dc_cost']:10.1f} {gap:7.2f} {tail}", file=out, flush=True)
                print(name, k, f, round(time.time() - t, 1), "s", flush=True)

    for (name, f), rs in rows.items():
        if f == 1.0 and name != "case30":
            print(f"\n== {name}, limits x1.00: load, DC-minus-AC OPF cost %, AC cost of DC dispatch above AC optimum %, buses out of voltage limits", file=out)
            for k, gap, ex, v in rs:
                print(f"{k:5.2f} {gap:8.2f} {ex:8.3f} {v:4d}", file=out)
