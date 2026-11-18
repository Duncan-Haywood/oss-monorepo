"""The lift belt's strands as strings, and its loop's stretch modes with the balls where they ride (2026-11-15;
cad/README.md "Lift strand modes").

    python3 tests/lift_strand_sweep.py

Sideways: each 2.36 m strand between the pulleys' tangent points is a tensioned beam (`Feeder.lift_strand_modes`:
finite differences, tension rising up each strand with its weight and, on the up strand, each loaded flight's pull;
flights' 5 g and the balls as point masses). Every mode under 100 Hz is compared with what shakes the strand
(`lift_strand_excitations`) over the belt's speed range (`lift_speed_range`; since 2026-11-15 the firmware holds the
duty to `lift_v_ref` / battery, so the speed no longer follows the battery, and the last block compares the fixed duty). Stretch: the loop as a bar with both ends on the drive pulley (`lift_belt_axial_modes`),
balls on the up strand only against the same balls spread round the loop (the lumped model's assumption). Every
figure is an assumption (cad params).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "cad"))
from otr_cad.params import Feeder  # noqa: E402

BAND = 0.05     # a mode within 5% of an excitation's speed band counts as in it


def bands(p):
    s = p.lift_speed_range()
    lo, hi = p.lift_strand_excitations(s["lo"]), p.lift_strand_excitations(s["hi"])
    return {k: (min(lo[k], hi[k]) * (1 - BAND), max(lo[k], hi[k]) * (1 + BAND)) for k in lo}


def hits(modes, bnd, names, n_max=None):
    out = []
    for i, f in enumerate(modes[:n_max] if n_max else modes):
        for k in names:
            a, b = bnd[k]
            if a <= f <= b:
                out.append(f"{k} n{i + 1} {f:.2f}")
    return out


LOW = ("ball", "flight", "flight_x2", "flight_x3", "pulley_rev")
TENSION = ("drive_half", "drive", "drive_upper_half", "drive_upper")


def main() -> None:
    p = Feeder()
    print("# python3 tests/lift_strand_sweep.py  (2026-11-15; cad/README.md \"Lift strand modes\")")
    s = p.lift_speed_range()
    ex = p.lift_strand_excitations()
    bnd = bands(p)
    print(f"Belt speed {s['lo']:.2f} to {s['hi']:.2f} x nominal (24 V cut, every flight loaded, {s['i_full_a']:.2f} A; "
          f"29.2 V, empty). Excitations, Hz (nominal; band over that speed range +-{BAND:.0%}):")
    for k, v in ex.items():
        print(f"  {k:17s} {v:6.2f}   ({bnd[k][0]:.2f} to {bnd[k][1]:.2f})")
    pl = p.lift_pluck_design()
    print(f"\nTension setting, stopped and empty, T0 {pl['t0_n']:.1f} N: the strand rings at {pl['pluck_hz']:.2f} Hz "
          f"(2nd {pl['second_hz']:.2f}); the bare formula without the flights' mass gives {pl['bare_hz']:.2f} Hz, and "
          f"tensioning to it sets {pl['over_tension']:.2f} x T0")

    print("\nSideways modes, running (nominal T0; 'every' = a ball on every n-th flight of the up strand):")
    for c in p.lift_strand_cases():
        for le in ((0,) if c.get("loaded_every") == 0 else (1, 2)):
            kw = {k: v for k, v in c.items() if k != "name"}
            kw["loaded_every"] = le
            r = p.lift_strand_modes(**kw)
            m = r["modes_hz"]
            tag = f"{c['name']}, every {le}" if le else c["name"]
            print(f"  {tag}: T {r['t_bottom_n']:.1f} to {r['t_top_n']:.1f} N (min {r['t_min_n']:.1f}), "
                  f"{len(m)} modes under 100 Hz; first five {', '.join(f'{x:.2f}' for x in m[:5])}")
            print(f"      low modes (first 3) in a direct band: {', '.join(hits(m, bnd, LOW, 3)) or 'none'}")
            print(f"      any mode in a drive (tension) band: {', '.join(hits(m, bnd, TENSION)) or 'none'}")
            print(f"      modes in the tooth-mesh band ({bnd['mesh'][0]:.0f}-{bnd['mesh'][1]:.0f} Hz): "
                  f"{len(hits(m, bnd, ('mesh',)))}")

    print("\nWhat moves the empty belt's low modes (the run-on after each ball: both strands at T0) off the flight"
          " rate: T0 x 0.6 to 2.0, a strand off its face, over the speed band:")
    for tf in (0.6, 0.8, 1.0, 1.2, 1.3, 1.5, 2.0):
        r = p.lift_strand_modes("down", "flat", loaded_every=0, t0_factor=tf)
        m = r["modes_hz"]
        h = hits(m, bnd, LOW, 3)
        print(f"  T0 x {tf:3.1f} ({r['t_bottom_n']:5.1f} N at the bottom): first three {', '.join(f'{x:.2f}' for x in m[:3])}"
              f"  in band: {', '.join(h) or 'none'}")
    sr = p.lift_speed_range()
    print(f"  (flight rate {p.lift_strand_excitations(sr['lo'])['flight']:.2f} to "
          f"{p.lift_strand_excitations(sr['hi'])['flight']:.2f} Hz over the battery; at a belt speed held to nominal it is "
          f"{p.lift_strand_excitations()['flight']:.2f} Hz)")

    print("\nAcross the width, edge stiffness swept (PU alone to the cords spread over the width), empty belt:")
    for ef in (0.0, 0.25, 0.5, 1.0):
        r = p.lift_strand_modes("down", "edge", loaded_every=0, edge_ei_factor=ef)
        print(f"  EI {r['ei_nm2']:.2f} N m^2: first three {', '.join(f'{x:.2f}' for x in r['modes_hz'][:3])}; "
              f"{len(r['modes_hz'])} under 100 Hz")

    print("\nLoaded up strand off its face, pads pinned, T0 swept: the spans between loaded flights")
    for le in (1, 2):
        for tf in (0.8, 1.0, 1.2):
            r = p.lift_strand_modes("up", "flat", loaded_every=le, t0_factor=tf, pin_loaded=True)
            m = r["modes_hz"]
            print(f"  every {le}, T0 x {tf:3.1f}: lowest {m[0]:.1f} Hz, {len(m)} span modes under 100 Hz, "
                  f"in a drive band: {', '.join(hits(m, bnd, TENSION)) or 'none'}")

    fixed = Feeder(lift_v_ref=0)
    fb = bands(fixed)
    fs = fixed.lift_speed_range()
    print(f"\nDuty held to {p.lift_v_ref:g} V / battery (speed {s['lo']:.2f}-{s['hi']:.2f}) against a fixed duty "
          f"({fs['lo']:.2f}-{fs['hi']:.2f}): low modes (first 3) in a direct band, per case")
    for c in p.lift_strand_cases():
        for le in ((0,) if c.get("loaded_every") == 0 else (1, 2)):
            kw = {k: v for k, v in c.items() if k != "name"}
            kw["loaded_every"] = le
            m = p.lift_strand_modes(**kw)["modes_hz"]
            tag = f"{c['name']}, every {le}" if le else c["name"]
            print(f"  {tag}: held {', '.join(hits(m, bnd, LOW, 3)) or 'none'} | fixed {', '.join(hits(m, fb, LOW, 3)) or 'none'}")

    b = p.lift_belt_model()
    print(f"\nStretch modes of the loop (lumped model, balls spread, every flight: belt {b['f_belt_hz']:.1f} Hz held; "
          f"stuck {b['f_stuck_hz']:.1f} and {b['f_upper_hz']:.1f} Hz)")
    print("  c_spec  balls       every  held: 1st 2nd     stuck: 1st 2nd 3rd")
    for cs in p.lift_belt_cspec_sweep:
        for le in (1, 2):
            for up in (False, True):
                h_ = p.lift_belt_axial_modes(le, cs, stuck=False, balls_on_up=up, f_max_hz=300.0)["modes_hz"]
                st = [f for f in p.lift_belt_axial_modes(le, cs, stuck=True, balls_on_up=up, f_max_hz=300.0)["modes_hz"] if f > 1.0]
                print(f"  {cs:4.1f}x  {'up strand' if up else 'spread   '}   {le}      {h_[0]:6.1f} {h_[1]:6.1f}"
                      f"     {st[0]:6.1f} {st[1]:6.1f} {st[2]:6.1f}")


if __name__ == "__main__":
    main()
