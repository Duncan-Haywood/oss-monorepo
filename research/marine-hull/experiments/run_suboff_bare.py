"""Milestone 3u: what form factor does the measured SUBOFF bare hull (AFF-1) have, once its wetted area comes
from the hull equations, and does Hoerner's streamlined-body formula predict it?

3t could only bound the bare-hull (1+k) because the bare wetted area was missing. `marine_hull.suboff` now
integrates the Groves, Huang and Chang (1989) equations: 0.69921 m3 and 5.98826 m2 against the report's
0.699 and 5.988 (quoted second-hand). Resistance: Liu & Huang 1998 Table 14 (AFF-1 rows of
data/suboff_dtmb_table14.csv), tripwires on, fresh water rho 998.2, nu 1.0e-6 (swept 0.95 to 1.15e-6).

Hoerner (Fluid-Dynamic Drag, 1965, ch. 6), streamlined bodies of revolution, drag on wetted area:
    C_D / C_f = 1 + 1.5 (d/l)^1.5 + 7 (d/l)^3.
It is the textbook way to set an AUV form factor without a tank test; the programme instead swept
k in {0.1, 0.2, 0.3} for REMUS-class hulls (milestone 4c).

Predictions, written and committed before the first run:
 P1: AFF-1 implied (1+k) averaged over the speeds above 5 m/s lies in 1.05 to 1.20.
 P2: Hoerner's formula (1.071 at SUBOFF d/l 0.1166) is within 7% of that measured mean.
 P3: the slowest point (3.05 m/s) sits at least 4% below the >5 m/s mean, as on AFF-8 in 3t
     (so the shortfall belongs to the hull and tripwires, not to the appendages).
Refuted: P1 outside 1.05 to 1.20; P2 more than 7% apart; P3 under 4%.

Run: PYTHONPATH=src python3 experiments/run_suboff_bare.py > experiments/results_suboff_bare.txt
"""
import csv
import math
import os

from marine_hull.hull import cf_ittc57
from marine_hull import suboff

RHO = 998.2
HERE = os.path.dirname(os.path.abspath(__file__))
S8 = 6.3367    # AFF-8 wetted area (3t, Zenodo 22692726)


def hoerner(d_over_l):
    return 1 + 1.5 * d_over_l ** 1.5 + 7 * d_over_l ** 3


def rows(config):
    with open(os.path.join(HERE, 'data', 'suboff_dtmb_table14.csv')) as f:
        r = list(csv.reader(l for l in f if not l.startswith('#')))
    h = r[0]
    return [(float(d['speed_ms']), float(d['resistance_N'])) for d in (dict(zip(h, x)) for x in r[1:])
            if d['config'] == config]


def implied(u, rt, s, length, nu):
    return rt / (0.5 * RHO * u * u * s * cf_ittc57(u * length / nu))


def main():
    vol, s1 = suboff.hydrostatics()
    L, D = suboff.LENGTH, suboff.DIAMETER
    print(f"SUBOFF bare hull from equations: L {L:.4f} m, D {D:.4f} m, volume {vol:.5f} m3, wetted {s1:.5f} m2"
          f" (report, second-hand: {suboff.REFERENCE['volume_m3']} / {suboff.REFERENCE['wetted_m2']})")
    print(f"appendage wetted area AFF-8 minus AFF-1: {S8 - s1:.3f} m2 ({100*(S8/s1-1):.1f}% of bare)")
    h = hoerner(D / L)
    print(f"Hoerner 1 + 1.5(d/l)^1.5 + 7(d/l)^3 at d/l {D/L:.4f}: {h:.4f}")
    a1 = rows('1')
    print("\nAFF-1: speed m/s, Re, Rt N, Cf, (1+k) at nu 0.95 / 1.00 / 1.15 e-6")
    for u, rt in a1:
        ks = [implied(u, rt, s1, L, nu) for nu in (0.95e-6, 1.0e-6, 1.15e-6)]
        print(f"{u:.3f} {u*L/1e-6:.2e} {rt:6.1f} {cf_ittc57(u*L/1e-6):.5f} " + ' '.join(f"{k:.4f}" for k in ks))
    for nu in (0.95e-6, 1.0e-6, 1.15e-6):
        hi = [implied(u, rt, s1, L, nu) for u, rt in a1 if u > 5]
        lo = implied(*a1[0], s1, L, nu)
        m = sum(hi) / len(hi)
        print(f"nu {nu:.2e}: mean (1+k) above 5 m/s {m:.4f} (spread {100*(max(hi)-min(hi))/m:.1f}%),"
              f" 3.05 m/s point {lo:.4f} ({100*(lo/m-1):+.1f}%), Hoerner/measured {h/m:.4f} ({100*(h/m-1):+.1f}%)")
    m1 = sum(implied(u, rt, s1, L, 1e-6) for u, rt in a1 if u > 5) / sum(1 for u, _ in a1 if u > 5)
    # AFF-8 on its own area (as 3t) for comparison, and the appendage drag per unit appendage area
    a8 = rows('8')
    m8 = sum(implied(u, rt, S8, L, 1e-6) for u, rt in a8 if u > 5) / sum(1 for u, _ in a8 if u > 5)
    print(f"\nAFF-8 on its own area (3t): mean (1+k) above 5 m/s {m8:.4f}; AFF-1 {m1:.4f}")
    print("speed exponent of R over 3.05 to 9.25 m/s: measured "
          f"{math.log(a1[-1][1]/a1[0][1])/math.log(a1[-1][0]/a1[0][0]):.3f}, ITTC-57 law "
          f"{(math.log(a1[-1][0]**2*cf_ittc57(a1[-1][0]*L/1e-6))-math.log(a1[0][0]**2*cf_ittc57(a1[0][0]*L/1e-6)))/math.log(a1[-1][0]/a1[0][0]):.3f}")
    # consequence for the REMUS-class hull of milestone 4c (L 1.85 m, D 0.19 m)
    hr = hoerner(0.19 / 1.85)
    print(f"\nREMUS-class d/l {0.19/1.85:.4f}: Hoerner 1+k {hr:.4f}; scaled by SUBOFF measured/Hoerner {hr*m1/h:.4f};"
          " milestone 4c swept 1+k 1.1 / 1.2 / 1.3")


if __name__ == '__main__':
    main()
