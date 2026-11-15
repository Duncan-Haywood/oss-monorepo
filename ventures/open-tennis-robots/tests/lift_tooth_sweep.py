"""Tooth jump at the lift's drive pulley during a hood jam (2026-11-15; cad/README.md "Lift tooth jump").

    python3 tests/lift_tooth_sweep.py

A hood jam slackens the up strand (tests/lift_jam_sweep.py --belt: 0.34-0.60 s at zero tension) while the tight
strand pulls up to 100 N on the 16-tooth drive pulley (89 N until the duty was held to the battery; --chain agrees).
This prints the two checks in `Feeder.lift_tooth_jump_design`
(tooth strength against the catalogue's specific tooth force; ratcheting, the wrap's hold against the flanks'
push-out) over every corner of belt stiffness, tooth stiffness, flank angle and flank friction, for the 16-tooth
pulley and the 20-tooth one the open item proposed. Every figure is an assumption (cad params).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "cad"))
from otr_cad.params import Feeder  # noqa: E402


def main() -> None:
    p = Feeder()
    print("# python3 tests/lift_tooth_sweep.py  (2026-11-15; cad/README.md \"Lift tooth jump\")")
    hub_n = p.lift_slip_design()["stick_hi_nm"] / (p.lift_pd / 2000)
    print(f"Jam pull: {p.lift_jam_belt_n:g} N net (tests/lift_jam_sweep.py --belt and --chain; the hub's highest sticking torque "
          f"over the pitch radius alone is {hub_n:.0f} N), slack strand at 0 N")
    for z in (p.lift_pulley_teeth, 20):
        pull = p.lift_jam_belt_n * p.lift_pulley_teeth / z      # the hub caps torque, so a bigger pulley pulls less
        d = p.lift_tooth_jump_design(pulley_teeth=z, pull_n=pull)
        print(f"\n{z}-tooth drive pulley (pitch radius {d['r_mm']:.2f} mm, {d['mesh']} teeth in mesh, {d['rpm']:g} rpm):")
        print(f"  strength: F_Uspec {d['fuspec_n_mm']:.2f} N/mm x {p.lift_belt_w:g} mm x {min(d['mesh'], p.lift_tooth_mesh_max)}"
              f" teeth = {d['allow_n']:.0f} N against {pull:.0f} N ({d['strength_margin']:.1f}x)")
        print(f"  ratchet, nominal (c_spec 1x, G {p.lift_tooth_g_mpa:g} MPa -> tooth {d['k_tooth_n_m'] / 1e3:.0f} N/mm, "
              f"flank {p.lift_tooth_flank_deg:g} deg, mu {p.lift_tooth_mu:g}): load spreads over {d['lambda_teeth']:.1f} "
              f"teeth (the first takes {100 * d['first_tooth_share']:.0f}%); hold {d['hold_n']:.0f} N, push-out "
              f"{d['push_n']:.0f} N, margin {d['jump_margin']:.2f}x")
        w = p.lift_tooth_jump_sweep(pulley_teeth=z)
        print(f"  corners (c_spec x G x flank x mu = {len(w['rows'])}): margin below 1 in {len(w['fail'])}, below "
              f"{p.lift_tooth_jump_factor:g} in {sum(r['margin'] < p.lift_tooth_jump_factor for r in w['rows'])}")
        print("  worst ten: c_spec  G MPa  flank  mu    spread(teeth)  margin  static T0 for the factor")
        for r in w["rows"][:10]:
            print(f"             {r['cspec']:4.1f}x  {r['g_mpa']:5.0f}  {r['flank']:5.0f}  {r['mu']:4.2f}  {r['lambda_teeth']:6.2f}"
                  f"         {r['margin']:5.2f}   {r['t0_need_n']:5.1f} N")
    print(f"\nStatic tension now: T0 {p.lift_tension_design()['t0_n']:.1f} N (lift_tension_design)")
    print("With the slack strand at zero the margin does not depend on the pull, so cutting a hood jam sooner does not "
          "change it; only a slack strand kept taut (T0 over half the pull) or friction on the flanks does.")


if __name__ == "__main__":
    main()
