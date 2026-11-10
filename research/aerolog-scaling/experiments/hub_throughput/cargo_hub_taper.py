"""Milestone 6d: what does the constant-voltage taper do to the cargo-VTOL hub's charger limit and spare packs?

Predictions (written before the first run):
 (1) Charging 20 -> 90% of capacity at 1C with a CC-CV curve fitted to the Molicel INR-21700-P45B datasheet
     takes 43 +/- 1 min, only 2 to 4% above 6b's linear 42 min (the 90% ceiling stops before the taper bites).
 (2) Charging 30 -> 100% (same 70% of capacity, no ceiling) takes at least 1.6x the linear 42 min (>= 67 min), so the
     8-charger limit falls from 11.4 to about 6.8 flights/h.
 (3) At a fixed 6.0 flights/h with Poisson arrivals, p95 wait <= 300 s needs <= 12 spare packs with the 90% ceiling and
     >= 24 with the 100% ceiling.
Cell data: datasheet "Cell Specifications of INR-21700-P45B", Doc INR21700P45B-01 ver 0.2 (copy at
 https://www.kronium.cz/uploads/p45b-datasheet.pdf, read 2026-11-10): rated charge = 4.5 A (1C) limit then constant
 4.2 V until 90 mA taper current, charging time 1.5 h; maximum continuous charge 9 A (2C).
Curve fit (two datasheet numbers, one assumption): from empty, CC phase delivers fraction s1 of capacity in s1 hours at 1C,
 then CV current decays exponentially I = C*exp(-t/tau) down to C/50 (90 mA / 4.5 A). Capacity: s1 + tau*(1-1/50) = 1 h*C;
 time: s1 + tau*ln(50) = 1.5 h. Solves to tau = 0.1706 h, s1 = 0.833. The same tau is assumed at other C-rates
 (CV starts at SOC 1 - 0.98*c*tau): an assumption, not a datasheet value. Exponential CV decay is also assumed.
 Capacity is taken as delivered charge, ignoring coulombic loss and temperature. Preliminary.
"""
import math, sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
import cargo_hub_bursts as B

I_END = 0.09 / 4.5                      # taper cut-off in C
TAU = (1.5 - 1.0) / (math.log(1 / I_END) - (1 - I_END))   # hours
def s1(c): return 1 - (1 - I_END) * c * TAU

def charge_time_h(a, b, c=1.0):
    """hours to charge SOC a -> b (fractions of capacity) at CC rate c (in C) then CV."""
    edge = s1(c)
    if b <= edge:
        return (b - a) / c
    t_cc = max(edge - a, 0.0) / c
    start = max(a, edge)
    frac = (b - start) / (c * TAU)
    if frac >= 1 - I_END:
        frac = 1 - I_END                # cannot pass the taper cut-off
    return t_cc + -TAU * math.log(1 - frac)

if __name__ == "__main__":
    print(f"Fit: tau = {TAU:.4f} h, CC ends at SOC {s1(1.0):.3f} (1C), {s1(2.0):.3f} (2C, assumed same tau)")
    print(f"Check: 0 -> 100% at 1C (to the C/50 cut-off) = {charge_time_h(0, 1 - 1e-9)*60:.1f} min (datasheet: 90 min)")
    cases = {"linear 20-90% (6b)": 0.7 * 3600, "CC-CV 20-90%": charge_time_h(.2, .9) * 3600,
             "CC-CV 30-100%": charge_time_h(.3, 1.0) * 3600}
    print("\nCharge time, 70% of capacity, 1C:")
    for n, t in cases.items():
        print(f"  {n:20s} {t/60:5.1f} min   8-charger limit {8*3600/t:5.2f} flights/h")
    print("\nCharge time for 20-90% by C-rate (CC-CV vs linear):")
    for c in (0.5, 1.0, 2.0):
        print(f"  {c}C: {charge_time_h(.2,.9,c)*60:5.1f} min vs linear {0.7/c*60:5.1f}")
    rate = 6.0
    print(f"\nPoisson arrivals at {rate} flights/h: mean / p95 wait (s) by spares")
    sps = (9, 12, 16, 24, 32, 40)
    print("model               | " + " | ".join(f"sp {s:3d}      " for s in sps))
    grid = (9, 12, 16, 20, 24, 28, 32, 40, 48, 64)
    need = {}
    for n, t in cases.items():
        B.T_CHG = t
        print(f"{n:19s} | " + " | ".join("%5.0f /%5.0f" % B.avg(rate, 1, s) for s in sps))
        need[n] = next((s for s in grid if B.avg(rate, 1, s, 3)[1] <= 300), None)
    print("\nfewest spares (of those tried) with p95 wait <= 300 s:")
    for n, v in need.items():
        print(f"  {n:19s} {v if v else '>64'}")
