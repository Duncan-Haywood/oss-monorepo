"""A noise-scaled floor on the take bound (2026-11-19, firmware/esp32/README.md "A standard-error floor on the take
bound").

host.TAKE_BOUND_FLOOR_PPM = 2 is shown needed (sets Y and Z, eval/take-bound-floor-near2-2026-11-19.md: floor 0 missed
3 of 54 near-2 ms takes at 6-9 ppm steps, floor 2 none) but it is an absolute margin: on a small-rms instant build the
1.5 ms candidate that would bound it tightly is less than 2 ppm over the step, so the bound loosens (5 of 12 instant
builds at 1.5 ms against 8 at floor 0). This asks whether a floor scaled to the survey's own noise keeps the coverage
and wins that tightness back.

The noise: each kept wheel has a squared residual w_i(c) per candidate c, and the frame's rms is sqrt(mean_i w_i(c)).
Two floors, both in ppm and rounded to the frame's tenths, as the board would send them:

  step  k * SE of the step's rms: 1e6 * sd_i(w_i(0)) / sqrt(n) / (2 rms_0)  (one number a frame; the delta method)
  pair  k * SE of the candidate's rms over the step's, paired by wheel: 1e6 * sd_i(w_i(c) - w_i(0)) / sqrt(n) / (2 rms_0)
        (one number a candidate)
  cap   min(2 ppm, k * the step's SE): the shipped floor, lowered only where the survey is quiet

Each replaces the fixed 2 ppm (the 2% bar stays). Kept wheels are the board's: ResidualSurvey with the shipped trim and
blind rule, so n is the kept count after trim. Builds are the ones host.take_survey_advice tells TAKE_US = 0 on the
tenths frame, the same rows tests/take_bound_floor_tenths.py scores.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_bound_floor_se.py --design FILES...
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_bound_floor_se.py --heldout FILES...

Simulated only, as the captures are. Result (closed on design, no SE floor beat the fixed 2 ppm):
eval/take-bound-floor-se-2026-11-19.md.
"""
import math
import sys

import take_bound_floor_tenths as tbf
import take_short_blind as tsb
import take_survey_pick as tsp

TOL = 0.02
CAP_PPM = 2          # 'cap': min(the shipped fixed floor, k step SEs), so it can only tighten the shipped bound
KS = (0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6)
CANDIDATE = None     # (kind, k) to hold out; none beat the fixed 2 ppm on the design, so the item closed there


def _kept(scores, grid):
    """The board's frame (tenths) and the squared residual rows of the wheels its sums kept, or None."""
    import take_misfit_trace  # noqa: F401  (puts controller on the path)
    import controller
    rs = controller.ResidualSurvey(grid, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
    for got in scores:
        if got and all(g is not None for g in got):
            rs.add([g * g for g in got])
    whole, tenths = rs.report(100), rs.report(100, 10)
    if whole is None or not any(whole[3]):
        return None
    trim = controller.SURVEY_TRIM if rs.trim is None else rs.trim
    best = sorted(min(w) for w in rs.wheels)
    cap = trim * trim * best[len(best) // 2] if best else 0.0
    kept = [list(w) for w in rs.wheels if trim <= 0 or min(w) <= cap]
    sv = {"wheels": whole[0], "least_ms10": tenths[1], "refined_ms10": tenths[2], "board_ms10": 0,
          "kept": rs.kept_n, "rms_ppm": [v / 10 for v in tenths[3]], "rms_step_ppm": 0.1}
    return sv, kept


def _sd(xs):
    n = len(xs)
    if n < 2:
        return 0.0
    m = sum(xs) / n
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))


def se_ppm(kept, c=None):
    """The step's rms SE (c None) or candidate c's paired SE over the step, in ppm, rounded to tenths."""
    n = len(kept)
    m0 = sum(w[0] for w in kept) / n
    if n < 2 or m0 <= 0:
        return 0.0
    xs = [w[0] for w in kept] if c is None else [w[c] - w[0] for w in kept]
    return round(10 * 1e6 * _sd(xs) / math.sqrt(n) / (2 * math.sqrt(m0))) / 10


