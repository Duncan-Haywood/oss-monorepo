"""What a Froude-scaled model of a cargo fixed-wing gets right and wrong. Stdlib only, under 1 s.

    PYTHONPATH=src python3 experiments/run.py > experiments/results.txt

Full-size airframe: 1,000 kg, AR 10, CL 0.8 at sea level (design choices, swept below; the
ratios, not the absolute values, are the result). Cells: 250 Wh/kg at 0.7 overall efficiency, range
100 km at full size, model range scaled with length (the same number of body lengths).
"""
from aerolog_scaling.scaling import G, airframe, battery_fraction, model_of, scale

NS = (1.0, 0.5, 0.2, 0.1, 0.05)
BASE = dict(aspect_ratio=10.0, cl_cruise=0.8, k_form=1.25, s_wet_ratio=2.1, e_oswald=0.8)
E_SPEC, ETA, RANGE = 250 * 3600.0, 0.7, 100e3


def full(**o):
    p = {**BASE, **o}
    return airframe(1000.0, 3.0 * 10 ** 0.5, p["aspect_ratio"], p["cl_cruise"],
                    p["k_form"], p["s_wet_ratio"], p["e_oswald"], tripped=p.get("tripped", False)), p


def row(n, f, p):
    m = model_of(f, n, **p)
    bf = battery_fraction(m["ld"], RANGE * n, E_SPEC, ETA)
    bf1 = battery_fraction(f["ld"], RANGE, E_SPEC, ETA)
    return m, bf, bf1


def table(title, **o):
    f, p = full(**o)
    print(f"\n{title}")
    print(f"{'n':>5} {'mass kg':>9} {'V m/s':>7} {'Re_mac':>9} {'CD0':>7} {'L/D':>6} "
          f"{'P_aero / n^3.5 P_full':>22} {'batt frac':>10} {'x full':>7}")
    for n in NS:
        m, bf, bf1 = row(n, f, p)
        pr = (m["p_aero"] / f["p_aero"]) / scale("power", n)
        print(f"{n:5.2f} {m['mass']:9.3f} {m['v']:7.2f} {m['re']:9.2e} {m['cd0']:7.4f} {m['ld']:6.1f} "
              f"{pr:22.2f} {bf:10.3f} {bf / bf1:7.2f}")


print("Froude-scaled model of a cargo fixed-wing (see experiments/run.py header for inputs)")
print("P ratio > 1 means the model needs more power than Froude scaling predicts (drag rose).")
print("batt frac = battery mass / aircraft mass for a range scaled with length; x full = vs 1:1.")
table("A. tripped (fully turbulent) boundary layer, base airframe", tripped=True)
table("B. untripped: laminar below Re 5e5 (attached flow only; optimistic at low Re)")
for k, s in ((1.1, 1.8), (1.4, 2.4)):
    table(f"C. tripped, k_form={k}, S_wet/S_ref={s} (CD0 sweep)", tripped=True, k_form=k, s_wet_ratio=s)
for ar in (6.0, 14.0):
    table(f"D. tripped, AR={ar}", tripped=True, aspect_ratio=ar)
