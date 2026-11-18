"""Does the loop-command drop fit say when a wheel is not the first-order lag it assumes? (2026-11-16, firmware/esp32/
README.md "When the wheel is not a first-order lag").

`controller.drop_from_commands` fits the wheel as a first-order lag of the ESC commands, which is exactly what the
simulator's wheel is, so every number measured so far is the method's best case. Here one wheel runs on the
firmware's own PeriodTach and WheelLoop (1 ms steps, the loop every 10 ms, as tests/test_host.py's LoopDropTest) with
plants that break that model in ways a real build might:

  first     the model itself (the baseline)
  torque    the motor's current limit caps the wheel's acceleration (a_max rpm/s), so recovery is a ramp first
  esc       the ESC's own speed control adds a second lag (tau_esc) between command and torque
  curve     speed is not proportional to throttle (free speed x cmd^1.25)
  slip      the belt or tyre slips on a ball: the hall magnet's speed drops 3x the ball's and recovers in 20 ms
  hall      tach jitter: each edge moved by a normal error of sd microseconds (a hall sensor's spread, a slow IRQ)

and records each fit's drop over the true drop and its residual rms (the miss per revolution as a share of the
pre-ball speed, the 5th item `drop_from_commands` returns). The question is whether a gate on the rms rejects the
fits that are wrong without rejecting good ones.

    PYTHONPATH=src:tests:firmware/esp32 python tests/loop_residual_sweep.py [--csv OUT]

Plants are assumptions, not measurements of a real wheel.
"""

import math
import random
import sys

sys.path.insert(0, __import__("os").path.join(__import__("os").path.dirname(__file__), "..", "firmware", "esp32"))
from feeder_sim import controller     # noqa: E402  (puts protocol on the path for controller)
import speed_loop_fit     # noqa: E402


def wheel(rpm, drop, tau_s, free_rpm=9000.0, ball_ms=1500.4, total_ms=1900, a_max=None, tau_esc=None, gamma=1.0,
          slip=None, jitter_us=0.0, seed=0, speed_loop=None, loop=None, settled=True, speeds=None):
    rng = random.Random(seed)
    tach = controller.PeriodTach()
    # a speed-loop ESC gets the board's speed-ESC loop (no proportional term) unless --board-pi asks for today's PI
    loop = loop or controller.WheelLoop(9000, speed_esc=bool(speed_loop) and "--board-pi" not in sys.argv)
    cmd = (rpm / free_rpm) ** (1 / gamma)
    loop.i = cmd - rpm / 9000 if settled else 0.0
    w, rev, last_true, last_seen = float(rpm), 0.0, 0, 0
    drive = cmd                     # the ESC's own lagged command (tau_esc)
    seen = 0.0                      # extra slip deficit of the magnet's shaft, decays in 20 ms
    periods, ticks, e0 = [], [], None
    esc_i = 0.0                     # a speed-loop ESC's own integrator (rpm/s), speed_loop=(f_hz, zeta, a_max)
    if speed_loop:
        f_hz, zeta, sl_max = speed_loop
        wn = 2 * math.pi * f_hz
        esc_i = w / tau_s           # holding the speed against the wheel's own drag
    for ms in range(total_ms):
        if ms == int(ball_ms):
            w *= 1 - drop
            if slip:
                seen = w * drop * (slip - 1)
        if tau_esc:
            drive += (cmd - drive) * 0.001 / tau_esc
        else:
            drive = cmd
        w_start = w
        if speed_loop:
            # The command is a speed setpoint (free_rpm x cmd); the ESC holds it with a PI loop on its own sensor,
            # closed-loop natural frequency f_hz, damping zeta, its current limit as sl_max rpm/s. 0.1 ms steps.
            for _ in range(10):
                e = free_rpm * drive - w
                u = 2 * zeta * wn * e + esc_i
                ucl = max(-sl_max, min(sl_max, u))
                if ucl == u:
                    esc_i += wn * wn * e * 0.0001
                w += (ucl - w / tau_s) * 0.0001
            acc = None
        else:
            acc = (free_rpm * drive ** gamma - w) / tau_s
            if a_max is not None:
                acc = max(-a_max, min(a_max, acc))
            w += acc * 0.001
        seen *= math.exp(-1 / 20)
        if speeds is not None:
            speeds.append(w)
        before = rev
        # a speed-loop ESC moves the wheel a few % within a millisecond after a ball: its revolutions advance at the
        # step's mean speed (the other plants keep the end-of-step speed their recorded sweeps used)
        w_rev = (w_start + w) / 2 if speed_loop else w
        rev += max(w_rev - seen, 0.0) / 60000.0
        if int(rev) > int(before):
            e = ms * 1000 + int((int(rev) - before) / (rev - before) * 1000)
            e_seen = e + (int(round(rng.gauss(0, jitter_us))) if jitter_us else 0)
            tach.edge(e_seen - last_seen)
            if e0 is not None:
                periods.append(e_seen - last_seen)
            last_seen = e_seen
            last_true = e
        if ms % 10 == 0:
            now = ms * 1000 + 1000
            cmd = loop.update(rpm, tach.rpm(now - last_seen), 10)
            if ms >= ball_ms - 200:
                if e0 is None:
                    e0 = tach.edges
                ticks.append((tach.edges - e0, now - last_seen, cmd))
    return periods, ticks


