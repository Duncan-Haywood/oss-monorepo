"""The board's speed loop on top of an ESC that runs its own (2026-11-18, firmware/esp32/README.md "An ESC with its own
speed loop").

VESC-class firmware in a speed mode takes the throttle as an rpm setpoint and holds it with a PI loop of its own. The
board's `WheelLoop` was tuned on a wheel that follows its throttle as a 0.2-0.8 s lag; here its command is a setpoint
the ESC reaches in a few tens of milliseconds, and the board sees the result through a 4-revolution tach. One wheel
on tests/loop_residual_sweep.py's simulator (1 ms steps, the loop every 10 ms), no ball, starting at its target with
the board's integrator empty, so an ESC whose setpoint map is off (free speed 7,000 or 11,000 rpm against the 9,000
the board is told) leaves an error the integrator must trim.

For each board loop it prints, over 16 speed-loop ESCs (2-20 Hz, damping 0.4 and 0.7, a 40,000 rpm/s current limit)
x 4 targets (600-6,000 rpm) x 3 setpoint maps: the speed's swing over the last second (max - min, % of target), its
mean error over that second, and how many wheels swing over 1%.

    PYTHONPATH=src:tests:firmware/esp32 python tests/speed_esc_sweep.py

Plants are assumptions, not measurements of a real ESC.
"""

import sys

from loop_residual_sweep import wheel
from feeder_sim import controller     # noqa: E402

ESCS = [(f, z) for f in (2, 3, 5, 8, 12, 20) for z in (0.4, 0.7)]
RPMS = (600, 1500, 3000, 6000)
MAPS = (7000.0, 9000.0, 11000.0)
LOOPS = [("board PI (today)", {"speed_esc": False})] + [
    (f"no P, ki x {k}", {"speed_esc": True, "k": k}) for k in (0.0, 0.1, 0.3, 0.5, 0.7, 1.0)]


def run(kw, f, z, rpm, free):
    k = kw.get("k")
    if k is not None:
        old = controller.SPEED_ESC_KI_SHARE
        controller.SPEED_ESC_KI_SHARE = k
    try:
        loop = controller.WheelLoop(9000, speed_esc=kw["speed_esc"])
    finally:
        if k is not None:
            controller.SPEED_ESC_KI_SHARE = old
    ws = []
    wheel(rpm, 0.0, 0.4, free_rpm=free, ball_ms=10 ** 9, total_ms=6000, speed_loop=(f, z, 40000.0), loop=loop,
          settled=False, speeds=ws)
    last = ws[-1000:]
    return (max(last) - min(last)) / rpm * 100, (sum(last) / len(last) - rpm) / rpm * 100


def main():
    print(f"{'board loop':18} {'swing median / worst %':>24} {'mean error, worst |%|':>22} {'swing > 1%':>11}"
          f" {'|error| > 1%':>13}")
    rows = {}
    for name, kw in LOOPS:
        sw, er = [], []
        for f, z in ESCS:
            for rpm in RPMS:
                for free in MAPS:
                    s, e = run(kw, f, z, rpm, free)
                    sw.append(s)
                    er.append(e)
        rows[name] = (sw, er)
        srt = sorted(sw)
        print(f"{name:18} {srt[len(srt) // 2]:11.2f} / {srt[-1]:8.2f} {max(abs(x) for x in er):22.2f}"
              f" {sum(s > 1 for s in sw):5d}/{len(sw):<5d} {sum(abs(x) > 1 for x in er):6d}/{len(er)}")
    if "--by-esc" in sys.argv:
        for name, _ in LOOPS:
            sw = rows[name][0]
            print(name)
            i = 0
            for f, z in ESCS:
                block = sw[i:i + len(RPMS) * len(MAPS)]
                i += len(block)
                print(f"   {f:3d} Hz z {z}: worst swing {max(block):6.2f}%")


if __name__ == "__main__":
    main()
