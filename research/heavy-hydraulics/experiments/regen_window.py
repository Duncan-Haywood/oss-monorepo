"""Milestone 5d: boom-lowering recovery capped by a device power rating over the harvest window.

Recovered energy = min(pot * eta_rt, lift-phase shaft energy, P_max * t_w). Reuses 5a's cycles.
m_arm, dh, eta_rt, P_max are SWEPT, not sourced. Mean-power cap on a flat lowering profile.
"""
import os, statistics, sys
sys.path.insert(0, os.path.dirname(__file__))
import regen_bound as rb

G = rb.G
def share(m_arm, dh, eta, pmax_w, tw, data):
    out = {"open_centre": [], "load_sensing": []}
    for c, m_load, e, le in data:
        pot = (m_arm + m_load) * G * dh * eta
        for k in out:
            out[k].append(min(pot, le[k], pmax_w * tw) / e[k])
    return {k: statistics.median(v) for k, v in out.items()}

if __name__ == "__main__":
    data = []
    for c, m_load in rb.cycles():
        e = {k: rb.shaft(c, k) for k in ("open_centre", "load_sensing")}
        le = {k: rb.shaft(rb.lift_only(c), k) for k in e}
        data.append((c, m_load, e, le))
    print(f"{len(data)} force-model cycles (sourced margins)")
    pts = {"central (300 kg, 0.8 m, 0.70)": (300, .8, .7), "upper (600 kg, 1.2 m, 0.92)": (600, 1.2, .92)}
    mean_p = {n: statistics.median((m_arm + ml) * G * dh * eta / 2.5 for _, ml, _, _ in data)
              for n, (m_arm, dh, eta) in pts.items()}
    for n, (m_arm, dh, eta) in pts.items():
        print(f"\n{n}: median mean recovery power over 2.5 s = {mean_p[n]:.0f} W")
        print("  t_w s  P_max kW   OC share   LS share")
        for tw in (1.5, 2.5, 3.0):
            for pk in (0.5, 1, 2, 5, 10, None):
                r = share(m_arm, dh, eta, (pk or 1e9) * 1e3, tw, data)
                print(f"  {tw:4.1f}  {('uncapped' if pk is None else pk):>8}  {100*r['open_centre']:8.2f}%  {100*r['load_sensing']:8.2f}%")
