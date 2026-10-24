"""Plain DC, uniform-loss DC and penalty-factor DC against the AC OPF; writes experiments/results.txt."""
from infra_plf import CASES, load_case, scaled, solve_ac, solve_dc, ac_eval, uniform_dc, plf_dc

LOADS = [0.6, 0.8, 1.0, 1.1]

if __name__ == "__main__":
    out = open("experiments/results.txt", "w")
    print("case    load  AC_cost   plain%  uniform%  plf%  plf_recovered%  passes  maxdPdisp_MW  Vviol_plain Vviol_unif Vviol_plf", file=out)
    for name in CASES:
        net = load_case(name)
        for k in LOADS:
            n = scaled(net, k)
            ac, dc, un = solve_ac(n), solve_dc(n), uniform_dc(n)
            if ac is None or dc is None or un is None:
                print(f"{name:7s} {k:4.2f} no solution", file=out, flush=True); continue
            sol, hist, s = plf_dc(n)
            if sol is None:
                print(f"{name:7s} {k:4.2f} PLF no solution", file=out, flush=True); continue
            cs = [ac_eval(n, x.res_gen.p_mw.values) for x in (dc, un, sol)]
            if any(c is None for c in cs):
                print(f"{name:7s} {k:4.2f} AC power flow did not converge", file=out, flush=True); continue
            e = [100 * (c["cost"] - ac.res_cost) / ac.res_cost for c in cs]
            rec = 100 * (abs(e[0]) - abs(e[2])) / abs(e[0]) if e[0] else float("nan")
            print(f"{name:7s} {k:4.2f} {ac.res_cost:9.1f} {e[0]:7.3f} {e[1]:8.3f} {e[2]:6.3f} {rec:12.1f} {len(hist):6d} {hist[-1][1]:10.3f} {cs[0]['n_bus_v_viol']:8d} {cs[1]['n_bus_v_viol']:8d} {cs[2]['n_bus_v_viol']:8d}", file=out, flush=True)
