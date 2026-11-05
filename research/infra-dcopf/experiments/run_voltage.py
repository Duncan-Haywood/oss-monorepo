"""Are the DC dispatch's voltage violations about P, or about the case's fixed voltage setpoints?
Writes experiments/results_voltage.txt. The AC power flow holds PV buses at the case's vm_pu; the
AC OPF may move them inside the band. Three ways to hold the same DC dispatch under AC:
as shipped, setpoints clamped into the bus band, and the best uniform setpoint (grid 0.95..1.06)."""
import copy
import numpy as np
import pandapower as pp
from infra_dcopf import (load_case, scaled, solve_ac, solve_dc, ac_check_of_dispatch,
                         clamp_setpoints, uniform_setpoints, q_balancing_setpoints, q_violations,
                         reactive_redispatch)

LOADS = [0.6, 0.8, 1.0]
GRID = [round(v, 3) for v in np.arange(0.95, 1.0601, 0.005)]

def q_viol(net, dc, vset_net):
    """Generators (and the external grid) whose reactive output is outside [min_q_mvar, max_q_mvar]
    in an AC power flow of the DC dispatch (pandapower does not enforce Q limits by default)."""
    n = copy.deepcopy(vset_net)
    n.gen["p_mw"] = dc.res_gen.p_mw.values
    pp.runpp(n, init="flat", numba=False)
    g = ((n.res_gen.q_mvar < n.gen.min_q_mvar - 1e-6) | (n.res_gen.q_mvar > n.gen.max_q_mvar + 1e-6)).sum()
    e = ((n.res_ext_grid.q_mvar < n.ext_grid.min_q_mvar - 1e-6) | (n.res_ext_grid.q_mvar > n.ext_grid.max_q_mvar + 1e-6)).sum()
    return int(g + e)

def row(tag, c, ac_cost):
    if not c.get("converged"):
        return f"   {tag:18s} AC power flow did not converge"
    return (f"   {tag:18s} v_viol {c['n_bus_v_viol']:2d}  vmin {c['vmin']:.4f}  vmax {c['vmax']:.4f}  "
            f"loss {c['losses_mw']:6.1f} MW  cost above AC opt {100*(c['cost']-ac_cost)/ac_cost:7.3f} %")

if __name__ == "__main__":
    out = open("experiments/results_voltage.txt", "w")
    for name in ("case30", "case39"):
        net = load_case(name)
        for k in LOADS:
            n = scaled(net, k)
            ac, dc = solve_ac(n), solve_dc(n)
            if ac is None or dc is None:
                print(f"{name} load {k}: no solution", file=out, flush=True); continue
            print(f"{name} load {k}  AC opt cost {ac.res_cost:.1f}, vmax at AC opt {ac.res_bus.vm_pu.max():.4f}", file=out)
            print(row("as shipped", ac_check_of_dispatch(n, dc), ac.res_cost) + f"  q_viol {q_viol(n, dc, n)}", file=out)
            print(row("clamped to band", ac_check_of_dispatch(clamp_setpoints(n), dc), ac.res_cost) + f"  q_viol {q_viol(n, dc, clamp_setpoints(n))}", file=out)
            best = None
            for v in GRID:
                c = ac_check_of_dispatch(uniform_setpoints(n, v), dc)
                if c.get("converged") and c["n_bus_v_viol"] == 0 and (best is None or c["cost"] < best[1]["cost"]):
                    best = (v, c)
            print(row(f"uniform {best[0]:.3f}", best[1], ac.res_cost) + f"  q_viol {q_viol(n, dc, uniform_setpoints(n, best[0]))}" if best
                  else "   uniform: no feasible setpoint on the grid", file=out, flush=True)
            # best uniform setpoint that is also Q-feasible
            bq = None
            for v in GRID:
                u = uniform_setpoints(n, v)
                c = ac_check_of_dispatch(u, dc)
                if c.get("converged") and c["n_bus_v_viol"] == 0 and q_viol(n, dc, u) == 0 and (bq is None or c["cost"] < bq[1]["cost"]):
                    bq = (v, c)
            print(row(f"uniform+Qok {bq[0]:.3f}", bq[1], ac.res_cost) + "  q_viol 0" if bq
                  else "   uniform+Qok: no setpoint on the grid satisfies both", file=out, flush=True)
            m, passes, ok = q_balancing_setpoints(n, dc)
            if ok:
                print(row("per-gen Q rule", ac_check_of_dispatch(m, dc), ac.res_cost) + "  q_viol 0", file=out)
            else:
                print(f"   per-gen Q rule     not feasible after {passes} passes (heuristic)", file=out)
            r = reactive_redispatch(n, dc)
            if r is None:
                print("   P-fixed AC OPF     no solution from pandapower (not proof of infeasibility)", file=out, flush=True)
            else:
                vm = r.res_bus.vm_pu
                print(f"   P-fixed AC OPF     feasible  vmin {vm.min():.4f}  vmax {vm.max():.4f}  slack {float(r.res_ext_grid.p_mw.sum()):6.1f} MW  "
                      f"cost above AC opt {100*(r.res_cost-ac.res_cost)/ac.res_cost:7.3f} %", file=out, flush=True)
