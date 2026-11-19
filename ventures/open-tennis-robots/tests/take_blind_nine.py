"""TAKE_SURVEY_BLIND's 1.5 on the nine-point grid and the jittery tach, judged by the Pi's own advice (2026-11-19,
firmware/esp32/README.md "The take-blind rule rechecked on the nine-point grid").

controller.TAKE_SURVEY_BLIND = 1.5 was chosen on 2026-11-18 (README "The take survey skips take-blind wheels") on the
seven-point grid, scored by the old share test (tests/take_survey_blind.py: TAKE_ADVISE_RATIO on whole-ppm rms, the
take read from take_survey_sweep.TAKES by index). Since then the grid has nine points (0, 1.5, 2-8 ms), the frame
carries tenths of a ppm, and host.take_survey_advice gained the rounding guard and the bound note. A wheel is take-blind
when its worst candidate's squared rms is at most `blind` times its best's, and a 1.5 ms candidate sits closer to the
step than any old one did, so the same 1.5 may now leave out a different set of wheels.

This rebuilds each stored capture's board frame (ResidualSurvey with the shipped trim, each `blind` of --blinds, the
tenths report), asks host.take_survey_advice for its line, and counts per tach:

  named   a spread take (true take > 0) whose advised TAKE_US (0 for "keep 0") is within 1 ms of the true take
  wrong   a spread take whose advised TAKE_US is more than 1 ms off (an instant verdict on a 2 ms take included)
  bad     an instant build (true take 0) told to set a TAKE_US above 0
  none    no verdict (every wheel left out, or fewer than the minimum)

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_blind_nine.py [--blinds 1,1.25,1.5,2,3] [--tach 1] FILES...

Only captures whose rows carry the nine-point grid are scored. Simulated only.
"""
import re
import sys

BLINDS = (1.0, 1.25, 1.5, 2.0, 3.0)
TACH_NAMES = ("capture 1/8 us", "jittery 0.5 us")


def frame(b, blind):
    import take_misfit_trace  # noqa: F401  (puts controller on the path)
    import controller
    from take_survey_trim import grid_for
    rs = controller.ResidualSurvey(grid_for(b), controller.TAKE_SURVEY_TRIM, blind)
    for got in b["board_scores"]:
        if got and all(g is not None for g in got):
            rs.add([g * g for g in got])
    t = rs.report(100, 10)
    if t is None:
        return None, rs
    return {"wheels": t[0], "least_ms10": t[1], "refined_ms10": t[2], "board_ms10": 0, "kept": rs.kept_n,
            "rms_ppm": [v / 10 for v in t[3]], "rms_step_ppm": 0.1}, rs


def verdict(sv):
    """The TAKE_US in ms the Pi's line tells the user to set, 0 for keep/instant, None for no verdict."""
    from tennisbots import host
    line = host.take_survey_advice(sv)
    if not line or "run more balls" in line and "TAKE_US = " not in line:
        return None
    m = re.search(r"set TAKE_US = (\d+)", line)
    return int(m.group(1)) / 1000 if m else 0.0


def take_ms(b):
    """The build's true take: its own field, or (older captures) take_survey_sweep.TAKES by index."""
    if "take_ms" in b:
        return b["take_ms"]
    import take_survey_sweep as tss
    return tss.TAKES[b["build"][0]][1]


def score(builds, blind):
    c = dict(named=0, spread=0, wrong=0, bad=0, instant=0, none=0, left=0, wheels=0)
    for b in builds:
        sv, rs = frame(b, blind)
        c["left"] += rs.blind_n
        c["wheels"] += rs.n
        t = take_ms(b)
        c["spread" if t else "instant"] += 1
        v = verdict(sv) if sv else None
        if v is None:
            c["none"] += 1
        elif t:
            if abs(v - t) <= 1.0:
                c["named"] += 1
            else:
                c["wrong"] += 1
        elif v:
            c["bad"] += 1
    return c


def load_nine(paths, tach=None):
    from take_survey_trim import grid_for, load
    out = []
    for p in paths:
        for b in load(p):
            if b.get("board_scores") and len(grid_for(b) or ()) == 9 and (tach is None or b["build"][1] == tach):
                out.append(b)
    return out


def main():
    a = sys.argv
    blinds = tuple(float(x) for x in a[a.index("--blinds") + 1].split(",")) if "--blinds" in a else BLINDS
    tach = int(a[a.index("--tach") + 1]) if "--tach" in a else None
    skip = {a[a.index(o) + 1] for o in ("--blinds", "--tach") if o in a}
    paths = [x for x in a[1:] if not x.startswith("--") and x not in skip]
    builds = load_nine(paths, tach)
    for ki in sorted({b["build"][1] for b in builds}):
        rows = [b for b in builds if b["build"][1] == ki]
        name = TACH_NAMES[ki] if ki < len(TACH_NAMES) else f"tach {ki}"
        print(f"{name}: {len(rows)} builds on the nine-point grid")
        for bl in blinds:
            c = score(rows, bl)
            print(f"  blind {bl:g}: named {c['named']} of {c['spread']} spread takes, wrong {c['wrong']}, instant told "
                  f"to set a take {c['bad']} of {c['instant']}, no verdict {c['none']}; wheels left out {c['left']} of "
                  f"{c['wheels']}")


if __name__ == "__main__":
    main()
