"""Run all sections; writes experiments/results.txt.   PYTHONPATH=src python experiments/run.py"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_propulsion import *  # noqa: E402

OUT = []
p = OUT.append
MILE = 1609.344
BTU = 1055.06


def fmt(x, n=2):
    return "-" if x is None else f"{x:.{n}f}"


def main():
    modes = {k: f() for k, f in MODES.items()}
    d = diesel()
    p("A. Physical floor: energy per net tonne-km at design range, loaded one way, fuel-fed (cruise only: no grades, stops, idling or empty return)")
    p(f"{'mode':9s}{'range km':>9s}{'gross t':>9s}{'payload t':>10s}{'F kN':>8s}{'work MJ/tkm':>12s}{'fuel MJ/tkm':>12s}{'fuel Wh/tkm':>12s}")
    for k, m in modes.items():
        s = solve(m, d)
        w, e = intensity(m, d)
        p(f"{k:9s}{m.range_km:9.0f}{m.m0/1e3:9.0f}{s['payload']/1e3:10.1f}{m.force(m.m0)/1e3:8.1f}{w:12.3f}{e:12.3f}{e*1e6/3600:12.1f}")
    p("")

    p("B. Checks against published figures")
    t = truck(crr=0.0045, cda=3.6, v=65 * 0.44704, m0=37195.0)
    kwh_mi = t.force(t.m0) * MILE / 0.88 / 3.6e6
    p(f"B1. Battery truck at 82,000 lb, 65 mph, Crr 0.0045, CdA 3.6, battery-to-wheel 0.88: {kwh_mi:.2f} kWh/mile; Tesla Semi rated 1.7 kWh/mile (electrive, Feb 2026; Musk 2022): {100*(kwh_mi/1.7-1):+.0f}%")
    t = modes["truck"]
    kg_mi = t.force(t.m0) * MILE / d.eta["truck"] / DIESEL_LHV
    mpg = 1.0 / (kg_mi / 0.832 / 3.785)
    p(f"B2. Diesel truck at 90 km/h, Crr 0.0065, CdA 5.4, engine-to-wheel 0.40: {mpg:.1f} mpg steady-state floor; fleet reports 5.5-6.5 mpg (Cummins/Peterbilt 2014), SuperTruck demonstrators 10.7-12.2 mpg")
    r = modes["rail"]
    loaded = r.force(r.m0)
    empty = r.force(r.m_struct)
    pay = solve(r, d)["payload"]
    def mj_tkm(force):   # force in N over 1 km, per net tonne
        return force * 1000.0 / d.eta["rail"] / 1e6 / (pay / 1000.0)
    one, rt = mj_tkm(loaded), mj_tkm(loaded + empty)
    fhwa = 305 * BTU / 1e6 / (0.907185 * 1.609344)
    p(f"B3. Unit train, Davis resistance, engine-to-wheel 0.34: {one:.3f} MJ/tkm loaded one way, {rt:.3f} with an empty return; FHWA Class I rail 2009, 305 Btu per short ton-mile = {fhwa:.3f} MJ/tkm: model/FHWA {one/fhwa:.2f} one way, {rt/fhwa:.2f} with empty return")
    a = modes["aircraft"]
    store = a.m0 - a.m_struct - 118e3
    rk = range_km(a, d, store)
    p(f"B4. 747-400F: MTOW 396.9 t, OEW 160.4 t, 118 t payload leaves {store/1e3:.0f} t fuel (capacity 173.5 t); Breguet cruise range {rk:.0f} km; published 8,250 km (one listing) or 5,760 km (another): model/8,250 = {rk/8250:.2f}")
    p("")

    p("C. Swapping the store: payload kept at the design range, against diesel/jet at the same gross mass (payload t, % of diesel; '-' = cannot reach the range even with a full store)")
    cars = [d, battery(150), battery(250), battery(400), h2_700bar(), h2_liquid(), ammonia()]
    p(f"{'carrier':28s}" + "".join(f"{k+' t':>11s}{'%':>6s}" for k in modes))
    for c in cars:
        row = f"{c.name:28s}"
        for k, m in modes.items():
            base = solve(m, d)["payload"]
            s = solve(m, c)
            row += f"{s['payload']/1e3:11.1f}{(100*s['payload']/base):6.0f}" if s["feasible"] else f"{'-':>11s}{'-':>6s}"
        p(row)
    p("Zero-payload range with every spare kilogram as store (km):")
    for c in [battery(250), h2_700bar(), h2_liquid()]:
        p(f"  {c.name:28s}" + "".join(f"{k} {solve(m, c)['max_range_km']:9.0f}  " for k, m in modes.items()))
    p("")

    p("D. Battery pack specific energy (Wh/kg) at which payload reaches 90% / 50% of the diesel payload")
    p(f"{'mode':9s}{'90%':>10s}{'50%':>10s}")
    for k, m in modes.items():
        p(f"{k:9s}{fmt(breakeven_wh_kg(m, 0.9), 0):>10s}{fmt(breakeven_wh_kg(m, 0.5), 0):>10s}")
    p("")

    p("E. Does the break-even survive the uncertain inputs? Wh/kg for 90% of the diesel payload (low / default / high input)")
    cases = [
        ("truck Crr 0.0040/0.0065/0.0080", [truck(crr=x) for x in (0.0040, 0.0065, 0.0080)]),
        ("truck CdA 3.6/5.4/6.5", [truck(cda=x) for x in (3.6, 5.4, 6.5)]),
        ("truck range km 500/800/1200", [truck(range_km=x) for x in (500, 800, 1200)]),
        ("rail speed mph 30/50/60", [rail(v_mph=x) for x in (30, 50, 60)]),
        ("rail range km 800/1500/3000", [rail(range_km=x) for x in (800, 1500, 3000)]),
        ("ship Admiralty C 700/600/500", [ship(c_adm=x) for x in (700, 600, 500)]),
        ("ship speed kn 10/14/16", [ship(v_kn=x) for x in (10, 14, 16)]),
        ("ship range km 5000/20000/30000", [ship(range_km=x) for x in (5000, 20000, 30000)]),
        ("aircraft L/D 19/17/15", [aircraft(l_over_d=x) for x in (19, 17, 15)]),
        ("aircraft range km 2000/8250/12000", [aircraft(range_km=x) for x in (2000, 8250, 12000)]),
    ]
    for name, ms in cases:
        p(f"{name:36s}" + "".join(f"{fmt(breakeven_wh_kg(m, 0.9), 0):>9s}" for m in ms))
    p("")

    p("F. Battery pack sweep: payload as % of diesel payload at the design range")
    ws = [100, 150, 200, 250, 300, 400, 500, 750, 1000, 2000]
    p(f"{'Wh/kg':>7s}" + "".join(f"{k:>10s}" for k in modes))
    for w in ws:
        row = f"{w:7d}"
        for k, m in modes.items():
            s = solve(m, battery(w))
            row += f"{100*s['payload']/solve(m, d)['payload']:10.0f}" if s["feasible"] else f"{'-':>10s}"
        p(row)
    Path(__file__).with_name("results.txt").write_text("\n".join(OUT) + "\n")
    print("\n".join(OUT))


if __name__ == "__main__":
    main()
