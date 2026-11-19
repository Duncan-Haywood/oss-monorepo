"""Does the ball hold's gain scale (controller.LOOP_BALL_GAIN, "down" since 2026-11-18) flatten the take survey?
(2026-11-19, eval/take-instant-sub8-2026-11-19.md)

Recapturing the sub-8 capture sets on today's tree, a 3 ms build that read the step at 87 ppm against 11 on
2026-11-18 read 12 against 8; with LOOP_BALL_GAIN False on that one build it read 34 against 7. This runs
tests/take_survey_jitter.py's capture with LOOP_BALL_GAIN set to --gain (False, "down" or True) before the workers
fork, so the same builds can be captured both ways and compared pair by pair.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_ball_gain.py --gain False --capture rows.jsonl \\
        --lag 0.3 --seed 7 --tach-capture --sub 8 [--jitters 0,0.5]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_ball_gain.py --compare on.jsonl off.jsonl [...]

--compare takes pairs of files (the shipped "down" capture, then the --gain False one) and scores the builds present in
both by the board's TAKE_SURVEY report: instant builds advised, spread takes named within 1 ms and advised (share at
most host.TAKE_ADVISE_RATIO), picks within 1 ms, and the mean best / step share of the spread takes.
"""
import sys

import take_misfit_trace  # noqa: F401  (puts controller on the path)
import controller
import take_survey_jitter as tj

def counts(rows):
    import take_survey_sweep as tss
    from tennisbots import host
    good = bad = within = 0
    shares = []
    for b in rows:
        sv, ms = b["survey"], tss.TAKES[b["build"][0]][1]
        rms = sv["rms_ppm"]
        pick = round(2 * sv["refined_ms10"] / 10) / 2
        share = min(rms) / rms[0] if rms and rms[0] else 1.0
        adv = share <= host.TAKE_ADVISE_RATIO and pick > 0
        within += abs(pick - ms) <= 1.0
        if ms:
            good += adv and abs(pick - ms) <= 1.0
            shares.append(share)
        else:
            bad += adv
    return good, bad, within, sum(shares) / max(1, len(shares)), len(shares), len(rows) - len(shares)


def compare(paths):
    from take_survey_trim import load
    tot = [[0] * 3 for _ in range(2)]
    n_sp = n_in = 0
    for on_p, off_p in zip(paths[::2], paths[1::2]):
        on = {tuple(b["build"]): b for b in load(on_p)}
        off = {tuple(b["build"]): b for b in load(off_p)}
        keys = sorted(set(on) & set(off))
        out = []
        for i, side in enumerate((on, off)):
            g, bad, w, sh, sp, inst = counts([side[k] for k in keys])
            out.append(f"{('down', 'False')[i]}: named and advised {g} of {sp}, instant advised {bad} of {inst}, "
                       f"within 1 ms {w} of {len(keys)}, mean share {sh:.2f}")
            for j, v in enumerate((g, bad, w)):
                tot[i][j] += v
        n_sp, n_in = n_sp + sp, n_in + inst
        print(f"{off_p} ({len(keys)} builds in both)\n  " + "\n  ".join(out))
    for i, name in enumerate(("down", "False")):
        print(f"all, {name}: named and advised {tot[i][0]} of {n_sp}, instant advised {tot[i][1]} of {n_in}, "
              f"within 1 ms {tot[i][2]} of {n_sp + n_in}")


if __name__ == "__main__" and "--compare" in sys.argv:
    compare([a for a in sys.argv[1:] if not a.startswith("--")])
elif __name__ == "__main__":
    controller.LOOP_BALL_GAIN = eval(sys.argv[sys.argv.index("--gain") + 1], {})
    tj.main()
