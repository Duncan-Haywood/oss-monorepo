"""Does the TAKE_SURVEY frame's whole-ppm rms move the Pi's advice? (2026-11-19, firmware/esp32/README.md "The sub-8
advised instant build was the frame's rounding")

The Pi's best / step share is min(rms) / rms[0] on the frame's rms, sent in whole ppm. At 1/8 us the capture's fit floor
is a few ppm, so the rounding is a large part of each number: the one instant build advised at 1/8 us carried 4 and 7
ppm (0.571) where the board's sums give 0.635. This rescores stored take_survey_jitter.py captures (their
`board_scores`) by the board's ResidualSurvey with the shipped trim and blind, each row on its own grid, and compares
three shares for every nonzero pick: the exact one from the sums, the rounded one the Pi reads, and guard G's bound
(min + 0.5) / (step - 0.5), the largest share the frame allows (host.take_share_bound).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_share_rounding.py rows.jsonl[.gz] ... [--takes sweep|PATH]

Truth for "named within 1 ms" needs each build's take: --takes sweep (the default) reads take_survey_sweep.TAKES, the
list take_survey_jitter.py captures with.
"""
import math
import sys

from take_survey_trim import grid_for, load


def rescore(row):
    """(pick ms, exact share, rounded share, guard bound, step rms ppm) for the row with the shipped trim and blind,
    or None with no verdict."""
    import take_misfit_trace as tm  # (puts controller on the path)
    import controller
    from tennisbots import host
    rs = controller.ResidualSurvey(grid_for(row) or tm.PICK_US, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
    for got in row["board_scores"]:
        if got and all(g is not None for g in got):
            rs.add([g * g for g in got])
    rep = rs.report(100)
    if rep is None or not any(rep[3]):
        return None
    sums, rms = rs.sums(), rep[3]
    exact = math.sqrt(min(sums) / sums[0]) if sums[0] else 1.0
    rounded = min(rms) / rms[0] if rms[0] else 1.0
    return round(2 * rep[2] / 10) / 2, exact, rounded, host.take_share_bound(rms), rms[0]


def main():
    import take_survey_sweep as tss
    from tennisbots import host
    ratio = host.TAKE_ADVISE_RATIO
    for path in [a for a in sys.argv[1:] if not a.startswith("--")]:
        rows = load(path)
        c = dict(spread=0, instant=0, good_r=0, good_g=0, good_e=0, bad_r=0, bad_g=0, bad_e=0, differ=0)
        held = []
        for b in rows:
            got = rescore(b)
            ms = tss.TAKES[b["build"][0]][1]
            c["spread" if ms else "instant"] += 1
            if got is None:
                continue
            pick, exact, rounded, bound, step = got
            if pick == 0:
                continue
            adv = {"r": rounded <= ratio, "g": bound <= ratio, "e": exact <= ratio}
            for k, a in adv.items():
                if ms:
                    c["good_" + k] += a and abs(pick - ms) <= 1.0
                else:
                    c["bad_" + k] += a
            if adv["r"] != adv["g"]:
                c["differ"] += 1
                held.append((b["build"], ms, pick, exact, rounded, bound, step))
        print(f"\n{path}: {len(rows)} survey drills ({c['spread']} spread takes, {c['instant']} instant)")
        for k, name in (("r", "rounded share (the Pi until now)"), ("g", "guard G (bound <= margin)"),
                        ("e", "exact share (the board's sums)")):
            print(f"  {name}: spread takes named within 1 ms and advised {c['good_' + k]} of {c['spread']}, "
                  f"instant advised {c['bad_' + k]} of {c['instant']}")
        print(f"  verdicts where G and the rounded share differ: {c['differ']}")
        for build, ms, pick, exact, rounded, bound, step in held:
            print(f"    build {build} take {ms:g} ms pick {pick:g} ms: exact {exact:.3f}, rounded {rounded:.3f}, "
                  f"bound {bound:.3f}, step rms {step} ppm")


if __name__ == "__main__":
    main()
