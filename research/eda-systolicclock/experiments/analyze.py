"""Per shared target: designs meeting it, best area x latency design and family, feasible (area, cycles) front. Reads swept.json; writes results.txt.
Run: PYTHONPATH=../src:../../chip-systolic/src python analyze.py"""
import json
from pathlib import Path
from eda_systolicclock import clock as K

D = Path(__file__).resolve().parent
J = json.load(open(D / "swept.json"))
by = {}
for r in J["rows"]:
    by.setdefault(r["period"], []).append(r)
R = K.S.R
out = [f"# {J['yosys']}; SKY130 HD tt_025C_1v80 at ORFS commit {J['pdk_commit'][:10]}; batch of {J['batch']} vectors; ABC: strash; dc2; map -D T; topo; upsize -D T; dnsize -D T; stime",
       "# 24 designs: systolic 4xC and MAC-lane P=C for C in 1,2,4,8 at WB 4,6,8. period None = unconstrained `map`", "",
       "period  met(sys/lane)  best by area x cycles x T         best systolic             best lane                 sys/lane ratio"]
for per in J["periods"]:
    rows = by[per]
    t = float("inf") if per is None else per
    ms = sum(K.met(r, t) for r in rows if r["kind"] == "systolic")
    ml = sum(K.met(r, t) for r in rows if r["kind"] == "lane")
    fmt = lambda i: "none" if i is None else f"{K.label(rows[i])} ({rows[i]['area_um2'] * rows[i]['cycles']:.3g})"
    b, bs, bl = K.best(rows, t), K.best(rows, t, "systolic"), K.best(rows, t, "lane")
    ratio = f"{rows[bs]['area_um2'] * rows[bs]['cycles'] / (rows[bl]['area_um2'] * rows[bl]['cycles']):.2f}" if bs is not None and bl is not None else "n/a"
    out.append(f"{str(per):>6s}  {ms:3d}/{ml:<3d}        {fmt(b):<33s} {fmt(bs):<25s} {fmt(bl):<25s} {ratio}")
out += ["", "per word length, family with the best area x cycles among designs meeting each target (S = systolic, L = lane, - = none meets)"]
out.append("wb   " + "  ".join(f"{str(p):>6s}" for p in J["periods"]))
for wb in (4, 6, 8):
    cells = []
    for per in J["periods"]:
        rows = [r for r in by[per] if r["wb"] == wb]
        t = float("inf") if per is None else per
        v = K.kind_verdict(rows, t)
        cells.append({"systolic": "S", "lane": "L", None: "-"}[v])
    out.append(f"{wb:<4d} " + "  ".join(f"{c:>6s}" for c in cells))
out += ["", "delay reached (ps) / area relative to unconstrained, WB=4"]
base = {(r["kind"], r["c"]): r for r in by[None] if r["wb"] == 4}
out.append("design      " + "  ".join(f"{str(p):>12s}" for p in J["periods"]))
for kind, c in sorted(base):
    cells = []
    for per in J["periods"]:
        r = next(x for x in by[per] if x["kind"] == kind and x["c"] == c and x["wb"] == 4)
        cells.append(f"{r['delay_ps']:6.0f}/{r['area_um2'] / base[(kind, c)]['area_um2']:4.2f}")
    out.append(f"{kind[:3]}{c:<2d} w4     " + "  ".join(f"{x:>12s}" for x in cells))
out += ["", "feasible (area, cycles) Pareto front over all 24 designs:"]
for per in J["periods"]:
    rows = by[per]
    t = float("inf") if per is None else per
    fr = K.feasible_front(rows, t)
    out.append(f"  {str(per):>6s}: " + (", ".join(K.label(rows[i]) for i in sorted(fr, key=lambda i: rows[i]["cycles"])) or "none"))
(D / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
