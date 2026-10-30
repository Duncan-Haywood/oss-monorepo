"""Milestone 5b: does 5a's lift-phase cap bind? Recovered share with no cap versus with 5a's cap.

The force model's lift phase is 5.6x m_load g dh (5a), so 5a's cap (lift-phase shaft energy) may be
generous. Here the cap is the physical gravity energy that the lift must supply, (m_arm+m_load) g dh / eta
(upper bound on what a lowering can displace in the next lift), and compared with 5a's. m_arm, dh, eta_rt swept.
"""
import os, statistics, sys
sys.path.insert(0, os.path.dirname(__file__))
import regen_bound as rb

if __name__ == "__main__":
    data = []
    for c, m_load in rb.cycles():
        e = {k: rb.shaft(c, k) for k in ("open_centre", "load_sensing")}
        le = {k: rb.shaft(rb.lift_only(c), k) for k in e}
        data.append((c, m_load, e, le))
    print(f"{len(data)} cycles; median recovered share of cycle shaft energy, OC / LS")
    print("  m_arm  dh   eta_rt  uncapped OC/LS        5a-capped OC/LS     binding(5a cap)")
    for m_arm, dh, eta in ((300, .8, .7), (150, .5, .3), (600, 1.2, .92), (600, 1.2, .7), (150, 1.2, .92)):
        unc = {k: statistics.median((m_arm + m) * rb.G * dh * eta / e[k] for _, m, e, _ in data) for k in ("open_centre", "load_sensing")}
        cap = rb.share(m_arm, dh, eta, data)
        bind = statistics.mean((m_arm + m) * rb.G * dh * eta > le["open_centre"] for _, m, _, le in data)
        print(f"  {m_arm:5d} {dh:4.1f}  {eta:5.2f}  {100*unc['open_centre']:5.2f}% {100*unc['load_sensing']:5.2f}%   {100*cap['open_centre']:5.2f}% {100*cap['load_sensing']:5.2f}%   {100*bind:4.1f}%")
