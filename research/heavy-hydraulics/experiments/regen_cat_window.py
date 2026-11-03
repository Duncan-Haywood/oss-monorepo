"""Milestone 5k: does 5d/5e's assumed 2.5 s lowering window match a measured excavator boom-retract time?

Source: Halim et al., Int. J. Current Science Research and Review 8(11):5863-5870 (Nov 2025),
doi:10.47191/ijcsrr/V8-i11-43, Zenodo 10.5281/zenodo.17760471 (CC BY 4.0). Caterpillar 305.5E2,
no-load full-stroke stopwatch test, engine dial 10: boom retract (lowering) 2.10 s measured,
manual specification 1.7 to 2.5 s. Reuses 5a's force-model cycles (regen_bound.cycles).
Window and the 95% rating multiple (1.24, from 5g's measured PATU strokes) are inputs.
"""
import os, statistics, sys
sys.path.insert(0, os.path.dirname(__file__))
import regen_bound as rb

G = rb.G
POINTS = {"central (300 kg, 0.8 m, 0.70)": (300, .8, .7), "upper (600 kg, 1.2 m, 0.92)": (600, 1.2, .92)}
WINDOWS = (1.7, 2.1, 2.5)
RATING_95 = 1.24

if __name__ == "__main__":
    cyc = list(rb.cycles())
    print(f"{len(cyc)} force-model cycles (sourced margins)")
    print("window s = spec low / measured / spec high (Cat 305.5E2 boom retract)")
    for n, (m_arm, dh, eta) in POINTS.items():
        energy = [(m_arm + ml) * G * dh * eta for _, ml in cyc]
        print(f"\n{n}: median recoverable energy {statistics.median(energy)/1e3:.2f} kJ")
        for tw in WINDOWS:
            mp = statistics.median(e / tw for e in energy)
            print(f"  window {tw:.1f} s: median mean power {mp:7.0f} W, 95% rating (x1.24) {RATING_95*mp/1e3:5.2f} kW")
