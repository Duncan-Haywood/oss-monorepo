"""Straddling wheels vote on the short takes (2026-11-19, firmware/esp32/README.md, same title).

On the nine-point grid a 1.3-2 ms take was read as instant at every TAKE_SURVEY_BLIND (eval/take-blind-nine-2026-11-19.md)
and the bound could not tell such a take from an instant one by any spread of the 1.5 ms candidate's rms
(eval/take-bound-floor-se-2026-11-19.md). Both use the sums over every kept wheel. A take shorter than a revolution moves
a wheel's fit only when the take's parts fall across a revolution's edge ("Take-blind rows traced"); on the other kept
wheels the 1.5 ms candidate and the step differ by noise, which the sums carry along with the signal.

The vote: on each kept wheel whose fit at 1.5 ms (controller.TAKE_STRADDLE_US) places the take's parts across an edge
(the fit's last field, `edge`), 1.5 ms fitting better than the step is a vote for it, worse a vote against. The board
counts both (ResidualSurvey.straddle_for / straddle_against) and sends them in the TAKE_SURVEY frame; when the sums would
say TAKE_US = 0 and for - against reaches host.TAKE_STRADDLE_MARGIN, the Pi advises 1.5 ms.

This rescores stored captures that carry each wheel's inputs (`wheels`: periods and ticks as the board passed them)
with the Pi's own advice line, as tests/take_blind_nine.py judges it: a spread take is named when the advised TAKE_US is
within 1 ms of the true take; an instant build is bad when told to set a take above 0. A capture made after the board
counted the vote carries it in `survey`; older ones are refitted once a wheel at 1.5 ms (the refit matched the board's
rms on all 5,456 wheels of the six design sets).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_vote.py [--margins 0,1,2,3] [--procs 4] FILES...

Simulated only, as the captures are.
"""
import re
import sys

MARGINS = (0, 1, 2, 3)


def _edge(w):
    import take_misfit_trace  # noqa: F401  (puts controller on the path)
    import controller
    fit = None
    for item in controller.drop_from_commands_steps(w["periods"], [tuple(t) for t in w["ticks"]],
                                                    take=controller.take_offsets(controller.TAKE_STRADDLE_US),
                                                    levels=controller.TAKE_SURVEY_LEVELS,
                                                    after=controller.TAKE_SURVEY_AFTER):
        if item is not None:
            fit = item[1]
    return bool(fit and fit[7])


def edges(b):
    """Each wheel's straddle flag at TAKE_STRADDLE_US, refitted from its stored inputs (None: no inputs)."""
    ws = b.get("wheels")
    if not ws:
        return None
    return [_edge(w) for w in ws]


