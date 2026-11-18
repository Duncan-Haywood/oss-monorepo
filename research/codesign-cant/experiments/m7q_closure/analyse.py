"""Milestone 7q: summarise results.json (or results_sizing.json with SIZING_ONLY=1) into results.txt / results_sizing.txt."""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = "_sizing" if os.environ.get("SIZING_ONLY") == "1" else ""
R = json.load(open(os.path.join(HERE, f"results{SFX}.json")))
RUNS, GRID, CL = R["runs"], R["grid"], list(R["closures"])
LABS = ["7e", "7l t45 cap wide", "aware cap wide", "aware cap wide fixL"]
GEOMS = sorted({r["geom"] for r in RUNS})
FLIGHTS = "own_inh_dead_45_2" in RUNS[0]


def ok(r, key, j=0):
    return r[f"{key}_rho"][j] < 1.0 and r[f"{key}_feasible"][j]


def main():
    L = [f"Milestone 7q: the 48 fixed designs under six sizing closures (inh60 = inherited constants and 60-step iteration, as run so far; inh = same constants solved exactly; bat, mot, eff = one sourced constant each; src = all three, LiPo; src_li = all three, Li-ion).",
         f"Closures: " + "; ".join(f"{k}: WH_KG {v['WH_KG']:.1f}, motor {v['MOTOR_K']:.4f} (T/9N)^{v['MOTOR_EXP']:.3f}, FM*ETA {v['FM'] * 0.75:.3f}, {v['SIZE_SOLVE']}" for k, v in R["closures"].items()),
         f"'ok' = margin test passed and feasible (clearance, $300 cap). Held-out {R['test_ep']} episodes, seed {R['test_seed']}, cap on; dead summed over ok seeds." if FLIGHTS else "Sizing only (no flights).",
         ""]
    for g in GEOMS:
        for lab in LABS:
            rs = [r for r in RUNS if r["label"] == lab and r["geom"] == g]
            L.append(f"[{g}, {lab}] {len(rs)} seeds, own L mean {np.mean([r['L0'] for r in rs]):.4f} m, D mean {np.mean([r['D'] for r in rs]):.4f} m")
            L.append("  own L   closure  ok  mass kg  motor g  batt Wh  hover W  cost $  gain(median, range) emax min (median, range)" + ("   L1-45 dead  J    L2-20  L2-45  L3-20" if FLIGHTS else ""))
            for c in CL:
                k = f"own_{c}"
                row = (f"           {c:7s} {sum(ok(r, k) for r in rs)}/{len(rs)}  {np.mean([r[k + '_mass'][0] for r in rs]):6.3f}  {1000 * np.mean([r[k + '_motor'][0] for r in rs]):6.1f}"
                       f"  {np.mean([r[k + '_wh'][0] for r in rs]):6.1f}  {np.mean([r[k + '_power'][0] for r in rs]):6.0f}  {np.mean([r[k + '_cost'][0] for r in rs]):6.0f}"
                       f"  {np.median([r[k + '_gain'][0] for r in rs]):6.2f} ({min(r[k + '_gain'][0] for r in rs):.2f}-{max(r[k + '_gain'][0] for r in rs):.2f})"
                       + (f"  {np.median([r[k + '_emax'] for r in rs]):5.1f} ({min(r[k + '_emax'] for r in rs):.1f}-{max(r[k + '_emax'] for r in rs):.1f})" if k + "_emax" in rs[0] else "  " + " " * 18))
                if FLIGHTS:
                    good = [r for r in rs if ok(r, k)]
                    row += (f"   {sum(r[k + '_dead_45_1'][0] for r in good):4d} {np.median([r[k + '_J_45_1'][0] for r in good]) if good else float('nan'):6.3f}"
                            + "".join(f"  {sum(r[k + '_dead_' + t][0] for r in good):5d}" for t in ("20_2", "45_2", "20_3")))
                L.append(row)
            L.append("  grid    " + "   ".join(f"{c:>6s}: ok mass   pow" + ("  L2-45" if FLIGHTS else "") for c in ("inh60", "inh", "src_li")))
            for j, x in enumerate(GRID):
                row = f"  {x:.3f}  "
                for c in ("inh60", "inh", "src_li"):
                    k = f"grid_{c}"
                    row += f"   {sum(ok(r, k, j) for r in rs)}/{len(rs)} {np.mean([r[k + '_mass'][j] for r in rs]):6.3f} {np.mean([r[k + '_power'][j] for r in rs]):5.0f}"
                    if FLIGHTS:
                        row += f"  {sum(r[k + '_dead_45_2'][j] for r in rs if ok(r, k, j)):5d}"
                L.append(row)
            L.append("")
    if FLIGHTS:
        L.append(f"wall time {R['seconds']:.0f} s")
    open(os.path.join(HERE, f"results{SFX}.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
