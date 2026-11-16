"""The loop-command drop fit on edge times against the same fit on periods (2026-11-16, firmware/esp32/README.md "The
drop fitted on the edge times").

A tach's timing error sits on each edge time, so two neighbouring periods share it with opposite signs; the period fit
treats them as independent. `controller.drop_from_commands(..., edges=True)` fits the running sums of the revolution
rows instead (each edge time's lag behind an unslowed wheel, with a free offset for the first edge's own error).

Runs tests/loop_residual_sweep.py's single wheel (the firmware's own PeriodTach and WheelLoop) over its 24 cases x
`--seeds` seeds (the ball at varied tick phases, a new jitter draw each) on each plant, and prints, for each fit, the
rms, 90th percentile and worst of the drop's error, its mean (bias), how many balls gave no fit, and how many the
standard error marked unsure (LOOP_SE_MAX).

    PYTHONPATH=src:tests:firmware/esp32 python tests/edge_fit_sweep.py [--seeds N]

About 3 s a plant at 4 seeds. Plants are assumptions, not measurements of a real wheel.
"""

import sys

import loop_residual_sweep as lr
from feeder_sim import controller

PLANTS = [("first", {}), ("hall 2us", {"jitter_us": 2}), ("hall 5us", {"jitter_us": 5}),
          ("hall 10us", {"jitter_us": 10}), ("hall 20us", {"jitter_us": 20}), ("hall 50us", {"jitter_us": 50}),
          ("esc 30ms", {"tau_esc": 0.03}), ("esc 80ms", {"tau_esc": 0.08}), ("torque 8k", {"a_max": 8000.0}),
          ("curve 1.25", {"gamma": 1.25})]


def errors(kw, seeds):
    """{edges: ([error %], no fit, marked)} over the 24 cases x seeds."""
    out = {False: ([], 0, 0), True: ([], 0, 0)}
    for s in range(seeds):
        for i, (rpm, drop, tau) in enumerate(lr.CASES):
            ball = 1500.0 + ((i + s * 7) * 0.37) % 1 * 10
            ps, tk = lr.wheel(rpm, drop, tau, ball_ms=ball, seed=1000 * s + i, **kw)
            for ed in (False, True):
                errs, nofit, marked = out[ed]
                got = controller.drop_from_commands(ps, tk, edges=ed)
                if got is None:
                    out[ed] = (errs, nofit + 1, marked)
                    continue
                errs.append((got[0] / drop - 1) * 100)
                out[ed] = (errs, nofit, marked + (got[5] > controller.LOOP_SE_MAX))
    return out


def summary(errs):
    a = sorted(abs(e) for e in errs)
    n = len(a)
    return (sum(e * e for e in errs) / n) ** 0.5, a[int(0.9 * n)], a[-1], sum(errs) / n


def main():
    seeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 4
    print(f"drop error %, {len(lr.CASES)} cases x {seeds} seeds a plant: rms / p90 / worst (bias), no fit, marked")
    print(f"{'plant':11} | {'periods':^44} | {'edge times':^44}")
    for name, kw in PLANTS:
        res = errors(kw, seeds)
        cells = []
        for ed in (False, True):
            errs, nofit, marked = res[ed]
            rms, p90, worst, bias = summary(errs)
            cells.append(f"{rms:5.2f} / {p90:5.2f} / {worst:6.2f} ({bias:+5.2f}) {nofit:3d} {marked:3d}")
        print(f"{name:11} | {cells[0]:44} | {cells[1]:44}")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