def frame(b, eds):
    """The board's tenths frame for this build with the straddle vote, from its rows (and edge flags)."""
    import take_misfit_trace  # noqa: F401
    import controller
    from take_survey_trim import grid_for
    grid = grid_for(b)
    rs = controller.ResidualSurvey(grid, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
    if controller.TAKE_STRADDLE_US in rs.grid:
        rs.vote = rs.grid.index(controller.TAKE_STRADDLE_US)
    for i, got in enumerate(b["board_scores"]):
        if got and all(g is not None for g in got):
            rs.add([g * g for g in got], bool(eds and eds[i]))
    t = rs.report(100, 10)
    if t is None:
        return None
    sv = {"wheels": t[0], "least_ms10": t[1], "refined_ms10": t[2], "board_ms10": 0, "kept": rs.kept_n,
          "rms_ppm": [v / 10 for v in t[3]], "rms_step_ppm": 0.1,
          "straddle_for": rs.straddle_for, "straddle_against": rs.straddle_against}
    board = b.get("survey") or {}
    if board.get("straddle_for") is not None:
        # the board counted it itself: its numbers must be the rebuild's
        assert (board["straddle_for"], board["straddle_against"]) == (rs.straddle_for, rs.straddle_against), \
            (board, rs.straddle_for, rs.straddle_against)
    return sv


def verdict(sv, margin):
    from tennisbots import host
    keep = host.TAKE_STRADDLE_MARGIN
    host.TAKE_STRADDLE_MARGIN = margin
    try:
        line = host.take_survey_advice(sv)
    finally:
        host.TAKE_STRADDLE_MARGIN = keep
    if not line or "run more balls" in line and "TAKE_US = " not in line:
        return None
    m = re.search(r"set TAKE_US = (\d+)", line)
    return int(m.group(1)) / 1000 if m else 0.0


def score(rows, margin, base=0):
    """Counts over (take ms, frame) rows at `margin`, and the builds whose verdict's judgement changed from `base`."""
    c = dict(named=0, spread=0, wrong=0, bad=0, instant=0, none=0, gained=0, lost=0)
    per = {}
    for t, sv in rows:
        c["spread" if t else "instant"] += 1
        v = verdict(sv, margin) if sv else None
        v0 = verdict(sv, base) if sv else None
        ok = (lambda x: x is not None and (abs(x - t) <= 1.0 if t else x == 0))
        c["gained"] += ok(v) and not ok(v0)
        c["lost"] += ok(v0) and not ok(v)
        per.setdefault(t, []).append(v)
        if v is None:
            c["none"] += 1
        elif t:
            c["named" if abs(v - t) <= 1.0 else "wrong"] += 1
        elif v:
            c["bad"] += 1
    return c, per


def load(paths):
    from take_blind_nine import load_nine
    return [b for b in load_nine(paths) if b.get("wheels")]


def rows_for(paths, procs=1):
    builds = load(paths)
    if procs > 1:
        from multiprocessing import Pool
        with Pool(procs) as pool:
            eds = pool.map(edges, builds, chunksize=2)
    else:
        eds = [edges(b) for b in builds]
    from take_blind_nine import take_ms
    return [(take_ms(b), frame(b, e)) for b, e in zip(builds, eds)]


def main():
    a = sys.argv
    margins = tuple(int(x) for x in a[a.index("--margins") + 1].split(",")) if "--margins" in a else MARGINS
    procs = int(a[a.index("--procs") + 1]) if "--procs" in a else 1
    skip = {a[a.index(o) + 1] for o in ("--margins", "--procs") if o in a}
    paths = [x for x in a[1:] if not x.startswith("--") and x not in skip]
    rows = rows_for(paths, procs)
    sv_ok = [sv for _, sv in rows if sv]
    print(f"{len(rows)} builds on the nine-point grid with wheel inputs ({len(paths)} files); straddling kept wheels "
          f"at 1.5 ms: {sum(s['straddle_for'] + s['straddle_against'] for s in sv_ok)} "
          f"({sum(s['straddle_for'] for s in sv_ok)} for, {sum(s['straddle_against'] for s in sv_ok)} against)")
    by = {}
    for t, sv in rows:
        if sv:
            g = "instant" if t == 0 else ("0.1-0.9 ms" if t < 1.2 else ("1.3-2.1 ms" if t <= 2.15 else "2.4 ms and up"))
            f = by.setdefault(g, [0, 0, 0])
            f[0] += sv["straddle_for"]
            f[1] += sv["straddle_against"]
            f[2] += 1
    for g in ("instant", "0.1-0.9 ms", "1.3-2.1 ms", "2.4 ms and up"):
        if g in by:
            f = by[g]
            print(f"  {g}: {f[2]} builds, straddling wheels {f[0]} for 1.5 ms, {f[1]} against")
    pers = {}
    for m in margins:
        c, per = score(rows, m)
        pers[m] = per
        print(f"  margin {m}{' (off)' if m == 0 else ''}: named {c['named']} of {c['spread']} spread takes, wrong "
              f"{c['wrong']}, instant told to set a take {c['bad']} of {c['instant']}, no verdict {c['none']}; "
              f"judged right that off was not {c['gained']}, judged wrong that off got right {c['lost']}")
    print("per take: advised TAKE_US in ms at margin " + " | ".join(str(m) for m in margins))
    for t in sorted(pers[margins[0]]):
        print(f"  {t:g} ms: " + " | ".join(" ".join("-" if v is None else f"{v:g}" for v in pers[m][t])
                                         for m in margins))


if __name__ == "__main__":
    main()
