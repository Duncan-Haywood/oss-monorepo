"""Does a finer capture unit move the drop fit's window? (2026-11-18, eval/take-survey-capture-sub8-2026-11-18.txt)

One held-out survey build (half-sine 6 ms take, launcher 0, wheel lag 0.45 s, seed 11, capture on, no jitter) with the
capture's periods in 1 / SUB us; writes each take-survey wheel's period count, controller._anchor's slowest revolution,
the periods around it and the board's rms at each candidate (1e-6 of the pre-ball speed) to OUT. One sub per process
(take_misfit_trace patches SimFeeder.run_ms once).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_sub_anchor.py SUB OUT.json
"""
import json
import sys

SUB, OUT = int(sys.argv[1]), sys.argv[2]
sys.argv[1:] = ["--tach-capture"]
import min_fit_heldout as h  # noqa: E402
import take_misfit_trace as tm  # noqa: E402
import take_survey_jitter as tsj  # noqa: E402
import take_survey_sweep as tss  # noqa: E402

import controller  # noqa: E402  (on the path once take_misfit_trace is imported)

tss.SEED = 11
base = h.PLANTS
out = {}
for sub in (SUB,):
    plants = list(base)
    plants[tsj.TACH_PLANT] = ("x", dict(base[tsj.TACH_PLANT][1], tach_jitter_us=0.0, tach_capture=True,
                                        tach_capture_sub=sub))
    h.PLANTS = tuple(plants)
    a, r = tm.capture_survey((2, tsj.TACH_PLANT, 0, 0.45))
    rows = []
    for w in r["wheels"]:
        p = w["periods"]
        k = controller._anchor(p, None)
        rows.append((len(p), k, [round(x, 2) for x in p[max(0, k - 3):k + 3]], [round(b ** 0.5 * 1e6) for b in w["board"]]))
    out[sub] = rows
json.dump(out, open(OUT, "w"))
