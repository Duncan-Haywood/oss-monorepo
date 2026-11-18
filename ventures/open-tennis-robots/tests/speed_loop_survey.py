"""A speed-loop ESC's loop picked from a drill's own balls, then each ball's drop read with it (2026-11-18,
firmware/esp32/README.md "An ESC with its own speed loop").

`speed_loop_fit.drop_from_speed_loop` reads a ball's drop exactly when it is given the ESC's closed-loop natural frequency
and damping (to 0.01% on wheels made from its own model), but one ball's revolutions cannot tell a bigger drop that
recovers fast from a smaller one that recovers slowly: on a per-wheel grid it read up to 40% off. The loop is the
build's, not the ball's, so as the ESC-lag survey does (README "An ESC lag picked from the build's own balls") this
sums every wheel's squared rms on a grid of (frequency, damping), picks the least, and reads each drop at the pick.

Builds: tests/loop_residual_sweep.py's simulator with the board's speed-ESC loop (no proportional term). A build is
an ESC PI loop at f Hz and damping z on a wheel whose motor spins it up as a lag of tau (0.2 or 0.8 s), so its drag is
w / tau and its current limit 9,000 / tau rpm/s (the motor's stall acceleration). Each build's drill is 24 balls:
1,500-6,000 rpm, 6% and 10% drops, at three phases of the 10 ms tick. Tach exact, then 5 us of jitter. A drop whose
standard error is over controller.LOOP_SE_MAX is counted as marked (the board's "unsure" bit).

    PYTHONPATH=src:tests:firmware/esp32 python tests/speed_loop_survey.py [--quick]

Plants are assumptions, not measurements of a real ESC.
"""

import math
import sys

from loop_residual_sweep import wheel
from feeder_sim import controller     # noqa: E402
import speed_loop_fit     # noqa: E402

QUICK = "--quick" in sys.argv
ESCS = [(f, z, tau) for f in (2, 5, 10, 20) for z in (0.4, 0.7) for tau in (0.2, 0.8)]
BALLS = [(rpm, drop, ph) for rpm in (1500, 2500, 4000, 6000) for drop in (0.06, 0.10) for ph in (0.1, 0.45, 0.8)]
HZ = tuple(round(math.exp(math.log(1.0) + i * (math.log(40.0) - math.log(1.0)) / 23), 3) for i in range(24))
ZETA = tuple(round(0.2 + 0.05 * i, 2) for i in range(16))      # 0.2-0.95
if QUICK:
    HZ, ZETA = HZ[::2], ZETA[::2]


def wheels(f, z, tau, jitter):
    out = []
    for i, (rpm, drop, ph) in enumerate(BALLS):
        ps, tk = wheel(rpm, drop, tau, ball_ms=1500.0 + ph * 10, seed=i, speed_loop=(f, z, 9000.0 / tau),
                       jitter_us=jitter)
        out.append((drop, ps, tk))
    return out


def survey(ws):
    best = None
    for hz in HZ:
        for zt in ZETA:
            tot, n = 0.0, 0
            for _, ps, tk in ws:
                r = speed_loop_fit.drop_from_speed_loop(ps, tk, hz=(hz,), zetas=(zt,))
                if r is not None:
                    tot += r[4] ** 2
                    n += 1
            if n and (best is None or (n, -tot) > (best[0], -best[1])):
                best = (n, tot, hz, zt)
    return best


def read(ws, hz, zt):
    errs = []
    for drop, ps, tk in ws:
        r = speed_loop_fit.drop_from_speed_loop(ps, tk, hz=(hz,), zetas=(zt,), levels=4)
        errs.append(None if r is None else ((r[0] / drop - 1) * 100, r[5] > controller.LOOP_SE_MAX))
    return errs


def summary(errs):
    ok = [e for e in errs if e is not None]
    if not ok:
        return "no fit"
    a = [abs(e) for e, _ in ok]
    um = [abs(e) for e, m in ok if not m] or [0.0]
    return (f"{sum(a) / len(a):5.2f} / {max(a):6.2f} {len(ok):2d}/{len(errs)} {sum(m for _, m in ok):2d}"
            f" {max(um):6.2f}")


ALL = []


def main():
    print("columns: mean / worst |error| %, fitted of 24, marked, worst unmarked |error| %")
    print(f"{'ESC':20} {'tach':5} {'picked Hz, z':>12}  {'at the survey pick':34} {'at the true loop'}")
    for f, z, tau in ESCS:
        for jit in (0, 5):
            ws = wheels(f, z, tau, jit)
            n, tot, hz, zt = survey(ws)
            got = read(ws, hz, zt)
            ALL.append((f, z, tau, jit, got))
            print(f"{f:3d} Hz z{z:<4} tau {tau:<4} {jit:2d} us {hz:6.2f} {zt:5.2f}  {summary(got):34}"
                  f" {summary(read(ws, f, z))}", flush=True)
    # the board's own fit (one lag of the commands) on the same drills: is a speed-mode drop it reads marked?
    board = []
    for f, z, tau in ESCS:
        for drop, ps, tk in wheels(f, z, tau, 0):
            r = controller.drop_from_commands(ps, tk)
            board.append(None if r is None else ((r[0] / drop - 1) * 100, r[5] > controller.LOOP_SE_MAX))
    bk = [e for e in board if e is not None]
    bb = [e for e in bk if abs(e[0]) > 2]
    print(f"the board's loop-command fit, exact tach: {len(bk)} drops read of {len(board)}; more than 2% off {len(bb)},"
          f" marked {sum(m for _, m in bb)}; within 2% {len(bk) - len(bb)}; drills with a marked drop"
          f" {sum(any(e is not None and e[1] for e in board[i:i + len(BALLS)]) for i in range(0, len(board), len(BALLS)))}"
          f" of {len(ESCS)}")
    ok = [e for *_, g in ALL for e in g if e is not None]
    bad = [e for e in ok if abs(e[0]) > 2]
    good = [e for e in ok if abs(e[0]) <= 1]
    print(f"\nat the survey pick: {len(ok)} drops read of {sum(len(g) for *_, g in ALL)}; more than 2% off {len(bad)},"
          f" marked {sum(m for _, m in bad)}; within 1% {len(good)}, marked {sum(m for _, m in good)}")


if __name__ == "__main__":
    main()
