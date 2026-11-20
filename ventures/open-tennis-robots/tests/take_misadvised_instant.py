"""Instant builds a take survey misadvises, with their straddle votes (2026-11-20, eval/feed-phase-margin-2026-11-20.md).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_misadvised_instant.py FILE.jsonl.gz [...]

Simulated only, as the captures are.
"""
import sys


def main(paths):
    import take_straddle_scaled as tss
    import take_straddle_vote as tsv
    from tennisbots import host
    for p in paths:
        rows = tsv.rows_for([p], 4)
        builds = tsv.load([p])
        for (t, sv), b in zip(rows, builds):
            if t == 0 and sv:
                for m in (2, 3):
                    v = tss.verdict(sv, "margin", m)
                    if v:
                        print(p.split('/')[-1], m, {k: sv.get(k) for k in ("straddle_for","straddle_against","straddle_long_for","straddle_long_against","board_ms10","kept")}, v)
                        print("  ", host.take_survey_advice(sv)[:220])


if __name__ == "__main__":
    main(sys.argv[1:])
