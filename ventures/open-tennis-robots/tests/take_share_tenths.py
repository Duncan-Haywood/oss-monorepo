"""What the TAKE_SURVEY frame's tenths of a ppm buy the Pi's advice (2026-11-19, firmware/esp32/README.md "The take
survey's rms in tenths of a ppm").

Until the tenths frame each rms went out in whole ppm, and the Pi's guard G (host.take_share_bound) withheld a nonzero
pick whenever the share the rounding allowed, (min + 0.5) / (step - 0.5), passed TAKE_ADVISE_RATIO. In tenths the same
bound is (min + 0.05) / (step - 0.05). This rescores stored take_survey_jitter.py captures (their `board_scores`) by the
board's ResidualSurvey with the shipped trim and blind, each row on its own grid, and for every nonzero pick compares
three verdicts: the exact share from the board's sums, the whole-ppm frame with G, and the tenths frame with its bound.
It counts how often each frame's verdict differs from the exact one, and how the advice scores against each build's
true take (named within 1 ms and advised for a spread take; advised at all for an instant one).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_share_tenths.py rows.jsonl[.gz] ...

Rows without `board_scores` or a build are skipped; files with none are reported as such.
"""
import math
import sys

from take_survey_trim import grid_for, load


def rescore(row):
    """(pick ms, exact share, whole-ppm verdict-bound pair, tenths verdict-bound pair) or None with no verdict."""
    import take_misfit_trace as tm  # (puts controller on the path)
    import controller
    from tennisbots import host
    rs = controller.ResidualSurvey(grid_for(row) or tm.PICK_US, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
    for got in row.get("board_scores") or ():
        if got and all(g is not None for g in got):
            rs.add([g * g for g in got])
    whole = rs.report(100)
    if whole is None or not any(whole[3]):
        return None
    tenths = rs.report(100, 10)
    sums = rs.sums()
    exact = math.sqrt(min(sums) / sums[0]) if sums[0] else 1.0
    rms1 = list(whole[3])
    rms10 = [v / 10 for v in tenths[3]]
    out = [round(2 * whole[2] / 10) / 2, exact]
    for rms, step in ((rms1, 1.0), (rms10, 0.1)):
        share = min(rms) / rms[0] if rms[0] else 1.0
        bound = host.take_share_bound(rms, step)
        out.append((share <= host.TAKE_ADVISE_RATIO and bound <= host.TAKE_ADVISE_RATIO, bound, rms[0]))
    return tuple(out)


def main():
    import take_survey_sweep as tss
    from tennisbots import host
    ratio = host.TAKE_ADVISE_RATIO
    tot = dict(rows=0, picks=0, diff_w=0, diff_t=0, good_e=0, good_w=0, good_t=0, bad_e=0, bad_w=0, bad_t=0,
               spread=0, instant=0)
    for path in [a for a in sys.argv[1:] if not a.startswith("--")]:
        rows = [r for r in load(path) if isinstance(r, dict) and r.get("board_scores") and r.get("build")]
        if not rows:
            print(f"{path}: no survey rows")
            continue
        c = dict.fromkeys(tot, 0)
        notes = []
        for b in rows:
            c["rows"] += 1
            ms = b["take_ms"] if "take_ms" in b else tss.TAKES[b["build"][0]][1]
            c["spread" if ms else "instant"] += 1
            got = rescore(b)
            if got is None or got[0] == 0:
                continue
            pick, exact, (aw, bw, step1), (at, bt, step10) = got
            c["picks"] += 1
            ae = exact <= ratio
            c["diff_w"] += aw != ae
            c["diff_t"] += at != ae
            for k, a in (("e", ae), ("w", aw), ("t", at)):
                if ms:
                    c["good_" + k] += a and abs(pick - ms) <= 1.0
                else:
                    c["bad_" + k] += a
            if at != ae or aw != ae:
                notes.append(f"    build {b['build']} take {ms:g} ms pick {pick:g}: exact {exact:.3f}; whole ppm "
                             f"{'advised' if aw else 'withheld'} (bound {bw:.3f}, step {step1:g}); tenths "
                             f"{'advised' if at else 'withheld'} (bound {bt:.3f}, step {step10:g})")
        for k in tot:
            tot[k] += c[k]
        print(f"{path}: {c['rows']} drills, {c['picks']} nonzero picks; verdicts unlike the exact share: whole ppm "
              f"{c['diff_w']}, tenths {c['diff_t']}; spread named+advised e/w/t {c['good_e']}/{c['good_w']}/"
              f"{c['good_t']} of {c['spread']}; instant advised e/w/t {c['bad_e']}/{c['bad_w']}/{c['bad_t']} of "
              f"{c['instant']}")
        for n in notes:
            print(n)
    print(f"\nALL: {tot['rows']} drills, {tot['picks']} nonzero picks. Verdicts unlike the exact share: whole ppm with "
          f"guard G {tot['diff_w']}, tenths with its guard {tot['diff_t']}. Spread takes named within 1 ms and advised: "
          f"exact {tot['good_e']}, whole {tot['good_w']}, tenths {tot['good_t']} of {tot['spread']}. Instant builds "
          f"advised: exact {tot['bad_e']}, whole {tot['bad_w']}, tenths {tot['bad_t']} of {tot['instant']}.")


if __name__ == "__main__":
    main()
