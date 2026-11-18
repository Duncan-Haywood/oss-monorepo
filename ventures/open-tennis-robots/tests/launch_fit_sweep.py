"""Launcher efficiency from the wheels' speed drops, on the simulated feeder (2026-11-16, firmware/esp32/README.md
"Shot log").

Each judged feed stroke leaves a record (controller.LaunchCheck.record, sent to the Pi as the LAUNCH frame): both
wheels' targets and how far each one's lowest single-revolution speed fell below it. The ball's momentum is in those
drops, so `tennisbots.launcher.fit_from_drops` reads the launcher's speed and spin efficiencies from a drill's worth of
them, with no radar gun. This sweep runs the real firmware on tests/feeder_sim.py, whose ball leaves with a *true*
launcher model that differs from the planner's (true speed efficiency 0.70 / 0.85 / 0.95, spin efficiency 0.35 / 0.65)
and whose wheels recover with a lag of 0.2 / 0.4 / 0.8 s, fires the 12-shot calibration drill below (1,500 to 6,500
rpm, flat, topspin and backspin) and fits. It reports each fit's error against the truth, and the error of a naive fit
that ignores the tach's recovery (the lowest revolution shows less than the whole drop, more so at low speed).

    PYTHONPATH=src python tests/launch_fit_sweep.py

About two minutes. tests/test_host.py runs two corners. The wheel inertia here is the config's; a heavier true wheel
scales every efficiency the fit reports by the same factor, which one radar reading removes (`inertia_from_radar`,
checked in the test). Physics is the simulator's assumption (first-order wheels, momentum leaving in one instant), not
a measurement.
"""

import sys

from feeder_sim import SimFeeder
from launch_check_sweep import _beat, stroke
from tennisbots import launcher
from tennisbots import protocol as P

DWELL_MS = 2000       # the wheels run at the shot's speed this long before the feed: a drill's interval (3 s by default)

# (top rpm, bottom rpm): speeds 1,500 to 6,500, flat, topspin and backspin; README "Shot log" lists it as a drill
CALIBRATION = [(1500, 1500), (2500, 2500), (4000, 4000), (6000, 6000), (5000, 2000), (2000, 5000),
               (4500, 3000), (3000, 4500), (6500, 4000), (3500, 1500), (1500, 3500), (5500, 5500)]


def records(sim, dwell_ms=DWELL_MS):
    """Fire the calibration drill on one simulated feeder; return the firmware's records as the Pi logs them."""
    out, seen = [], None
    _beat(sim, 1000)
    for top, bottom in CALIBRATION:
        sim.write(P.encode(P.SET_WHEELS, top, bottom))
        _beat(sim, dwell_ms)
        stroke(sim, top, bottom, reaim=False)
        rec = sim.hw.launch_record()
        for _ in range(20):           # the loop-command fit re-sends the record when it is done (flags bit 5 clears)
            if rec is None or not rec[5] & 32:
                break
            _beat(sim, 100)
            rec = sim.hw.launch_record()
        if rec is not None and rec[0] != seen:
            seen = rec[0]
            out.append({"rpm_top": rec[1], "rpm_bottom": rec[2], "drop_top": rec[3] / 1e4,
                        "drop_bottom": rec[4] / 1e4, "launched": bool(rec[5] & 1), "fit_top": bool(rec[5] & 2),
                        "fit_bottom": bool(rec[5] & 4), "loop_top": bool(rec[5] & 8),
                        "loop_bottom": bool(rec[5] & 16)})
    return out


def run_case(speed_eff, spin_eff, tau_s, inertia_x=1.0, dwell_ms=DWELL_MS):
    true = launcher.WheelLauncher(speed_efficiency=speed_eff, spin_efficiency=spin_eff)
    sim = SimFeeder(balls=None, wheel_tau_s=tau_s, true_launcher=true, wheel_inertia=0.00155 * inertia_x)
    recs = records(sim, dwell_ms)
    fit = launcher.fit_from_drops(recs)
    naive = launcher._solve(launcher._drop_rows(recs, launcher.WHEEL_INERTIA_KGM2, launcher.BALL_KG, 0.075), None, True)
    return fit, naive[0], recs, sim


def main():
    print("true_se true_sp tau_s | fit_se  err    fit_sp  err    recovery_s rms     | naive_se err")
    worst_se = worst_sp = worst_naive = 0.0
    for tau_s in (0.2, 0.4, 0.8):
        for speed_eff in (0.70, 0.85, 0.95):
            for spin_eff in (0.35, 0.65):
                fit, naive_se, recs, _ = run_case(speed_eff, spin_eff, tau_s)
                e_se = fit.speed_efficiency / speed_eff - 1
                e_sp = fit.spin_efficiency / spin_eff - 1
                e_nv = naive_se / speed_eff - 1
                worst_se, worst_sp = max(worst_se, abs(e_se)), max(worst_sp, abs(e_sp))
                worst_naive = max(worst_naive, abs(e_nv))
                rec_s = "none" if fit.recovery_s is None else f"{fit.recovery_s:.3f}"
                print(f"{speed_eff:7.2f} {spin_eff:7.2f} {tau_s:5.1f} | {fit.speed_efficiency:.3f} {e_se:+.1%}  "
                      f"{fit.spin_efficiency:.3f} {e_sp:+.1%}  {rec_s:>10} {fit.rms:.4f} | {naive_se:.3f} {e_nv:+.1%}"
                      f"  ({len(recs)} shots)")
                sys.stdout.flush()
    print(f"worst error: speed efficiency {worst_se:.1%}, spin efficiency {worst_sp:.1%}; "
          f"naive speed efficiency {worst_naive:.1%}")


if __name__ == "__main__":
    main()
