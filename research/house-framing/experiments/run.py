"""Conventional versus advanced framing on a stylised one-storey house; writes results.txt.

    PYTHONPATH=src python experiments/run.py
"""
from dataclasses import replace
from pathlib import Path

from house_framing.model import (ADVANCED_2X6, CONVENTIONAL_2X4, CONVENTIONAL_2X6, OVE_MEASURES, House,
                                 Loads, apply, header_check, size_header, stud_check, stud_length, takeoff)

HERE = Path(__file__).resolve().parent
PRICES = (0.60, 0.90, 1.20)  # $ per board foot, assumed (not sourced): a sensitivity range
HDD = (2000, 5000, 8000)  # heating degree-days (65 F), assumed climates
lines = []


def out(s=""):
    print(s)
    lines.append(s)


def main():
    house = House()
    out(f"house: {house.width_ft:g} x {house.length_ft:g} ft, one storey, 8 ft walls, "
        f"{2 * house.windows_long + 2 * house.windows_gable} windows, a door and a slider, {house.tees} partition tees")
    out("loads: roof dead 15 psf, roof snow 30 psf, 1 ft overhang, trusses span the width; waste 10%")

    out("\nA. three framing schemes")
    out(f"{'scheme':24s} {'pieces':>6s} {'bf':>6s} {'ff':>6s} {'R_eff':>6s} {'UA':>6s} {'hangers':>7s} {'stud':>5s}  headers")
    res = {}
    for s in (CONVENTIONAL_2X4, CONVENTIONAL_2X6, ADVANCED_2X6):
        r = res[s.name] = takeoff(house, s)
        out(f"{s.name:24s} {r['pieces']:6d} {r['board_feet']:6.0f} {r['framing_factor']:6.3f} {r['r_effective']:6.2f} "
            f"{r['ua_walls']:6.1f} {r['hangers']:7d} {r['stud_ratio']:5.2f}  {','.join(r['headers'])}")
    c, a = res[CONVENTIONAL_2X6.name], res[ADVANCED_2X6.name]
    c4 = res[CONVENTIONAL_2X4.name]
    out(f"advanced vs conventional 2x6: board feet {100 * (a['board_feet'] / c['board_feet'] - 1):+.1f}%, "
        f"pieces {100 * (a['pieces'] / c['pieces'] - 1):+.1f}%, wall UA {100 * (a['ua_walls'] / c['ua_walls'] - 1):+.1f}%")
    out(f"advanced 2x6 vs conventional 2x4: board feet {100 * (a['board_feet'] / c4['board_feet'] - 1):+.1f}%, "
        f"wall UA {100 * (a['ua_walls'] / c4['ua_walls'] - 1):+.1f}%")
    out("lumber cost of the exterior walls at assumed prices ($/bf):")
    for p in PRICES:
        out(f"  ${p:.2f}: " + "  ".join(f"{n} ${r['board_feet'] * p:,.0f}" for n, r in res.items()))
    out("heating through the opaque walls (MMBtu/yr = UA x 24 x HDD / 1e6), assumed climates:")
    for h in HDD:
        out(f"  HDD {h}: " + "  ".join(f"{n} {r['ua_walls'] * 24 * h / 1e6:.1f}" for n, r in res.items()))

    out("\nB. one OVE measure at a time: change in board feet, framing factor and wall UA (Btu/h F)")
    out(f"{'measure':26s} {'added to conv bf':>16s} {'ff':>6s} {'UA':>5s} {'removed from adv bf':>19s} {'ff':>6s} {'UA':>5s}")
    for m in OVE_MEASURES:
        on = takeoff(house, apply(CONVENTIONAL_2X6, [m]))
        off = takeoff(house, replace(ADVANCED_2X6, **{k: getattr(CONVENTIONAL_2X6, k) for k in OVE_MEASURES[m]}))
        out(f"{m:26s} {on['board_feet'] - c['board_feet']:+16.0f} {on['framing_factor'] - c['framing_factor']:+6.3f} "
            f"{on['ua_walls'] - c['ua_walls']:+5.1f} {off['board_feet'] - a['board_feet']:+19.0f} "
            f"{off['framing_factor'] - a['framing_factor']:+6.3f} {off['ua_walls'] - a['ua_walls']:+5.1f}")

    out("\nC. stud capacity: worst NDS ratio (1.00 = at capacity; 'fails' = axial stress above Euler buckling), 8 ft wall, 28 ft span")
    snows = (0, 30, 50, 70, 90)
    out(f"{'stud':12s} {'wind psf':>8s} " + " ".join(f"S={s:<4d}" for s in snows))
    for stud, sp, tp in (("2x4", 16, 2), ("2x4", 24, 1), ("2x6", 16, 2), ("2x6", 24, 1)):
        sl = stud_length(house, replace(CONVENTIONAL_2X6, top_plates=tp))
        for wind in (0, 30):
            r = [stud_check(stud, sp, sl, Loads(width_ft=28, snow_psf=s, wind_psf=wind)) for s in snows]
            out(f"{stud + ' @' + str(sp):12s} {wind:8d} " + " ".join(f"{x:6.2f}" if x < 1e9 else " fails" for x in r))

    out("\nD. smallest passing 2-ply header (sized policy, hangers), by opening and roof snow, 28 ft span")
    out(f"{'opening in':>10s} " + " ".join(f"S={s:<5d}" for s in snows))
    for w in (36, 48, 74, 98):
        row = []
        for s in snows:
            wD, wS = Loads(width_ft=28, snow_psf=s).roof_plf()
            row.append(size_header(w, wD + wS, ADVANCED_2X6) or "none")
        out(f"{w:10d} " + " ".join(f"{x:7s}" for x in row))
    wD, wS = Loads().roof_plf()
    out(f"conventional 2-ply 2x12 over a 36 in window at S=30: worst ratio {header_check('2x12', 38, wD + wS):.2f}")

    out("\nE. footprint sweep (advanced vs conventional 2x6)")
    out(f"{'footprint ft':>12s} {'conv bf':>8s} {'adv bf':>7s} {'saving':>7s} {'conv ff':>8s} {'adv ff':>7s} {'UA cut':>7s}")
    for wft, lft, nw in ((24, 32, 2), (28, 40, 3), (32, 48, 4), (36, 56, 5)):
        h = replace(House(), width_ft=wft, length_ft=lft, windows_long=nw)
        ld = Loads(width_ft=wft)
        rc, ra = takeoff(h, CONVENTIONAL_2X6, ld), takeoff(h, ADVANCED_2X6, ld)
        out(f"{f'{wft} x {lft}':>12s} {rc['board_feet']:8.0f} {ra['board_feet']:7.0f} "
            f"{100 * (1 - ra['board_feet'] / rc['board_feet']):6.1f}% {rc['framing_factor']:8.3f} {ra['framing_factor']:7.3f} "
            f"{100 * (1 - ra['ua_walls'] / rc['ua_walls']):6.1f}%")

    (HERE / "results.txt").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
