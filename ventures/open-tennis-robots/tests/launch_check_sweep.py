"""Empty-hopper check margins on the simulated feeder (2026-11-16, firmware/esp32/README.md "Empty hopper").

The firmware (controller.LaunchCheck) calls a feed stroke launched when the wheel with the larger predicted speed drop
falls by LAUNCH_DIP_SHARE (0.25) of the prediction, and by LAUNCH_DIP_MIN (1.5%) at least, measured from the wheel's own
speed when the ball met it (since 2026-11-16 evening; before, from its target). Its prediction uses config.py's
numbers: the CAD's wheel inertia and the launcher's speed efficiency 0.85. A real build differs, so this sweep runs the
real firmware on tests/feeder_sim.py with the true inertia, the true share of momentum the ball takes (`launch_eff`,
standing for a lower speed efficiency or a ball that slips) and the wheel's spin-up lag all off the config's, and for
each shot reports the measured drop over the threshold:

- loaded strokes (a ball in the pocket) must read >= 1: margin = the smallest ratio;
- dry strokes (empty pocket) must read < 1: margin = the largest ratio.

Two ways to feed: "steady" waits for the firmware's gate with the wheels already at the shot's speed, and "fed at the
gate" sets the shot's speed from another one (0.5, 0.8, 1.25 or 1.5 times it) and feeds at once, so the stroke starts
the moment the 3% gate opens, with the wheel still closing on its target. A drill does that whenever the interval has
run out before the wheels settle. Each is reported for the verdict the firmware uses (the drop from the pre-ball speed)
and for the target-based one it used before (`LaunchCheck.last_dip_target`).

    PYTHONPATH=src python tests/launch_check_sweep.py

Takes about two minutes (eval/launch-check-gate-2026-11-16.txt). tests/test_host.py runs the corners. Physics here is the simulator's assumption (first-order
wheels, an instant momentum transfer), not a measurement: the first build should log `launch.last_dip` for a few
dozen real shots and dry strokes and compare.
"""

import sys

from feeder_sim import SimFeeder
from tennisbots import protocol as P

# (top rpm, bottom rpm): flat at three speeds, heavy topspin, heavy backspin, the fastest the planner allows
SHOTS = [(1500, 1500), (3000, 3000), (6500, 6500), (5000, 1500), (1500, 5000), (7000, 2500)]


