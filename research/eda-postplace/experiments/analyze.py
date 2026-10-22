"""Rank agreement, wire penalty, timing closure and winners, pre-layout vs placed. Reads placed.json; writes results.txt.
Run: PYTHONPATH=../src python analyze.py"""
import json
from pathlib import Path
from eda_postplace import analysis as A

D = Path(__file__).resolve().parent
J = json.load(open(D / "placed.json"))
lab = lambda rows, idx: ", ".join(f"p{rows[i]['p']}w{rows[i]['wb']}" for i in sorted(idx, key=lambda i: rows[i]["cycles"]))
out = [f"# {J['yosys']}; OpenROAD {J['openroad']} (pip wheel); SKY130 HD tt_025C_1v80 at ORFS commit {J['pdk_commit'][:10]}",
       "# 40 MAC-engine designs of eda-harness; ABC: strash; dc2; map -D T; topo; upsize -D T; dnsize -D T; then OpenROAD placement at 40% utilisation,",
       "# ideal clock, I/O delay 0, parasitics estimated from the placement (no routing). 'period' = T - worst slack (ns), flop clk-to-q and setup included.", ""]
for T in J["targets"]:
    rows = [r for r in J["rows"] if r["period"] == T]
    for r in rows:
        r["abc_ns"] = r["abc_delay_ps"] / 1000
    Tn = T / 1000
    out.append(f"== ABC target T = {Tn:g} ns ({len(rows)} designs)")
    lo, md, hi = A.quantiles(A.wire_penalty(rows))
    out.append(f"wire penalty (placed period / no-wire netlist period): min {lo:.2f}, median {md:.2f}, max {hi:.2f}")
    lo, md, hi = A.quantiles([r["netlist_period_ns"] / r["abc_ns"] for r in rows])
    out.append(f"STA netlist period / ABC combinational delay (flop overhead, no wires): min {lo:.2f}, median {md:.2f}, max {hi:.2f}")
    lo, md, hi = A.quantiles([r["repaired_area"] / r["abc_area_um2"] for r in rows])
    out.append(f"repaired area / ABC area: min {lo:.3f}, median {md:.3f}, max {hi:.3f}")
    out.append("spearman: abc_delay~netlist_period %.3f  abc_delay~placed_period %.3f  abc_delay~repaired_period %.3f  gen_depth~placed_period %.3f  gen_depth~abc_delay %.3f" % (
        A.rho(rows, "abc_ns", "netlist_period_ns"), A.rho(rows, "abc_ns", "placed_period_ns"), A.rho(rows, "abc_ns", "repaired_period_ns"),
        A.rho(rows, "gen_depth", "placed_period_ns"), A.rho(rows, "gen_depth", "abc_ns")))
    out.append("spearman: abc_area~repaired_area %.3f  gen_cells~repaired_area %.3f  placed_period~area %.3f" % (
        A.rho(rows, "abc_area_um2", "repaired_area"), A.rho(rows, "gen_cells", "repaired_area"), A.rho(rows, "placed_period_ns", "abc_area_um2")))
    out.append("designs meeting T: ABC says %d, STA netlist %d, placed %d, repaired %d" % tuple(
        len(A.meets(rows, k, Tn)) for k in ("abc_ns", "netlist_period_ns", "placed_period_ns", "repaired_period_ns")))
    ok_abc = A.meets(rows, "abc_ns", Tn)
    ok_rep = A.meets(rows, "repaired_period_ns", Tn)
    out.append(f"of the {len(ok_abc)} that ABC says meet T, {len(set(ok_abc) & set(ok_rep))} meet it after placement and repair")
    out.append("front (area, cycles) among ABC-feasible, ABC area : " + (lab(rows, A.front(rows, ok_abc, "abc_area_um2")) if ok_abc else "none"))
    out.append("front among placement-feasible, repaired area     : " + (lab(rows, A.front(rows, ok_rep, "repaired_area")) if ok_rep else "none"))
    ba = A.best_area_latency(rows, ok_abc, "abc_area_um2", Tn)
    br = A.best_area_latency(rows, ok_rep, "repaired_area", Tn)
    out.append("best area x cycles at shared T: ABC view %s, placed view %s" % (lab(rows, [ba]) if ba is not None else "none", lab(rows, [br]) if br is not None else "none"))
    b1 = A.best_own_clock(rows, "abc_area_um2", "abc_ns")
    b2 = A.best_own_clock(rows, "repaired_area", "repaired_period_ns")
    out.append("best area x cycles x own period: ABC %s, repaired %s" % (lab(rows, [b1]), lab(rows, [b2])))
    out.append("fastest design: ABC %s, placed %s, repaired %s" % tuple(lab(rows, [min(range(len(rows)), key=lambda i: rows[i][k])]) for k in ("abc_ns", "placed_period_ns", "repaired_period_ns")))
    out.append("by lanes p (mean wire penalty): " + "  ".join(
        f"p{p}: {sum(x for x, r in zip(A.wire_penalty(rows), rows) if r['p'] == p) / sum(1 for r in rows if r['p'] == p):.2f}" for p in sorted({r['p'] for r in rows})))
    out.append("")
(D / "results.txt").write_text("\n".join(out))
print("\n".join(out))
