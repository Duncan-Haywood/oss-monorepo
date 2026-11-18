"""Milestone 10j: does sizing the hybrid's engine for cruise, with a battery for hover, rescue 10e's short-range break-even?

Predictions (written before the first run):
 (P1) at engine+generator 1 kW/kg, cruise 30 m/s, L/D 12, chain efficiency 0.20, tank 0.25, pack 250 Wh/kg and
      1.5 kW/kg peak power, f_non 0.479: the break-even range against the 250 Wh/kg battery aircraft falls
      from 10e's 67 km to under 35 km;
 (P2) max range at engine 0.5 kW/kg and chain efficiency 0.18 rises from 10e's 314 km to over 700 km;
 (P3) the ranking of sensitivities flips: chain efficiency, not engine specific power, moves max range most
      (compare the swing over the ranges 0.5-2 kW/kg and 0.12-0.30).
Model: 10e's energy model (imports run.py). Hover (2 x 60 s, power Ph per kg MTOW from momentum theory) is flown on
the battery, mass = max(energy / (e_cell kpack u), power / p_batt). The engine delivers cruise electrical power
Pc = g V / (LD eta_c) per kg, times the 1.2 reserve margin, and it also feeds hover: the battery covers only the
shortfall (Ph - 1.2 Pc)+. Fuel = 1.2 Ec / (e_fuel eta_chain), tank = k_tank fuel. Fixed f_non as 10e. Cruise speed,
pack power, p_eng, tank and efficiency are swept, not fitted to a datasheet.
"""
import itertools, math
from run import fractions, G, RESERVE, E_FUEL, T_HOVER
from hybrid_mass_law import maxr, bat_free

def hyb_cruise(R, fnon, p_eng, k_tank, eta_chain, V=30.0, DL=150.0, LD=12.0, e_cell=250, kpack=0.7, u=0.9,
               p_batt=1500.0, eta_c=0.85):
    ph = G * math.sqrt(DL / (2 * 1.225)) / (0.7 * 0.85)            # W per kg MTOW, hover
    pc = RESERVE * G * V / (LD * eta_c)                            # W per kg, engine electrical output
    short = max(ph - pc, 0.0)                                      # battery covers the hover shortfall
    eh = short * T_HOVER / 3600.0                                  # Wh per kg
    mb = max(RESERVE * eh / (e_cell * kpack * u), short / p_batt)
    eng = pc / 1000.0 / p_eng
    ec = G * R / (LD * eta_c) / 3600.0
    fuel = RESERVE * ec / (E_FUEL * eta_chain)
    return 1 - fnon - eng - mb - fuel * (1 + k_tank)

def breakeven(fnon, **kw):
    for Rk in range(1, 1501):
        R = Rk * 1e3
        if hyb_cruise(R, fnon, **kw) > bat_free(R, fnon):
            return Rk
    return None

def main():
    print("Milestone 10j: hybrid with engine sized for cruise, battery for hover (one-way, 20% reserve, payload >= 15% MTOW)")
    b = dict(p_eng=1, k_tank=.25, eta_chain=.20)
    print("\nA. Break-even km vs 250 Wh/kg battery aircraft, f_non 0.479 (10e hover-sized: p_eng 0.5 -> 153, 1 -> 69, 4 -> 6)")
    print("p_eng k_tank eta V -> km")
    for p, k, e, V in itertools.product((0.5, 1, 4), (0.15, 0.5), (0.12, 0.2, 0.3), (30,)):
        print(f"{p:5} {k:6} {e:4} {V} -> {breakeven(.479, p_eng=p, k_tank=k, eta_chain=e, V=V)}")
    print("\nB. Max range km (cap 1500), f_non 0.479, tank 0.25; rows p_eng kW/kg, cols chain efficiency (10e: 0.5 -> 204/314/442/534)")
    etas = (0.12, 0.18, 0.25, 0.30)
    print("p_eng |" + "".join(f"{e:>8}" for e in etas))
    for p in (0.5, 1, 2, 4):
        print(f"{p:5} |" + "".join(f"{maxr(lambda R: hyb_cruise(R, .479, p, .25, e)):8.0f}" for e in etas))
    print("\nC. Sensitivity of max range (km), base p_eng 1, tank 0.25, eta 0.20, V 30, p_batt 1500, f_non 0.479")
    for k, vals in (("p_eng", (0.5, 1, 2)), ("eta_chain", (.12, .2, .3)), ("k_tank", (.1, .25, .6)),
                    ("V", (20, 30, 40)), ("p_batt", (800, 1500, 3000)), ("e_cell", (200, 250, 400))):
        out = []
        for v in vals:
            a = dict(b); a[k] = v
            out.append(maxr(lambda R: hyb_cruise(R, .479, **a)))
        print(f"{k}: {vals} -> " + " ".join(f"{x:.0f}" for x in out))
    print("\nD. Mass split at 150 km, base case (fractions of MTOW)")
    ph = G * math.sqrt(150 / (2 * 1.225)) / (0.7 * 0.85); pc = RESERVE * G * 30 / (12 * .85)
    print(f"hover power {ph:.0f} W/kg, 1.2 x cruise power {pc:.0f} W/kg, battery shortfall {max(ph-pc,0):.0f} W/kg")
    print(f"free (payload) fraction: cruise-sized hybrid {hyb_cruise(150e3,.479,**b):.3f}, hover-sized (10e) "
          f"{__import__('hybrid_mass_law').hyb_free(150e3,.479,1,.25,.20):.3f}, battery {bat_free(150e3,.479):.3f}")

if __name__ == "__main__":
    main()