def _beat(sim, ms):
    """Run `ms` with heartbeats every 100 ms, as the Pi would."""
    for _ in range(ms // 100):
        sim.write(P.encode(P.HEARTBEAT))
        sim.run_ms(100)


def stroke(sim, top, bottom, reaim=True):
    """Spin the wheels to (top, bottom), wait for the firmware's steady gate, feed one ball and return the ratio
    (measured drop / threshold, measured drop) at the verdict ((None, None) if no verdict came)."""
    hw = sim.hw
    sim.write(P.encode(P.SET_WHEELS, top, bottom))
    sim.write(P.encode(P.SET_AIM, 0, 0))
    for _ in range(150):
        _beat(sim, 100)
        if hw.wheels_steady.steady and hw.aim_settled():
            break
    before = hw.launches + hw.dry_strokes
    fed = hw.fed
    sim.write(P.encode(P.FEED, 1))
    for k in range(400):
        if k % 10 == 0:
            sim.write(P.encode(P.HEARTBEAT))
        sim.run_ms(10)
        if hw.fed != fed and reaim:
            # the worst Pi: it re-aims (here to half speed) the very millisecond the release is counted, which ends
            # the firmware's watch; a real Pi sees the count up to a telemetry period (100 ms) later
            sim.write(P.encode(P.SET_WHEELS, top // 2, bottom // 2))
            fed = hw.fed
        if hw.launches + hw.dry_strokes > before:
            _, need = hw.launch.threshold((top, bottom))
            return hw.launch.last_dip / need, hw.launch.last_dip
    return None, None


def settle(sim, top, bottom):
    sim.write(P.encode(P.SET_WHEELS, top, bottom))
    sim.write(P.encode(P.SET_AIM, 0, 0))
    for _ in range(150):
        _beat(sim, 100)
        if sim.hw.wheels_steady.steady and sim.hw.aim_settled():
            break


def stroke_at_gate(sim, top, bottom):
    """Set (top, bottom) and FEED in the same breath, so the stroke starts as the gate opens; re-aim to half speed
    the millisecond the release is counted. Returns (pre-ball ratio, target ratio) at the verdict, or (None, None)."""
    hw = sim.hw
    before = hw.launches + hw.dry_strokes
    sim.write(P.encode(P.SET_WHEELS, top, bottom))
    sim.write(P.encode(P.FEED, 1))
    fed = hw.fed
    for k in range(1500):
        if k % 10 == 0:
            sim.write(P.encode(P.HEARTBEAT))
        sim.run_ms(10)
        if hw.fed != fed:
            sim.write(P.encode(P.SET_WHEELS, top // 2, bottom // 2))
            fed = hw.fed
        if hw.launches + hw.dry_strokes > before:
            _, need = hw.launch.threshold((top, bottom))
            return hw.launch.last_dip / need, hw.launch.last_dip_target / need
    return None, None


PREV = (0.5, 0.8, 1.25, 1.5)      # the speed before the shot's, as a multiple of it


def run_gate_case(inertia_x, launch_eff, tau_s):
    """Fed at the gate: (loaded min, dry max) for the pre-ball verdict and for the target verdict, and the count of
    wrong verdicts for each, over every shot and previous speed the planner allows (500..7,000 rpm)."""
    worst = {"pre": [1e9, -1e9, 0], "target": [1e9, -1e9, 0]}
    for top, bottom in SHOTS:
        for prev in PREV:
            pt, pb = int(top * prev), int(bottom * prev)
            if max(pt, pb) > 7000 or min(pt, pb) < 500:
                continue
            sim = SimFeeder(balls=0, wheel_inertia=0.00155 * inertia_x, launch_eff=launch_eff, wheel_tau_s=tau_s)
            _beat(sim, 1000)
            settle(sim, pt, pb)
            loaded = stroke_at_gate(sim, top, bottom)     # the pocket's ball
            settle(sim, pt, pb)
            dry = stroke_at_gate(sim, top, bottom)        # nothing behind it
            for j, key in enumerate(("pre", "target")):
                w = worst[key]
                lo = -1 if loaded[j] is None else loaded[j]
                hi = 1e9 if dry[j] is None else dry[j]
                w[0], w[1] = min(w[0], lo), max(w[1], hi)
                w[2] += (lo < 1) + (hi >= 1)
    return worst


def run_case(inertia_x, launch_eff, tau_s):
    lo_loaded, hi_dry = 1e9, -1e9
    for top, bottom in SHOTS:
        sim = SimFeeder(balls=0, wheel_inertia=0.00155 * inertia_x, launch_eff=launch_eff, wheel_tau_s=tau_s)
        _beat(sim, 1000)                      # connect: heartbeats clear the watchdog, the bus settles
        loaded, dip = stroke(sim, top, bottom)     # the pocket's ball
        dry, dry_dip = stroke(sim, top, bottom)    # nothing behind it
        if loaded is None or loaded < lo_loaded:
            lo_loaded, lo_at = (-1 if loaded is None else loaded), (top, bottom, dip)
        if dry is None or dry > hi_dry:
            hi_dry, hi_at = (1e9 if dry is None else dry), (top, bottom, dry_dip)
    return lo_loaded, hi_dry, lo_at, hi_at


def main():
    print("inertia_x launch_eff tau_s  loaded_min(>=1) at (top, bottom, drop)   dry_max(<1) at (top, bottom, drop)")
    worst_loaded, worst_dry = 1e9, -1e9
    for inertia_x in (0.7, 1.0, 1.5):
        for launch_eff in (0.6, 0.8, 1.0):
            for tau_s in (0.2, 0.4, 0.8):
                lo, hi, lo_at, hi_at = run_case(inertia_x, launch_eff, tau_s)
                worst_loaded, worst_dry = min(worst_loaded, lo), max(worst_dry, hi)
                print(f"{inertia_x:9.1f} {launch_eff:10.1f} {tau_s:5.1f}  {lo:5.2f} at {lo_at[0]}/{lo_at[1]} {lo_at[2]:.3f}"
                      f"   {hi:5.3f} at {hi_at[0]}/{hi_at[1]} {hi_at[2]:.4f}")
                sys.stdout.flush()
    print(f"worst: loaded {worst_loaded:.2f} (must be >= 1), dry {worst_dry:.3f} (must be < 1)")
    print()
    print("fed at the gate (previous speed 0.5/0.8/1.25/1.5 x the shot's), pre-ball verdict | target verdict")
    print("inertia_x launch_eff tau_s  loaded_min dry_max wrong | loaded_min dry_max wrong")
    tot = {"pre": [1e9, -1e9, 0], "target": [1e9, -1e9, 0]}
    for inertia_x in (0.7, 1.0, 1.5):
        for launch_eff in (0.6, 0.8, 1.0):
            for tau_s in (0.2, 0.4, 0.8):
                w = run_gate_case(inertia_x, launch_eff, tau_s)
                for key in tot:
                    t = tot[key]
                    t[0], t[1], t[2] = min(t[0], w[key][0]), max(t[1], w[key][1]), t[2] + w[key][2]
                p, q = w["pre"], w["target"]
                print(f"{inertia_x:9.1f} {launch_eff:10.1f} {tau_s:5.1f}  {p[0]:10.2f} {p[1]:7.3f} {p[2]:5d} |"
                      f" {q[0]:10.2f} {q[1]:7.3f} {q[2]:5d}")
                sys.stdout.flush()
    for key in ("pre", "target"):
        t = tot[key]
        print(f"worst, {key} verdict: loaded {t[0]:.2f} (must be >= 1), dry {t[1]:.3f} (must be < 1), wrong {t[2]}")


if __name__ == "__main__":
    main()
