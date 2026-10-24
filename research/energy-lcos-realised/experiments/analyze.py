"""LCOS of every technology at the use the least-cost system realised, against the assumed 2,000 h and $30/MWh.
Reads results.json (run.py); writes results.txt."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for p in ("src", "../energy-lcos/src", "../energy-lcos-sourced/src", "../energy-mix-sourced/src"):
    sys.path.insert(0, str((HERE.parent / p).resolve()))
from energy_lcos_sourced import EUR_USD, SPECS, lcos_at, load  # noqa: E402

td, _ = load()
res = {n: r for n, _, r in json.load(open(HERE / "results.json"))}
CASES = ["cavern_cap0.2", "cavern_cap0.1", "cavern_cap0.0", "tank_cap0.0"]
BC = CASES[:3]  # the LCOS hydrogen row is cavern-priced, so the tank case is reported in A only
OWN = {"batt": "li-ion (LFP)", "h2": "hydrogen (cavern)"}
out = []


def L(s):
    out.append(s)


L("A. Realised use of each store in the least-cost 2030 system (sourced costs, Germany 2019, one node)")
for c in CASES:
    for k in ("batt", "h2"):
        s = res[c].get(k)
        if s:
            L(f"A {c} {k}: duration={s['duration_h']:.1f}h cycles={s['cycles_per_year']:.1f}/yr discharge_hours={s['discharge_hours']:.0f}"
              f" charge_price=EUR{s['charge_price']:.1f}/MWh (system mean EUR{res[c]['system']['mean_price']:.1f})")
L("")
L("B. Own-technology LCOS, $/MWh: assumed use (2000 h, $30) against realised use (hours, charging price x 1.12998)")
for c in BC:
    for k, tech in OWN.items():
        s = res[c].get(k)
        if not s:
            continue
        d = s["duration_h"]
        a = lcos_at(tech, td, d, hours_budget=2000.0, charge_price=30.0)
        r = lcos_at(tech, td, d, hours_budget=s["discharge_hours"], charge_price=s["charge_price"] * EUR_USD)
        L(f"B {c} {k} {tech} at {d:.1f}h: assumed={a:.0f} realised={r:.0f} ratio={r / a:.2f}")
L("")
L("C. Cheapest technology at each store's duration, assumed use against realised use of that store")
for c in BC:
    for k in ("batt", "h2"):
        s = res[c].get(k)
        if not s:
            continue
        d = s["duration_h"]
        ass = {t: lcos_at(t, td, d, hours_budget=2000.0, charge_price=30.0) for t in SPECS}
        rea = {t: lcos_at(t, td, d, hours_budget=s["discharge_hours"], charge_price=s["charge_price"] * EUR_USD) for t in SPECS}
        fmt = lambda m: " ".join(f"{t.split(' ')[0]}={v:.0f}" for t, v in sorted(m.items(), key=lambda kv: kv[1]))
        L(f"C {c} {k} {d:.1f}h assumed: {fmt(ass)}")
        L(f"C {c} {k} {d:.1f}h realised: {fmt(rea)}")
L("")
L("== D. Hydrogen vs cavern-air LCOS ($/MWh) against discharge hours a year, 280 h duration, EUR18.4 charge (columns: hours hydrogen cavern-air)")
s = res["cavern_cap0.0"]["h2"]
for h in (300, 500, 720, 1000, 1500, 2000, 3000, 4000):
    kw = dict(hours_budget=h, charge_price=s["charge_price"] * EUR_USD)
    L(f"{h} {lcos_at('hydrogen (cavern)', td, s['duration_h'], **kw):.0f} {lcos_at('compressed air (cavern)', td, s['duration_h'], **kw):.0f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
