"""Does leaving the take-blind wheels out of the take survey's sums sharpen its verdict? (2026-11-18,
firmware/esp32/README.md "The take survey skips take-blind wheels")

README "Take-blind rows traced" found that a contact-time candidate whose parts all land inside one revolution fits as
the step does, so most wheels give every candidate the same residual. Such a wheel cannot move the least sum, only pull
the best / step share toward 1, where host.TAKE_ADVISE_RATIO's margin stops advising. This rescores stored
take_survey_jitter.py captures (their `board_scores`, each wheel's rms per candidate as the board computed them) by the
board's ResidualSurvey (trim controller.TAKE_SURVEY_TRIM) at each `blind` value of --blinds, and prints the counts
take_survey_jitter.py --score prints, plus the wheels left out and the builds left with no verdict.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_blind.py rows.jsonl[.gz] ... [--blinds 1,1.5]
"""
import sys

from take_survey_trim import load


def summary(rows, blind):
    import take_misfit_trace as tm  # (puts controller on the path)
    import controller
    import take_survey_sweep as tss
    from tennisbots import host
    good = bad = within = n = spread = left = wheels = none = 0
    shares = []
    for b in rows:
        rs = controller.ResidualSurvey(tm.grid_of(b["board_scores"]), controller.TAKE_SURVEY_TRIM, blind)
        for got in b["board_scores"]:
            if got and all(g is not None for g in got):
                rs.add([g * g for g in got])
        left += rs.blind_n
        wheels += rs.n
        rep = rs.report(100)
        if rep is None or not any(rep[3]):          # (all wheels take-blind: the count with no verdict)
            none += 1
            continue
        _, least, ref, rms = rep
        share = min(rms) / rms[0] if rms[0] else 1.0
        ms = tss.TAKES[b["build"][0]][1]
        n += 1
        pick, adv = round(2 * ref / 10) / 2, share <= host.TAKE_ADVISE_RATIO
        within += abs(pick - ms) <= 1.0
        if ms:
            spread += 1
            good += adv and abs(pick - ms) <= 1.0
            shares.append(share)
        else:
            bad += adv
    return dict(good=good, spread=spread, bad=bad, instant=n - spread, within=within, n=n, none=none,
                share=sum(shares) / max(1, len(shares)), left=left, wheels=wheels)


def main():
    blinds = [float(x) for x in sys.argv[sys.argv.index("--blinds") + 1].split(",")] if "--blinds" in sys.argv \
        else [1.0, 1.5]
    skip = sys.argv[sys.argv.index("--blinds") + 1] if "--blinds" in sys.argv else None
    for path in [a for a in sys.argv[1:] if not a.startswith("--") and a != skip]:
        rows = load(path)
        print(f"\n{path}: {len(rows)} survey drills")
        for bl in blinds:
            r = summary(rows, bl)
            print(f"  blind {bl:g}: spread takes named within 1 ms and advised {r['good']} of {r['spread']}, instant "
                  f"advised {r['bad']} of {r['instant']}, within 1 ms {r['within']} of {r['n']}, no verdict "
                  f"{r['none']}, mean share {r['share']:.2f}; wheels left out {r['left']} of {r['wheels']}")


if __name__ == "__main__":
    main()
