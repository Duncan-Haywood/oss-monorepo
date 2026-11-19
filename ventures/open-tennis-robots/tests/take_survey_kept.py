"""How many informative wheels should a contact-time verdict rest on? (2026-11-18, firmware/esp32/README.md "The take
survey's verdict needs two informative wheels")

Since README "The take survey skips take-blind wheels" the board leaves a wheel out of the take survey's sums when every
candidate fits it alike (controller.TAKE_SURVEY_BLIND), but the Pi's minimum before it advises a TAKE_US
(host.ESC_SURVEY_MIN_WHEELS, 16) still counts every wheel surveyed. On a jittery tach about three wheels in four are
left out, so a 16-wheel verdict can rest on one wheel. This rescores stored take_survey_jitter.py captures (their
`board_scores`, as the board computed them) by the board's ResidualSurvey and asks, for each minimum K on the wheels
kept in the sums, what the Pi would advise:

  - at the drill's end (every wheel the drill surveyed), and
  - at every prefix of the drill from host.ESC_SURVEY_MIN_WHEELS wheels on (a shorter drill, or the survey read before
    its last balls; prefixes of one drill are not independent, so these are counts of verdicts, not of drills).

An advised verdict is "right" when the build's take is spread and the pick is within 1 ms of it, "wrong" when it is
spread and further off, and "invented" when the build's take is instant and a nonzero time is advised. A verdict the
minimum holds back is "held". Pick-0 verdicts are left out (their advice, keep or set TAKE_US = 0, is not a take).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_kept.py rows.jsonl[.gz] ... [--ks 0,2] [--by-kept]
    ... [--drills]      # also count by drill (2026-11-19, README "One informative wheel, counted by drill")

Each row is rescored on the grid it was captured with (GRIDS, by the length of its board rows): the stored sets before
2026-11-19 carry seven candidates, and rescoring them on the board's nine-point grid raised an IndexError.
"""
import sys

from take_survey_trim import GRIDS, grid_for, load  # noqa: F401 (GRIDS kept importable here)

