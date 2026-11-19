"""The sub-8 advised instant build (2026-11-19, firmware/esp32/README.md "The sub-8 advised instant build, closed";
eval/take-instant-sub8-2026-11-19.md).

README "Take-blind rows traced" left one instant build of 72 advised at 1/8 us: the first held-out sub-8 capture set's
(lag 0.45 s, seed 11) launcher 1 at jitter 0, 3.5 ms at a best / step share of 0.57.

--stored traces that build from the stored capture: each wheel's board row, which wheels the step alone fits worse
than every take, the survey's rms in whole ppm (as the frame carries them) and unrounded, with every wheel and with
TAKE_SURVEY_BLIND.

--score scores recaptured sets (tests/take_survey_jitter.py --capture --tach-capture --sub 8 on today's tree) by the
board's own TAKE_SURVEY report (each row's "survey") and host.take_survey_advice: instant builds advised, the named
build's pick, and spread takes named within 1 ms and advised.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_instant_sub8.py --stored [rows.jsonl.gz]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_instant_sub8.py --score rows.jsonl ...
"""
import math
import sys

from take_survey_trim import grid_for, load

STORED = "eval/take-survey-capture-sub8-heldout-2026-11-18.jsonl.gz"
BUILD = (0, 0, 1, 0.45, 11)         # instant take, jitter 0, launcher 1, lag 0.45 s, seed 11


def survey(rows_rms, grid, blind):
    """(pick ms refined, rms ppm rounded, rms ppm unrounded, kept) by the board's ResidualSurvey."""
    import controller
    rs = controller.ResidualSurvey(grid, controller.TAKE_SURVEY_TRIM, blind)
    for got in rows_rms:
        if got and all(g is not None for g in got):
            rs.add([g * g for g in got])
    rep = rs.report(100)
    exact = [1e6 * math.sqrt(v / rs._kept) for v in rs.sums()]
    return rep[2] / 10, rep[3], exact, rs.kept_n


def stored(path):
    import take_misfit_trace as tm
    import controller
    from tennisbots import host
    row = next(b for b in load(path) if tuple(b["build"]) == BUILD)
    grid = grid_for(row)
    print(f"{path}: build {list(BUILD)} (instant take), grid {', '.join(f'{g / 1000:g}' for g in grid)} ms")
    print("wheel | rms per candidate, ppm | the step alone worse than every take")
    lone = 0
    for i, got in enumerate(row["board_scores"]):
        worse = got[0] > 1.5 * max(got[1:]) and max(got[1:]) <= 1.5 * min(got[1:])
        lone += worse
        print(f"  {i:2d} | {' '.join(f'{g * 1e6:6.2f}' for g in got)} | {'yes' if worse else ''}")
    print(f"{lone} wheels where only the step fits badly (over 1.5 x every take, the takes within 1.5 x of each other)")
    for blind in (0, controller.TAKE_SURVEY_BLIND):
        pick, rms, exact, kept = survey(row["board_scores"], grid, blind)
        best = min(range(len(rms)), key=rms.__getitem__)
        print(f"blind {blind:g}: {kept} wheels kept, pick {pick:g} ms; rms ppm {rms}; share in whole ppm "
              f"{rms[best] / rms[0]:.3f} (advised at {host.TAKE_ADVISE_RATIO}), unrounded "
              f"{min(exact) / exact[0]:.3f} ({', '.join(f'{e:.2f}' for e in exact)})")


def score(paths):
    import take_survey_sweep as tss
    from tennisbots import host
    total_good = total_spread = total_bad = total_inst = total_share = 0
    for path in paths:
        rows = load(path)
        good = spread = bad = inst = within = share_good = 0
        named = None
        for b in rows:
            sv, ms = b["survey"], tss.TAKES[b["build"][0]][1]
            adv = host.take_survey_advice(sv) or ""
            pick = round(2 * sv["refined_ms10"] / 10) / 2
            told = ("set TAKE_US" in adv and "TAKE_US = 0" not in adv)     # advice to flash a non-zero contact time
            within += abs(pick - ms) <= 1.0
            rms = sv["rms_ppm"]
            share = min(rms) / rms[0] if rms and rms[0] else 1.0
            if ms:
                spread += 1
                good += told and abs(pick - ms) <= 1.0
                # the 2026-11-18 sections' count: share at most the margin and the pick within 1 ms
                share_good += share <= host.TAKE_ADVISE_RATIO and abs(pick - ms) <= 1.0
            else:
                inst += 1
                bad += told
                if told:
                    print(f"  advised instant build {b['build']}: {adv}")
            if tuple(b["build"][:3]) == BUILD[:3]:
                named = (b["build"], pick, sv["rms_ppm"], adv)
        lag, seed = rows[0]["build"][3], rows[0]["build"][4]
        print(f"{path} (lag {lag} s, seed {seed}, {len(rows)} drills): instant advised {bad} of {inst}; spread takes "
              f"named within 1 ms and advised {good} of {spread} (by share alone, as on 2026-11-18: {share_good}); within 1 ms {within} of {len(rows)}")
        if named:
            print(f"  launcher 1, jitter 0, instant: pick {named[1]:g} ms, rms {named[2]}; {named[3]}")
        total_good += good
        total_share += share_good
        total_spread += spread
        total_bad += bad
        total_inst += inst
    print(f"all: instant advised {total_bad} of {total_inst}; spread takes named and advised {total_good} of "
          f"{total_spread} (by share alone {total_share})")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--score" in sys.argv:
        score(args)
    else:
        stored(args[0] if args else STORED)


if __name__ == "__main__":
    main()
