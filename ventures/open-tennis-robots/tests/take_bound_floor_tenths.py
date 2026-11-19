"""The take bound's ppm floor on the tenths frame (2026-11-19, firmware/esp32/README.md "The bound's ppm floor on
tenths").

host.TAKE_BOUND_FLOOR_PPM = 2 was set when the TAKE_SURVEY frame carried whole ppm (tests/take_shelf_bound.py PART 3,
eval/take-bound-floor-p-2026-11-19.md): at a 16-20 ppm step one ppm of rounding is 5-6% and cleared the 2% bar alone.
Since the tenths frame (eval/take-share-tenths-2026-11-19.md) the rounding is 0.05 ppm, so the floor's cause is gone and
a smaller floor might name a tighter bound (1.5 ms on more instant builds) without losing coverage. Or the floor was
doing more than undoing rounding, and the 2% bar alone still misses on tenths.

This rescores stored captures and dense refits into the board's tenths frame (ResidualSurvey.report(100, 10), the shipped
trim and blind rule, each row on its own grid), asks host.take_survey_advice with rms_step_ppm 0.1 which builds it tells
TAKE_US = 0, and scores the bound for a list of floors: the true take at most the bound (coverage) and the bound 1.5 ms
on the instant builds (tightness). The whole-ppm frame with the shipped floor 2 is printed alongside as the baseline.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_bound_floor_tenths.py --design FILES...
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_bound_floor_tenths.py --heldout FILES...

Files named "*dense*" are dense refits (take_short_blind.load rows with a "dense" list); others are captures with
`board_scores`. Simulated only, as the captures are. The prediction and rule for the held-out sets are in
eval/take-bound-floor-tenths-2026-11-19.md, written before the sets were captured.
"""
import sys

import take_shelf_bound as tsb2
import take_short_blind as tsb
import take_survey_pick as tsp

TOL = 0.02
FLOORS = (0, 0.1, 0.2, 0.3, 0.5, 1, 2)
CANDIDATE = 2        # the design's pick, written before sets W and X were captured (see the eval note)


def _survey(scores, grid):
    import take_misfit_trace  # noqa: F401  (puts controller on the path)
    import controller
    rs = controller.ResidualSurvey(grid, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
    for got in scores:
        if got and all(g is not None for g in got):
            rs.add([g * g for g in got])
    whole, tenths = rs.report(100), rs.report(100, 10)
    if whole is None or not any(whole[3]):
        return None
    n, least, ref, rms = whole
    base = {"wheels": n, "least_ms10": least, "refined_ms10": ref, "board_ms10": 0, "kept": rs.kept_n}
    return (dict(base, rms_ppm=list(rms), rms_step_ppm=1.0),
            dict(base, least_ms10=tenths[1], refined_ms10=tenths[2], rms_ppm=[v / 10 for v in tenths[3]],
                 rms_step_ppm=0.1))


def frames(paths):
    """(set name, take ms, whole-ppm frame, tenths frame) for every build with a survey."""
    from feeder_sim import controller
    from take_survey_trim import grid_for
    for p in paths:
        name = p.split("/")[-1]
        for b in tsb.load(p):
            if "dense" in b:
                grid = list(controller.TAKE_SURVEY_GRID_US)
                idx = [tsp.DENSE_US.index(g) for g in grid]
                scores = [[d[i] for i in idx] for d in b["dense"] if all(x is not None for x in d)]
            elif b.get("board_scores"):
                grid = grid_for(b)
                scores = b["board_scores"]
            else:
                continue
            got = _survey(scores, list(grid))
            if got:
                yield name, b["take_ms"], got[0], got[1]


def told_zero(sv):
    from tennisbots import host
    a = host.take_survey_advice(sv)
    return bool(a and "TAKE_US = 0" in a)


def score(rows, frame, floor):
    """(told, covered, instant told, instant at 1.5 ms, misses) for one frame (2: whole, 3: tenths) and floor."""
    from feeder_sim import controller
    told = cov = ni = i15 = 0
    misses = []
    for name, t, *svs in rows:
        sv = svs[frame - 2]
        if not told_zero(sv):
            continue
        grid_ms = [g / 1000 for g in tsb_grid(len(sv["rms_ppm"]), controller)]
        x = tsb2.bound_ms(sv["rms_ppm"], grid_ms, tol=TOL, floor=floor)
        told += 1
        if x is None or t <= x + 1e-9:
            cov += 1
        else:
            misses.append((name, t, x, sv["rms_ppm"][0]))
        if t == 0:
            ni += 1
            i15 += x == 1.5
    return told, cov, ni, i15, misses


def tsb_grid(n, controller):
    from tennisbots import host
    return [round(g * 1000) for g in host.TAKE_SURVEY_GRIDS_MS[n]]


def table(rows, label):
    print(f"{label}: {len(rows)} builds with a survey")
    t, c, ni, i15, m = score(rows, 2, 2)
    print(f"  whole ppm, floor 2 (shipped baseline): told {t}, covered {c} ({c / max(t, 1):.1%}), instant 1.5 ms on "
          f"{i15} of {ni}")
    out = {}
    for f in FLOORS:
        t, c, ni, i15, m = score(rows, 3, f)
        out[f] = (t, c, ni, i15, m)
        miss = "; ".join(f"{n} {tt:g} ms bounded {x:g} (step {s:g} ppm)" for n, tt, x, s in m)
        print(f"  tenths, floor {f:g} ppm: told {t}, covered {c} ({c / max(t, 1):.1%}), instant 1.5 ms on {i15} of "
              f"{ni}" + (f"; misses: {miss}" if m else ""))
    return out


def main():
    a = sys.argv
    if "--design" in a:
        paths = a[a.index("--design") + 1:]
        rows = list(frames(paths))
        for p in paths:
            n = p.split("/")[-1]
            table([r for r in rows if r[0] == n], n)
        table(rows, "ALL design")
        return
    if "--heldout" in a:
        rows = list(frames(a[a.index("--heldout") + 1:]))
        out = table(rows, "held out")
        t0, c0, *_ = score(rows, 3, 0)
        t, c, ni, i15, _ = out[CANDIDATE]
        ca = t > 0 and c >= 0.95 * t and c >= c0
        cb = ni > 0 and 2 * i15 >= ni
        print(f"  floor {CANDIDATE:g} ppm on tenths: (a) coverage at least 95% and at least floor 0's {c0} of {t0}: "
              f"{'held' if ca else 'FAILED'}; (b) bound 1.5 ms on at least half the instant builds: "
              f"{'held' if cb else 'FAILED'}")
        print("Decision: " + (f"host.TAKE_BOUND_FLOOR_PPM stays {CANDIDATE:g} on the tenths frame, as a noise margin"
                              if ca and cb else "the floor's shape reopens in NEXT.md with these numbers"))

if __name__ == "__main__":
    main()
