"""Does the survey's trim throw away the take survey's only informative wheels? (2026-11-18, firmware/esp32/README.md
"Take-blind rows traced")

tests/take_blind_trace.py found that a take candidate whose parts all land inside one revolution fits exactly as the
step does, so only the wheels whose ball's take straddles a revolution's edge tell the candidates apart, and on those
wheels even the right candidate fits worse than the take-blind wheels (the four-part take is not the true profile).
ResidualSurvey drops every wheel whose best fit is over SURVEY_TRIM (5) times the median wheel's: on a quiet tach those
are the straddling wheels.

This rescores stored take_survey_jitter.py captures (their `board_scores`, each wheel's rms per candidate as the board
computed them) by the board's own ResidualSurvey and survey_pick with the trim at each value of --trims, and prints the
same counts take_survey_jitter.py --score prints, per trim, plus the wheels the trim dropped.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_trim.py rows.jsonl[.gz] ... [--trims 5,inf]
"""
import gzip
import json
import sys


def load(path):
    with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
        return [json.loads(line) for line in f]


def score(rows, trim):
    import take_misfit_trace as tm
    import controller
    out = {}
    for b in rows:
        rs = controller.ResidualSurvey(tm.grid_of(b["board_scores"]), trim)
        for got in b["board_scores"]:
            if got and all(g is not None for g in got):
                rs.add([g * g for g in got])
        rs.sums()
        out[tuple(b["build"])] = (tm.survey_score(b["board_scores"], trim), rs.trimmed, len(rs.wheels))
    return out


def summary(rows, trim):
    import take_survey_sweep as tss
    from tennisbots import host
    ratio = host.TAKE_ADVISE_RATIO
    sc = score(rows, trim)
    good = bad = within = n = spread = trimmed = wheels = 0
    shares = []
    for build, (s, tr, nw) in sc.items():
        trimmed += tr
        wheels += nw
        if s is None:
            continue
        ms = tss.TAKES[build[0]][1]
        n += 1
        pick, adv = round(2 * s[1]) / 2, s[3] <= ratio
        within += abs(pick - ms) <= 1.0
        if ms:
            spread += 1
            good += adv and abs(pick - ms) <= 1.0
            shares.append(s[3])
        else:
            bad += adv
    return dict(good=good, spread=spread, bad=bad, instant=n - spread, within=within, n=n,
                share=sum(shares) / max(1, len(shares)), trimmed=trimmed, wheels=wheels)


def main():
    # 0 sums every wheel (controller.TAKE_SURVEY_TRIM); "inf" reads the same
    trims = [float(x) for x in sys.argv[sys.argv.index("--trims") + 1].split(",")] if "--trims" in sys.argv else [5.0, 0.0]
    paths = [a for a in sys.argv[1:] if not a.startswith("--") and a != (sys.argv[sys.argv.index("--trims") + 1]
                                                                          if "--trims" in sys.argv else None)]
    for path in paths:
        rows = load(path)
        print(f"\n{path}: {len(rows)} survey drills")
        for t in trims:
            r = summary(rows, t)
            print(f"  trim {t:g}: spread takes named within 1 ms and advised {r['good']} of {r['spread']}, instant "
                  f"advised {r['bad']} of {r['instant']}, within 1 ms {r['within']} of {r['n']}, mean share "
                  f"{r['share']:.2f}; wheels trimmed {r['trimmed']} of {r['wheels']}")


if __name__ == "__main__":
    main()
