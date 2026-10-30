"""Milestone 2c: circuit rankings when pressures come from a force model, not a random draw.

Pressures are tied to loads: a dig phase from Reece's fundamental earthmoving equation
(cutting force F = w d (gamma d Ngamma + c Nc), surcharge ignored), lift from the weight of
bucket plus soil on a lever, swing from inertia plus friction. Soil gamma, c and the N factors,
the breakout force, the lever ratios, the 45 L/min pump and the 180 bar relief are
ASSUMED TYPICAL RANGES, not opened sources (textbook values from memory; Reece 1964 and
McKyes 1985 not opened). What this tests is whether load-correlated pressures change the
milestone 2a/2b ratios, not an excavator energy figure. Stdlib, seeded, a few seconds.
"""
import random, statistics, sys, os
# `--sourced` (milestone 2d) pins the margins: dp_ls 25 bar (differential pressure limiter,
# Briganti 2022 thesis, Politecnico di Torino, midi excavator model), dp_spool 6 bar (Juza and
# Hermanek 2023, measured open-centre block), eta 0.883 (0.92 x 0.96 of Briganti; Juza measured
# 0.8834). dp_m (3 to 10 bar) stays swept: no source.
SOURCED = "--sourced" in sys.argv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from heavy_hydraulics import Phase, Actuator, cycle_energy

P_RELIEF, Q_PUMP, G = 180.0, 45.0, 9.81
SEEDS, N = (0, 1, 2, 3, 4), 4000
PHASES = (("dig", 4.0), ("lift", 2.5), ("swing", 4.0), ("dump", 2.0), ("swing_back", 3.5), ("lower", 2.5))


def reece_force(rng):
    """Cutting force (N) of a 0.4 m wide bucket at depth 0.05 to 0.15 m (Reece form, no surcharge)."""
    gamma = rng.uniform(14e3, 20e3)      # N/m3 unit weight
    c = rng.uniform(0, 20e3)             # Pa cohesion
    ng, nc = rng.uniform(2, 8), rng.uniform(2, 8)
    w, d = 0.4, rng.uniform(0.05, 0.15)
    return w * d * (gamma * d * ng + c * nc)


def one(rng):
    f_break = rng.uniform(8e3, 16e3)     # N breakout force at relief pressure
    u_dig = min(1.0, reece_force(rng) / f_break)
    m_load = rng.uniform(30, 120)        # kg bucket + soil
    lift_u = min(1.0, m_load * G * rng.uniform(1.5, 2.5) / f_break)   # lever ratio 1.5 to 2.5
    swing_u = rng.uniform(0.10, 0.30)    # inertia + friction, fraction of relief
    idle_u = rng.uniform(0.05, 0.15)     # empty arm, hoses, friction
    ph = []
    for name, secs in PHASES:
        k = rng.uniform(0.4, 1.0)        # speed fraction -> flow
        if name == "dig":
            acts = ((0.15 + 0.85 * u_dig, 0.5), (0.15 + 0.5 * u_dig, 0.5))
        elif name == "lift":
            acts = ((max(lift_u, idle_u), 1.0),)
        elif name == "swing":
            acts = ((swing_u, 1.0),)
        elif name == "dump":
            acts = ((max(idle_u, 0.3 * lift_u), 1.0),)
        elif name == "swing_back":
            acts = ((swing_u * 0.8, 1.0),)
        else:
            acts = ((idle_u, 1.0),)
        tot = k * Q_PUMP
        ph.append(Phase(name, secs, tuple(Actuator(P_RELIEF * p, tot * s) for p, s in acts)))
    dpsp, dpls, dpm = rng.uniform(5, 20), rng.uniform(14, 30), rng.uniform(3, 10)
    return tuple(ph), (6.0 if SOURCED else dpsp), (25.0 if SOURCED else dpls), dpm


def q(xs, f):
    xs = sorted(xs); return xs[min(len(xs) - 1, int(f * len(xs)))]


rows = []
for s in SEEDS:
    for i in range(N):
        c, dpsp, dpls, dpm = one(random.Random(s * 7919 + i))
        e = {k: cycle_energy(c, k, pump_flow=Q_PUMP, dp_spool=dpsp, dp_ls=dpls, dp_m=dpm, eta_pump=0.883 if SOURCED else 0.85)["shaft_J"]
             for k in ("open_centre", "load_sensing", "metered")}
        e["dls_gt_dsp"] = dpls > dpsp
        e["demand_frac"] = statistics.mean(sum(a.flow for a in p.actuators) for p in c) / Q_PUMP
        rows.append(e)
ls = [r["load_sensing"] / r["open_centre"] for r in rows]
mt = [r["metered"] / r["load_sensing"] for r in rows]
order = sum(r["open_centre"] >= r["load_sensing"] >= r["metered"] for r in rows) / len(rows)
print(f"{len(rows)} force-model cycles; ordering OC>=LS>=metered {100*order:.2f}%")
print(f"LS/OC  median {statistics.median(ls):.3f}  5-95%: {q(ls,.05):.3f} to {q(ls,.95):.3f}")
print(f"Met/LS median {statistics.median(mt):.3f}  5-95%: {q(mt,.05):.3f} to {q(mt,.95):.3f}; share < 0.85: {100*sum(x<0.85 for x in mt)/len(mt):.1f}%")
bad = [r for r in rows if r["load_sensing"] > r["open_centre"]]
print(f"LS>OC in {len(bad)} cycles; all have dp_ls > dp_spool: {all(r['dls_gt_dsp'] for r in bad)}; "
      f"mean demand/pump in those {statistics.mean(r['demand_frac'] for r in bad):.2f} vs {statistics.mean(r['demand_frac'] for r in rows):.2f} overall")

if SOURCED:  # break-even: how large a load-sensing margin still beats the sourced 6 bar open-centre block?
    print("dp_ls sweep (dp_spool 6, eta 0.883; 5000 cycles each): bar, LS/OC median, share of cycles LS>OC")
    for dpls in (5, 10, 14, 20, 25, 30):
        r = []
        for s in SEEDS:
            for i in range(1000):
                c, _, _, dpm = one(random.Random(s * 7919 + i))
                e = {k: cycle_energy(c, k, pump_flow=Q_PUMP, dp_spool=6.0, dp_ls=dpls, dp_m=dpm, eta_pump=0.883)["shaft_J"]
                     for k in ("open_centre", "load_sensing")}
                r.append(e["load_sensing"] / e["open_centre"])
        print(f"  {dpls:3d}  {statistics.median(r):.3f}  {100*sum(x > 1 for x in r)/len(r):.1f}%")