def verdicts(row):
    """Yield (wheels surveyed, wheels kept, pick ms, advised) after each of the row's wheels."""
    import take_misfit_trace as tm  # (puts controller on the path)
    import controller
    from tennisbots import host
    grid = grid_for(row) or tm.PICK_US
    rs = controller.ResidualSurvey(grid, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
    for got in row["board_scores"]:
        if not (got and all(g is not None for g in got)):
            continue
        rs.add([g * g for g in got])
        rep = rs.report(100)
        if rep is None or not any(rep[3]):
            continue
        rms = rep[3]
        share = min(rms) / rms[0] if rms[0] else 1.0
        pick = round(2 * rep[2] / 10) / 2
        yield rs.n, rs.kept_n, pick, share <= host.TAKE_ADVISE_RATIO and pick > 0


def classify(ms, pick):
    if not ms:
        return "invented"
    return "right" if abs(pick - ms) <= 1.0 else "wrong"


def tally(rows, ks):
    """{k: {"end": counts, "prefix": counts}}, counts {right, wrong, invented, held}; and per kept count (prefixes)
    {kept: counts} with no minimum."""
    import take_survey_sweep as tss
    from tennisbots import host
    out = {k: {"end": dict(right=0, wrong=0, invented=0, held=0), "prefix": dict(right=0, wrong=0, invented=0, held=0)}
           for k in ks}
    by_kept = {}
    for b in rows:
        ms = tss.TAKES[b["build"][0]][1]
        vs = list(verdicts(b))
        if not vs:
            continue
        for i, (n, kept, pick, adv) in enumerate(vs):
            end = i == len(vs) - 1
            if n < host.ESC_SURVEY_MIN_WHEELS and not end:
                continue
            if adv and n >= host.ESC_SURVEY_MIN_WHEELS:
                c = by_kept.setdefault(min(kept, 6), dict(right=0, wrong=0, invented=0))
                c[classify(ms, pick)] += 1
            for k in ks:
                for part in (("end", "prefix") if end else ("prefix",)):
                    if part == "prefix" and n < host.ESC_SURVEY_MIN_WHEELS:
                        continue
                    t = out[k][part]
                    if not adv:
                        continue
                    if kept < k:
                        t["held"] += 1
                    else:
                        t[classify(ms, pick)] += 1
    return out, by_kept


def drills(rows):
    """Count by drill, not by verdict (prefixes of one drill are near-repeats). For each drill, its advised verdicts
    from host.ESC_SURVEY_MIN_WHEELS wheels on (and at its end) are split by the kept wheels they rest on: a drill is in
    "one" when some advised verdict rests on exactly one kept wheel, and wrong there when any of those is wrong or
    invented; likewise "two+" for verdicts on two or more. "K=2 spares" counts drills that told a wrong or invented
    time at some point with no minimum and never with a minimum of two; "K=2 silences" counts drills that advised a
    right time with no minimum and no time at all with a minimum of two."""
    import take_survey_sweep as tss
    from tennisbots import host
    out = dict(one=0, one_wrong=0, two=0, two_wrong=0, spares=0, silences=0, drills=0)
    for b in rows:
        ms = tss.TAKES[b["build"][0]][1]
        vs = list(verdicts(b))
        if not vs:
            continue
        out["drills"] += 1
        adv = [(kept, classify(ms, pick)) for i, (n, kept, pick, a) in enumerate(vs)
               if a and (n >= host.ESC_SURVEY_MIN_WHEELS or i == len(vs) - 1)]
        one = [c for k, c in adv if k == 1]
        two = [c for k, c in adv if k >= 2]
        if one:
            out["one"] += 1
            out["one_wrong"] += any(c != "right" for c in one)
        if two:
            out["two"] += 1
            out["two_wrong"] += any(c != "right" for c in two)
        bad0, bad2 = any(c != "right" for k, c in adv), any(c != "right" for c in two)
        out["spares"] += bad0 and not bad2
        out["silences"] += any(c == "right" for k, c in adv) and not two
    return out


def fmt_drills(d):
    def share(a, b):
        return f"{a} of {b} ({100 * a / b:.0f}%)" if b else f"{a} of 0"
    return (f"{d['drills']} drills with a verdict; one kept wheel: wrong in {share(d['one_wrong'], d['one'])} drills; "
            f"two or more: wrong in {share(d['two_wrong'], d['two'])}; K=2 spares {d['spares']}, silences "
            f"{d['silences']}")


def fmt(c):
    return f"{c['right']} right, {c['wrong']} wrong, {c['invented']} invented, {c['held']} held"


def main():
    ks = [int(x) for x in sys.argv[sys.argv.index("--ks") + 1].split(",")] if "--ks" in sys.argv else [0, 1, 2, 3, 4]
    skip = sys.argv[sys.argv.index("--ks") + 1] if "--ks" in sys.argv else None
    paths = [a for a in sys.argv[1:] if not a.startswith("--") and a != skip]
    total = None
    total_kept = {}
    total_drills = None
    for path in paths:
        rows = load(path)
        if "--drills" in sys.argv:
            d = drills(rows)
            print(f"\n{path}: by drill: {fmt_drills(d)}")
            total_drills = d if total_drills is None else {k: total_drills[k] + d[k] for k in d}
        t, bk = tally(rows, ks)
        print(f"\n{path}: {len(rows)} survey drills")
        for k in ks:
            print(f"  min kept {k}: end of drill {fmt(t[k]['end'])}; prefixes {fmt(t[k]['prefix'])}")
        if "--by-kept" in sys.argv:
            for kept in sorted(bk):
                c = bk[kept]
                print(f"    advised prefixes on {kept}{'+' if kept == 6 else ''} kept wheels: {c['right']} right, "
                      f"{c['wrong']} wrong, {c['invented']} invented")
        if total is None:
            total = t
        else:
            for k in ks:
                for part in ("end", "prefix"):
                    for key in total[k][part]:
                        total[k][part][key] += t[k][part][key]
        for kept, c in bk.items():
            s = total_kept.setdefault(kept, dict(right=0, wrong=0, invented=0))
            for key in s:
                s[key] += c[key]
    if len(paths) > 1:
        print(f"\nall {len(paths)} sets:")
        if total_drills is not None:
            print(f"  by drill: {fmt_drills(total_drills)}")
        for k in ks:
            print(f"  min kept {k}: end of drill {fmt(total[k]['end'])}; prefixes {fmt(total[k]['prefix'])}")
        for kept in sorted(total_kept):
            c = total_kept[kept]
            print(f"    advised prefixes on {kept}{'+' if kept == 6 else ''} kept wheels: {c['right']} right, "
                  f"{c['wrong']} wrong, {c['invented']} invented")


if __name__ == "__main__":
    main()
