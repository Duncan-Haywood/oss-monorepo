"""Milestone 7zb: the energy model as a figure (the paper's Fig. 1, the method figure).

    PYTHONPATH=src:experiments python3 experiments/run_energy_split.py > experiments/results_energy_split.txt

Not a new sweep. The central 4 m Wigley monohull of Fig. 2 (run_range_speed: L/B 10, k 0.25,
Michell wave scale 1, 200 kg, 10 kWh, 30 W hotel, eta 0.55 x 0.85), with its electrical energy per
kilometre split into the model's four terms:

    E/km = [R_F + k R_F + R_W] / (eta_p eta_m) + P_hotel / v        (J/m; printed in Wh/km)

R_F the ITTC 1957 friction on the wetted area, k R_F the form-factor part, R_W the Michell
thin-ship wave resistance. Range is battery energy over E/km, so the minimum of the total is
Fig. 2a's peak. The figure shows what the paper's model section says in words: the hotel term
falls as 1/v, the hull terms grow as about v^1.8, and the best-range speed sits where the two
meet in slope, with the propulsive share near one third.

Expectations written before the first run (a figure step, not a hypothesis test):
  (M1) the total's minimum on the 0.05 m/s grid is at 1.00 m/s and equals 10000 / 823.7 =
       12.14 Wh/km, reproducing Fig. 2a's monohull peak to the printed digit;
  (M2) at that minimum the propulsive share of electrical power lies in 0.30 to 0.40;
  (M3) the Michell wave term is under 15% of the hull resistance at 1.00 m/s (Fr 0.16);
  (M4) at 0.50 m/s the hotel term is more than twice the three hull terms together, and at
       2.00 m/s the hull terms are more than twice the hotel term;
  (M5) the form part is k / (1 + k) = 20% of the viscous resistance at every speed (identity
       check of the split, not a finding).
"""
import math
import sys

from marine_hull.hull import cf_ittc57, RHO_SEA, NU_SEA
import run_michell as rm

WH = rm.M * rm.FB * 200.0
ETA = 0.55 * 0.85
HOTEL = rm.HOTEL
K = 0.25
LENGTH = 4.0
SPEEDS = [i / 20.0 for i in range(6, 51)]       # 0.30 to 2.50 m/s


def split(u):
    """Electrical energy per km (Wh/km) by term at speed u (m/s)."""
    l, b, t, s = rm.hull(LENGTH, 1)
    rf = 0.5 * RHO_SEA * u * u * s * cf_ittc57(u * LENGTH / NU_SEA)
    rw = rm.wave_resistance_wigley(u, l, b, t, n_hulls=1, sep=0.0)
    to_whkm = 1000.0 / 3600.0 / ETA          # N (J/m) at the shaft -> Wh/km electrical
    return {"friction": rf * to_whkm, "form": K * rf * to_whkm, "wave": rw * to_whkm,
            "hotel": HOTEL / u * 1000.0 / 3600.0}


def main(out=sys.stdout):
    p = lambda s="": print(s, file=out)
    p("basis: central 4 m Wigley monohull, L/B 10, k 0.25, Michell wave scale 1; 200 kg, "
      f"{WH:.0f} Wh, hotel {HOTEL:.0f} W, eta 0.55 x 0.85")
    rows = [(u, split(u)) for u in SPEEDS]
    best = min(rows, key=lambda r: sum(r[1].values()))
    u, d = best
    tot = sum(d.values())
    hull = d["friction"] + d["form"] + d["wave"]
    p(f"minimum total {tot:.2f} Wh/km at {u:.2f} m/s; range {WH / tot:.1f} km")
    p(f"propulsive share at minimum {hull / tot:.3f}")
    r1 = split(1.0)
    p(f"wave share of hull resistance at 1.00 m/s {r1['wave'] / (r1['friction'] + r1['form'] + r1['wave']):.3f}"
      f" (Fr {1.0 / math.sqrt(9.81 * LENGTH):.3f})")
    for v in (0.5, 2.0):
        r = split(v)
        h = r["friction"] + r["form"] + r["wave"]
        p(f"at {v:.2f} m/s: hotel {r['hotel']:.2f}, hull {h:.2f} Wh/km, hotel/hull {r['hotel'] / h:.2f}")
    worst = max(abs(r["form"] / (r["friction"] + r["form"]) - K / (1 + K)) for _, r in rows)
    p(f"form share of viscous, max deviation from k/(1+k): {worst:.2e}")
    p("# split: speed_m_s friction form wave hotel total (Wh/km)")
    for v, r in rows:
        p(f"split {v:.2f} {r['friction']:.3f} {r['form']:.3f} {r['wave']:.3f} {r['hotel']:.3f} "
          f"{sum(r.values()):.3f}")


if __name__ == "__main__":
    main()
