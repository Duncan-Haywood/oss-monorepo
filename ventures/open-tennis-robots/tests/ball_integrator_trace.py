"""The slow wheel's integrator through one ball (2026-11-17, firmware/esp32/README.md "A ball charged the integrator").

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/ball_integrator_trace.py [--before] [--shot 0|1]

The build of "The slow drill's release timeout" (first-order plant, wheel lag 0.8 s, true launcher 0.95 / 0.35,
`host.HOLD_RPM` 3,000), the slow drill's first three shots. Every 0.1 s from shot 1's ball to shot 2's it prints the
bottom wheel's target, the tach's reading, the simulator's true speed, the loop's integrator and its command beside the
feedforward. `--shot 0` prints from shot 0's ball instead, which covers the brake from 3,895 to 526 rpm before shot 1.
`--before` runs the loop before this change (`LOOP_BALL_BAND` None, `LOOP_RAMP_HOLD` False, `LOOP_I_FF_MAX` None).
About 2 minutes.
"""

import sys

from feeder_sim import SimFeeder, controller
import min_fit_rpm_sweep as m
from tennisbots import host, launcher

if "--before" in sys.argv:
    controller.LOOP_BALL_BAND, controller.LOOP_RAMP_HOLD, controller.LOOP_I_FF_MAX = None, False, None
SHOT = int(sys.argv[sys.argv.index("--shot") + 1]) if "--shot" in sys.argv else 1
host.HOLD_RPM = 3000.0
sim = SimFeeder(balls=None, wheel_tau_s=0.8, true_launcher=launcher.WheelLauncher(speed_efficiency=0.95,
                                                                                   spin_efficiency=0.35))
shots = host.plan_drill(m.slow_drill())[:3]
loop = sim.hw.wheel_loops[1]
update, last = loop.update, [-1.0]


def traced(target, measured, dt, ramping=False):
    cmd = update(target, measured, dt, ramping)
    now = sim.clock()
    if len(sim.released) == SHOT + 1 and now - last[0] >= 0.1:
        last[0] = now
        print(f"{now:7.2f} target {target:5.0f} tach {measured:5.0f} true {sim.wheel[1]:6.1f} integrator {loop.i:+.5f} "
              f"command {cmd:.4f} feedforward {target * loop.ff:.4f} ball hold {loop.recover}")
    return cmd


loop.update = traced
res = host.run_drill(host.FeederLink(sim, sim.clock), shots, sim.sleep, log=lambda *a: None)
print("releases:", ", ".join(f"{r[0]:.2f} s" for r in sim.released), "| drill ok" if res.ok else f"| {res.aborted}")
