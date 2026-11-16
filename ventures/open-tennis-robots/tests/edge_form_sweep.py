"""The loop-command drop fit on edge times against the fit on periods, as a tach's jitter grows (2026-11-16,
firmware/esp32/README.md "The drop on the edge times").

A tach's jitter moves each edge time once, so neighbouring periods share it with opposite signs, and the period fit
treats them as independent. `drop_from_commands(..., edges=True)` fits each edge's running angle instead (one
independent error per row, a free offset for the first edge). This sweep runs tests/loop_residual_sweep.py's single
wheels (24 cases: 1,500-6,000 rpm, 6% and 10% drops, wheel lags 0.2-0.8 s) with `--seeds` jitter draws each and
prints, per jitter, the drop's bias and spread both ways, the cases each could not fit, and the spread by speed.
Only the cases both forms fit are compared.

    PYTHONPATH=src:tests:firmware/esp32 python tests/edge_form_sweep.py [--seeds 8] [jitter_us ...]

The plants are the simulator's; the jitter is a normal error per edge, an assumption.
"""

import statistics as st
import sys

import loop_residual_sweep as L
from feeder_sim import controller


def run(jit, seeds):
    rows, none = [], {False: 0, True: 0}
    for s in range(seeds):
        for i, (rpm, drop, tau) in enumerate(L.CASES):
            ball = 1500.0 + (i * 0.37 + s * 0.13) % 1 * 10
            ps, tk = L.wheel(rpm, drop, tau, ball_ms=ball, seed=1000 * s + i, jitter_us=jit)
            got = {e: controller.drop_from_commands(ps, tk, edges=e) for e in (False, True)}
            for e in got:
                none[e] += got[e] is None
            if all(got.values()):
                rows.append((rpm, got[False][0] / drop - 1, got[True][0] / drop - 1))
    return rows, none


def main():
    seeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 8
    args = [a for i, a in enumerate(sys.argv[1:], 1) if sys.argv[i - 1] != "--seeds" and a != "--seeds"]
    jits = [float(a) for a in args] or [0.0, 2.0, 3.0, 5.0, 10.0, 20.0]
    print("jitter us | both fitted | no fit: periods, edges | periods: bias sd p90 worst | edges: bias sd p90 worst |"
          " sd by rpm 1500/2500/4000/6000, periods -> edges")
    for jit in jits:
        rows, none = run(jit, seeds)
        out = []
        for k in (1, 2):
            e = [r[k] for r in rows]
            a = sorted(abs(x) for x in e)
            out.append(f"{st.mean(e):+.2%} {st.pstdev(e):.2%} {a[int(0.9 * len(a))]:.2%} {a[-1]:.2%}")
        by = " ".join(f"{st.pstdev([r[1] for r in rows if r[0] == rpm]):.2%}->"
                      f"{st.pstdev([r[2] for r in rows if r[0] == rpm]):.2%}" for rpm in (1500, 2500, 4000, 6000))
        print(f"{jit:4g} | {len(rows)} | {none[False]}, {none[True]} | {out[0]} | {out[1]} | {by}")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