PLANTS = [("first", {}), ("hall 5us", {"jitter_us": 5}), ("hall 20us", {"jitter_us": 20}),
          ("hall 50us", {"jitter_us": 50}),
          ("torque 20k", {"a_max": 20000.0}), ("torque 8k", {"a_max": 8000.0}),
          ("esc 30ms", {"tau_esc": 0.03}), ("esc 80ms", {"tau_esc": 0.08}),
          ("curve 1.25", {"gamma": 1.25}), ("slip x3", {"slip": 3.0}), ("torque 3k", {"a_max": 3000.0})]
# An ESC running its own speed loop (2026-11-18, README "An ESC with its own speed loop"): VESC-class firmware in a
# speed mode maps throttle to an rpm setpoint and holds it, so a ball's drop recovers on the ESC's loop, not the
# wheel's tau. f is the closed loop's natural frequency, z its damping, the last the current limit in rpm/s.
SPEED_PLANTS = [(f"speed {f}Hz z{z}", {"speed_loop": (f, z, 40000.0)}) for f in (2, 5, 10, 20) for z in (0.7, 0.4)]
if "--speed" in sys.argv:
    PLANTS = PLANTS[:1] + SPEED_PLANTS
CASES = [(rpm, drop, tau) for rpm in (1500, 2500, 4000, 6000) for drop in (0.06, 0.10) for tau in (0.2, 0.4, 0.8)]


EDGES = "--edges" in sys.argv
SPEED_FIT = "--speed-fit" in sys.argv     # fit every plant with drop_from_speed_loop instead


def run():
    rows = []
    for name, kw in PLANTS:
        for i, (rpm, drop, tau) in enumerate(CASES):
            ball = 1500.0 + (i * 0.37) % 1 * 10            # ball at varied phases of the 10 ms tick
            ps, tk = wheel(rpm, drop, tau, ball_ms=ball, seed=i, **kw)
            got = (speed_loop_fit.drop_from_speed_loop(ps, tk) if SPEED_FIT else
                   controller.drop_from_commands(ps, tk, edges=EDGES))
            par = controller.drop_from_periods(ps)
            rows.append((name, rpm, drop, tau, got[0] / drop if got else None, got[4] if got else None, got[5] if got else None, got[6] if got else None,
                         par[0] / drop if par else None))
    return rows


def main():
    rows = run()
    if "--csv" in sys.argv:
        with open(sys.argv[sys.argv.index("--csv") + 1], "w") as f:
            f.write("plant,rpm,drop,tau_s,loop_ratio,rms,se,dw,parabola_ratio\n")
            for r in rows:
                f.write(",".join("" if v is None else (f"{v:.5f}" if isinstance(v, float) else str(v)) for v in r) + "\n")
    print(f"{'plant':12} {'n':>3} {'loop err mean/worst %':>22} {'rms median/max x1e-4':>22} {'parabola worst %':>17}"
          f" {'marked (se > LOOP_SE_MAX)':>26} {'worst unmarked %':>17}")
    for name, _ in PLANTS:
        rs = [r for r in rows if r[0] == name]
        ok = [r for r in rs if r[4] is not None]
        errs = [abs(r[4] - 1) * 100 for r in ok]
        rms = sorted(r[5] * 1e4 for r in ok)
        pe = [abs(r[8] - 1) * 100 for r in rs if r[8] is not None]
        print(f"{name:12} {len(ok):3d} {sum(errs) / len(errs):10.2f} / {max(errs):8.2f} "
              f"{rms[len(rms) // 2]:10.2f} / {rms[-1]:8.2f} {max(pe) if pe else float('nan'):12.2f}"
              f" {sum(r[6] > controller.LOOP_SE_MAX for r in ok):20d}/{len(ok):<5d}"
              f" {max([abs(r[4] - 1) * 100 for r in ok if r[6] <= controller.LOOP_SE_MAX] or [0.0]):12.2f}")
    bad = [r for r in rows if r[4] is not None and abs(r[4] - 1) > 0.02]
    good = [r for r in rows if r[4] is not None and abs(r[4] - 1) <= 0.01]
    print(f"\ndrops more than 2% off: {len(bad)}, marked {sum(r[6] > controller.LOOP_SE_MAX for r in bad)}; "
          f"drops within 1%: {len(good)}, marked {sum(r[6] > controller.LOOP_SE_MAX for r in good)}; "
          f"no fit (too little to fit or out of range): {sum(r[4] is None for r in rows)} of {len(rows)}")


if __name__ == "__main__":
    main()
