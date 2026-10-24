"""Per target period: rank agreement of the generic rung, designs meeting timing, fronts. Reads swept.json; writes results.txt.
Run: PYTHONPATH=../src python analyze.py"""
import json
from pathlib import Path
from eda_clocksweep import sweep as S

R = S.R
D = Path(__file__).resolve().parent
J = json.load(open(D / "swept.json"))
by = {}
for r in J["rows"]:
    by.setdefault(r["period"], []).append(r)
lab = lambda rows, idx: ", ".join(f"p{rows[i]['p']}w{rows[i]['wb']}" for i in sorted(idx, key=lambda i: rows[i]["cycles"]))
base = by[None]
gf = R.pareto_idx([(r["gen_cells"], r["cycles"]) for r in base])
out = [f"# {J['yosys']}; SKY130 HD tt_025C_1v80 at ORFS commit {J['pdk_commit'][:10]}; ABC: strash; dc2; map -D T; topo; upsize -D T; dnsize -D T; stime",
       f"# {len(base)} MAC-engine designs from eda-harness; period None = unconstrained `map` as in eda-sky130rung", "",
       "generic (cells, cycles) front: " + lab(base, gf), "",
       "period  met  spearman(cells,area)  spearman(depth,delay)  area range um2      feasible (area,cycles) front"]
for per in J["periods"]:
    rows = by[per]
    t = float("inf") if per is None else per
    n_met = sum(S.met(r, t) for r in rows)
    sa = R.spearman([r["gen_cells"] for r in rows], [r["area_um2"] for r in rows])
    sd = R.spearman([r["gen_depth"] for r in rows], [r["delay_ps"] for r in rows])
    fr = S.feasible_front(rows, t)
    out.append(f"{str(per):>6s}  {n_met:3d}  {sa:20.3f}  {sd:21.3f}  {min(r['area_um2'] for r in rows):7.0f}-{max(r['area_um2'] for r in rows):7.0f}   "
               + (lab(rows, fr) if fr else "none"))
out += ["", "area-delay trade within a design: area at target period relative to unconstrained, and delay reached (ps), for the 4-bit lane sweep"]
out.append("design   " + "  ".join(f"{str(p):>12s}" for p in J["periods"]))
for p in (1, 2, 4, 8):
    cells = []
    for per in J["periods"]:
        r = next(x for x in by[per] if x["p"] == p and x["wb"] == 4)
        b = next(x for x in base if x["p"] == p and x["wb"] == 4)
        cells.append(f"{r['area_um2'] / b['area_um2']:5.2f}/{r['delay_ps']:6.0f}")
    out.append(f"p{p}w4    " + "  ".join(f"{c:>12s}" for c in cells))
# best design by area x (cycles x T) among feasible designs at each T
out += ["", "best feasible design by area x latency (latency = cycles x T) at each target:"]
for per in J["periods"]:
    if per is None:
        continue
    rows = by[per]
    ok = [i for i, r in enumerate(rows) if S.met(r, per)]
    if not ok:
        out.append(f"  T={per}: none meets timing")
        continue
    b = min(ok, key=lambda i: rows[i]["area_um2"] * rows[i]["cycles"])
    out.append(f"  T={per}: {lab(rows, [b])}  area {rows[b]['area_um2']:.0f} um2, {rows[b]['cycles']} cycles, delay {rows[b]['delay_ps']:.0f} ps")
(D / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
