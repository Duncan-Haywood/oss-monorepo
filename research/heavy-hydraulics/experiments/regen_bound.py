"""Milestone 5a: upper bound on what boom-lowering energy recovery can return per cycle.

Recoverable energy per cycle E = (m_arm + m_load) g dh x eta_rt, capped by the lift phase's pump-shaft
energy (it can only displace that). m_load comes from the milestone 2c force model (physics_cycle.one);
m_arm, dh and eta_rt are SWEPT, not sourced. See LOG.md (milestone 5a) for the predictions.
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0], "--sourced"]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics import Phase, cycle_energy
from heavy_hydraulics.circuits import W_PER_BAR_LPM

ETA, DP_SPOOL, DP_LS = 0.883, 6.0, 25.0
G = 9.81
N_PER_SEED = 1000

def cycles():
    for s in pc.SEEDS:
        for i in range(N_PER_SEED):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            # re-draw m_load the same way pc.one does (it is the third draw after f_break and reece's four + 2)
            rng2 = random.Random(s * 7919 + i)
            f_break = rng2.uniform(8e3, 16e3)
            pc.reece_force(rng2)
            m_load = rng2.uniform(30, 120)
            yield c, m_load

def shaft(c, circuit):
    return cycle_energy(c, circuit, pump_flow=pc.Q_PUMP, dp_spool=DP_SPOOL, dp_ls=DP_LS,
                        dp_m=5.0, eta_pump=ETA)["shaft_J"]

def lift_only(c):
    lift = [p for p in c if p.name == "lift"]
    return tuple(lift)

def lift_useful(c):
    return sum(a.pressure * a.flow * W_PER_BAR_LPM * p.seconds for p in lift_only(c) for a in p.actuators)

def share(m_arm, dh, eta_rt, data):
    out = {"open_centre": [], "load_sensing": []}
    for c, m_load, e, lift_e in data:
        pot = (m_arm + m_load) * G * dh * eta_rt
        for k in out:
            out[k].append(min(pot, lift_e[k]) / e[k])
    return {k: statistics.median(v) for k, v in out.items()}

if __name__ == "__main__":
    data = []
    ratios = []
    for c, m_load in cycles():
        e = {k: shaft(c, k) for k in ("open_centre", "load_sensing")}
        le = {k: shaft(lift_only(c), k) for k in e}
        data.append((c, m_load, e, le))
        ratios.append(lift_useful(c) / (m_load * G * 0.8))   # model lift work over m_load g dh at dh 0.8 m
    print(f"{len(data)} force-model cycles (sourced margins: dp_spool 6, dp_ls 25, eta 0.883)")
    ls_oc = statistics.median(e["load_sensing"] / e["open_centre"] for _, _, e, _ in data)
    print(f"LS/OC shaft-energy median, no idle: {ls_oc:.3f}")
    print(f"model lift useful work / (m_load g 0.8 m): median {statistics.median(ratios):.1f}, "
          f"5-95%: {sorted(ratios)[int(.05*len(ratios))]:.1f} to {sorted(ratios)[int(.95*len(ratios))]:.1f}")
    print("median recovered share of cycle shaft energy (open-centre / load-sensing), capped by lift-phase shaft energy")
    print("  m_arm kg  dh m  eta_rt   OC       LS")
    for m_arm in (150, 300, 600):
        for dh in (0.5, 0.8, 1.2):
            for eta in (0.3, 0.7, 0.92):
                r = share(m_arm, dh, eta, data)
                print(f"  {m_arm:7d}  {dh:4.1f}  {eta:5.2f}  {100*r['open_centre']:6.2f}%  {100*r['load_sensing']:6.2f}%")
    c = share(300, 0.8, 0.7, data); u = share(600, 1.2, 0.92, data)
    print(f"\ncentral (300, 0.8, 0.7): OC {100*c['open_centre']:.2f}%, LS {100*c['load_sensing']:.2f}%")
    print(f"upper corner (600, 1.2, 0.92): OC {100*u['open_centre']:.2f}%, LS {100*u['load_sensing']:.2f}%")
