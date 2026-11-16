"""Empty-hopper check margins on the simulated feeder (2026-11-16, firmware/esp32/README.md "Empty hopper").

The firmware (controller.LaunchCheck) calls a feed stroke launched when the wheel with the larger predicted speed drop
falls by LAUNCH_DIP_SHARE (0.4) of the prediction, and by LAUNCH_DIP_MIN (2%) at least. Its prediction uses config.py's
numbers: the CAD's wheel inertia and the launcher's speed efficiency 0.85. A real build differs, so this sweep runs the
real firmware on tests/feeder_sim.py with the true inertia, the true share of momentum the ball takes (`launch_eff`,
standing for a lower speed efficiency or a ball that slips) and the wheel's spin-up lag all off the config's, and for
each shot reports the measured drop over the threshold:

- loaded strokes (a ball in the pocket) must read >= 1: margin = the smallest ratio;
- dry strokes (empty pocket) must read < 1: margin = the largest ratio.

    PYTHONPATH=src python tests/launch_check_sweep.py

Takes about a minute. tests/test_host.py runs the corners. Physics here is the simulator's assumption (first-order
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


if __name__ == "__main__":
    main()