def rows(paths):
    """(set, take ms, tenths frame, kept rows, grid ms) for each build with a survey."""
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
            got = _kept(scores, list(grid))
            if got:
                yield name, b["take_ms"], got[0], got[1], [g / 1000 for g in grid]


def bound(sv, kept, grid_ms, kind, k):
    """The first candidate past 0 more than TOL and the floor over the step's rms, or None. kind 'fixed' takes k ppm."""
    rms = sv["rms_ppm"]
    if not rms or not rms[0]:
        return None
    step_se = se_ppm(kept) if kind in ("step", "cap") else 0.0
    for c in range(1, len(rms)):
        if kind == "fixed":
            fl = k
        elif kind == "step":
            fl = k * step_se
        elif kind == "cap":
            fl = min(CAP_PPM, k * step_se)
        else:
            fl = k * se_ppm(kept, c)
        if rms[c] > max(rms[0] * (1 + TOL), rms[0] + fl):
            return grid_ms[c]
    return None


def score(rs, kind, k):
    told = cov = ni = i15 = 0
    misses = []
    for name, t, sv, kept, grid_ms in rs:
        if not tbf.told_zero(sv):
            continue
        x = bound(sv, kept, grid_ms, kind, k)
        told += 1
        if x is None or t <= x + 1e-9:
            cov += 1
        else:
            misses.append((name, t, x, sv["rms_ppm"][0], se_ppm(kept)))
        if t == 0:
            ni += 1
            i15 += x == 1.5
    return told, cov, ni, i15, misses


def table(rs, label):
    print(f"{label}: {len(rs)} builds with a survey")
    out = {}
    for kind, ks in (("fixed", (0, 2)), ("step", KS), ("pair", KS), ("cap", KS)):
        for k in ks:
            t, c, ni, i15, m = score(rs, kind, k)
            out[(kind, k)] = (t, c, ni, i15, m)
            miss = "; ".join(f"{n.split('-2026')[0]} {tt:g} ms bounded {x:g} (step {s:g} ppm, se {e:g})"
                             for n, tt, x, s, e in m)
            unit = "ppm" if kind == "fixed" else "SE"
            print(f"  {kind:5} {k:g} {unit}: told {t}, covered {c} ({c / max(t, 1):.1%}), instant 1.5 ms on {i15} of "
                  f"{ni}" + (f"; misses: {miss}" if m else ""))
    return out


def se_summary(rs):
    """The step SE's spread over the told builds, for the note."""
    ses = sorted(se_ppm(kept) for _, _, sv, kept, _ in rs if tbf.told_zero(sv))
    if ses:
        q = lambda p: ses[min(len(ses) - 1, int(p * len(ses)))]  # noqa: E731
        print(f"  step SE over {len(ses)} told builds: min {ses[0]:g}, median {q(0.5):g}, 90% {q(0.9):g}, "
              f"max {ses[-1]:g} ppm")


def main():
    a = sys.argv
    if "--design" in a:
        paths = a[a.index("--design") + 1:]
        rs = list(rows(paths))
        table(rs, "ALL design")
        se_summary(rs)
        return
    if "--heldout" in a:
        rs = list(rows(a[a.index("--heldout") + 1:]))
        out = table(rs, "held out")
        se_summary(rs)
        if CANDIDATE is None:
            return
        t2, c2, ni2, i2, _ = out[("fixed", 2)]
        t, c, ni, i15, _ = out[CANDIDATE]
        ca = t > 0 and c >= c2
        cb = i15 > i2
        print(f"  {CANDIDATE[0]} {CANDIDATE[1]:g} SE: (a) coverage at least the fixed 2 ppm floor's {c2} of {t2}: "
              f"{'held' if ca else 'FAILED'}; (b) instant builds bounded 1.5 ms more than the fixed floor's {i2} of "
              f"{ni2}: {'held' if cb else 'FAILED'}")
        print("Decision: " + ("the SE floor ships in host.take_survey_bound" if ca and cb else
                              "host.TAKE_BOUND_FLOOR_PPM stays 2; the SE floor goes back to NEXT.md with these numbers"))


if __name__ == "__main__":
    main()
