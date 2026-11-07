"""Milestone 10c: do the 10b energy model and the non-energy fraction carry over to the NASA fuel-burning designs?

Source (read this session from NTRS 20180003381 full text): Johnson, Silva and Solis, "Concept vehicles for VTOL air taxi
operations", AHS 2018, Tables 9 to 11. Mission (Table 1): 2 min hover OGE per 50 nm leg at takeoff and at landing,
cruise at best-range speed, reserve 20 min at cruise speed; legs repeat for every 50 nm of range; 5000 ft ISA+20 C.

Predictions (written before the first run):
 (P1) Shaft energy from the 10b model (momentum-theory hover / aircraft FM, cruise at W V/(L/De), reserve), divided into
      the published takeoff fuel weight, implies a specific fuel consumption within 0 to +30% of each engine's published
      MCP SLS sfc (part-power and altitude lapse cost fuel; a model that has the physics right lands slightly above).
      Checked on the turboshaft side-by-side (sfc 0.574 lb/hp/h) and turboshaft tiltwing (0.491).
 (P2) The published non-energy fraction (WO/GW without battery; fuel and tank are inside it only as tank weight) of the five
      designs that carry fuel or a generator (SBS hybrid 0.586, SBS turboshaft 0.601, tiltwing turboelectric 0.613,
      turboshaft 0.561, tailprop 0.617) has a spread (max minus min) under 0.07, while the two battery-electric designs of
      10b (0.583, 0.479) are not inside that band: the fraction follows the propulsion architecture, not payload (250 to 3000 lb).
 (P3) Payload 1200 lb and 3000 lb designs of the same propulsion (turboshaft SBS 0.601 vs tiltwing 0.561) differ by less
      than 0.05, so there is no payload trend inside one architecture.
"""
import math

G, LB, FT, NM, KN, HP = 9.80665, 0.45359237, 0.3048, 1852.0, 0.514444, 745.7
RHO = 84300.0 / (287.05 * 298.24)

# name: dl lb/ft2, aircraft FM, aircraft L/De, cruise kn, range nm, TO GW lb, TO fuel lb, published sfc lb/hp/h, WO/GW wo battery, payload lb
FUEL = {
    "SBS turboshaft": dict(dl=3.5, fm=0.67, lde=6.21, vkn=113, nm=200, gw=3831, fuel=329, sfc=0.574, fne=0.601, pay=1200),
    "tiltwing turboshaft": dict(dl=30, fm=0.76, lde=7.28, vkn=183, nm=400, gw=11654, fuel=2116, sfc=0.491, fne=0.561, pay=3000),
}
FNE_ALL = {  # WO/GW (without battery) from Tables 9 to 11, with payload lb and class
    "quadrotor electric (T9)": (0.583, 250, "battery"),
    "SBS electric (T10)": (0.479, 1200, "battery"),
    "SBS hybrid (T10)": (0.586, 1200, "fuel"),
    "SBS turboshaft (T10)": (0.601, 1200, "fuel"),
    "tiltwing turboelectric (T11)": (0.613, 3000, "fuel"),
    "tiltwing turboshaft (T11)": (0.561, 3000, "fuel"),
    "tiltwing tailprop (T11)": (0.617, 3000, "fuel"),
}

def shaft_energy_per_gw_kg(d, vkn=None, reserve_min=20.0):
    """J per kg of gross weight: hover 2x2 min per leg, cruise at V for the range, reserve at V."""
    legs = d["nm"] / 50.0
    dl = d["dl"] * LB * G / FT**2
    ph = G * math.sqrt(dl / (2 * RHO)) / d["fm"]       # W/kg
    v = (vkn or d["vkn"]) * KN
    R = d["nm"] * NM
    return ph * 240.0 * legs + G * R / d["lde"] + G * v / d["lde"] * reserve_min * 60.0

def main():
    print("Milestone 10c: 10b energy model and non-energy fraction against NASA fuel designs (Johnson et al. 2018, T10, T11)")
    print(f"air density {RHO:.3f} kg/m3\n")
    print("A. Implied sfc: model shaft energy against published takeoff fuel weight")
    print("design               | shaft kWh/GW-t | fuel/GW  | implied sfc lb/hp/h | published MCP | ratio")
    for n, d in FUEL.items():
        e = shaft_energy_per_gw_kg(d)                      # J/kg GW
        shaft_hp_h = e * (d["gw"] * LB) / 3600.0 / HP      # hp.h total
        sfc = d["fuel"] / shaft_hp_h
        print(f"{n:20s} | {e/3.6e6*1000:14.1f} | {d['fuel']/d['gw']:.4f}   | {sfc:.3f}               | {d['sfc']:.3f}         | {sfc/d['sfc']:.2f}")
    print("\nA2. Sensitivity of implied sfc ratio to reserve speed and reserve length")
    for n, d in FUEL.items():
        for rm, vk in ((20, d['vkn']), (20, 0.75 * d['vkn']), (30, d['vkn']), (0, d['vkn'])):
            e = shaft_energy_per_gw_kg(d, vkn=vk, reserve_min=rm)
            sfc = d["fuel"] / (e * d["gw"] * LB / 3600.0 / HP)
            print(f"  {n:20s} reserve {rm:2d} min at {vk:5.0f} kn: ratio {sfc/d['sfc']:.2f}")
    print("\nB. Non-energy fraction (WO/GW without battery) across all published designs")
    print("design                         | payload lb | fne    | class")
    for n, (f, p, c) in FNE_ALL.items():
        print(f"{n:30s} | {p:10d} | {f:.3f}  | {c}")
    fuel_f = [f for f, p, c in FNE_ALL.values() if c == "fuel"]
    batt_f = [f for f, p, c in FNE_ALL.values() if c == "battery"]
    lo, hi = min(fuel_f), max(fuel_f)
    print(f"\nP2: fuel/generator designs span {lo:.3f} to {hi:.3f}, spread {hi-lo:.3f}; battery-electric {batt_f}; "
          f"inside band: {[b for b in batt_f if lo <= b <= hi]}")
    print(f"P3: turboshaft 1200 lb {0.601:.3f} vs turboshaft 3000 lb {0.561:.3f}: difference {abs(0.601-0.561):.3f}")
    print("\nC. Payload fraction check: 1 - fne - fuel/GW against published Wpayload/GW")
    for n, d in FUEL.items():
        print(f"  {n:20s} {1-d['fne']-d['fuel']/d['gw']:.3f} vs published {d['pay']/d['gw']:.3f}")

if __name__ == "__main__":
    main()
