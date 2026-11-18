"""Milestone 3t: does the programme's submerged-body drag law (ITTC-57 line x (1+k) x wetted area) match the
measured DARPA SUBOFF tow-tank resistance, and what (1+k) does the measurement imply?

Data: DTMB tow tank, SUBOFF model 5470, Liu & Huang 1998 (CRDKNSWC/HD-1298-11) Table 14, as digitised in Zenodo
22692726 (CC-BY-4.0, F. Hermet), copied to data/suboff_dtmb_table14.csv. Wetted area of the fully appended
AFF-8 body, 6.3367 m2, from the same record (computed from its mesh; it says it matches the published value).
Model scale tank, tripwires at 5% chord so the boundary layer is turbulent; L = 4.356 m (DTIC report text),
fresh water rho 998.2 kg/m3 (the record's value), nu 1.0e-6 m2/s (assumed 20 C; swept 0.95 to 1.15e-6).
Submerged, so no wave term (wave_scale = 0): this isolates the viscous law the AUV cases use.

Predictions, written before the first run:
 P1: implied (1+k_eff) of AFF-8 lies in 1.3 to 1.7 (the programme's AUV k of 0.1 to 0.3 plus appendages).
 P2: it varies by under 5% across the six speeds (ITTC-57 Re scaling is right).
 P3: the bare hull carries 80 to 90% of AFF-8 resistance at matched speeds.
Run: PYTHONPATH=src python3 experiments/run_suboff_check.py > experiments/results_suboff_check.txt
"""
import csv
import os
from marine_hull.hull import cf_ittc57

L, S8, RHO = 4.356, 6.3367, 998.2
HERE = os.path.dirname(os.path.abspath(__file__))


def load():
    with open(os.path.join(HERE, 'data', 'suboff_dtmb_table14.csv')) as f:
        rows = [r for r in csv.reader(l for l in f if not l.startswith('#'))]
    h = rows[0]
    return [dict(zip(h, r)) for r in rows[1:]]


def implied_k(rt, u, nu=1.0e-6, s=S8):
    """(1+k) such that 0.5 rho U^2 S (1+k) Cf(Re) = Rt."""
    return rt / (0.5 * RHO * u * u * s * cf_ittc57(u * L / nu))


def share(rows, nu=None):
    """Bare hull / AFF-8 resistance by log-log interpolation of the AFF-8 curve at each AFF-1 speed."""
    import math
    a8 = sorted((float(r['speed_ms']), float(r['resistance_N'])) for r in rows if r['config'] == '8')
    out = []
    for r in rows:
        if r['config'] != '1':
            continue
        u, rt = float(r['speed_ms']), float(r['resistance_N'])
        for (u0, r0), (u1, r1) in zip(a8, a8[1:]):
            if u0 <= u <= u1:
                n = math.log(r1 / r0) / math.log(u1 / u0)
                out.append((u, rt / (r0 * (u / u0) ** n)))
                break
    return out


def main():
    rows = load()
    print(f"SUBOFF AFF-8, L {L} m, S {S8} m2, rho {RHO}; wave term off (submerged)")
    for nu in (0.95e-6, 1.0e-6, 1.15e-6):
        ks = [implied_k(float(r['resistance_N']), float(r['speed_ms']), nu) for r in rows if r['config'] == '8']
        print(f"nu {nu:.2e}: (1+k_eff) " + ' '.join(f"{k:.3f}" for k in ks)
              + f"  spread {100*(max(ks)-min(ks))/(sum(ks)/len(ks)):.1f}%")
    print("speed m/s, Re, Rt N, Cf ITTC57, (1+k_eff) at nu 1.0e-6")
    for r in rows:
        if r['config'] == '8':
            u, rt = float(r['speed_ms']), float(r['resistance_N'])
            print(f"{u:.3f} {u*L/1e-6:.2e} {rt:.1f} {cf_ittc57(u*L/1e-6):.5f} {implied_k(rt, u):.3f}")
    sh = share(rows)
    print("bare hull share of AFF-8 resistance: " + ' '.join(f"{u:.2f}m/s:{s:.3f}" for u, s in sh))
    # one-parameter law R = a U^n on the AFF-8 data: exponent against ITTC-57's local exponent
    import math
    a8 = [(float(r['speed_ms']), float(r['resistance_N'])) for r in rows if r['config'] == '8']
    n = math.log(a8[-1][1] / a8[0][1]) / math.log(a8[-1][0] / a8[0][0])
    m = [math.log(0.5 * RHO * u * u * cf_ittc57(u * L / 1e-6)) for u, _ in (a8[0], a8[-1])]
    nm = (m[1] - m[0]) / math.log(a8[-1][0] / a8[0][0])
    print(f"speed exponent of R over {a8[0][0]:.2f} to {a8[-1][0]:.2f} m/s: measured {n:.3f}, ITTC-57 law {nm:.3f}")


if __name__ == '__main__':
    main()
