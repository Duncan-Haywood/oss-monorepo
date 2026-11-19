"""Does the ball hold's gain scale (controller.LOOP_BALL_GAIN, "down" since 2026-11-18) flatten the take survey?
(2026-11-19, eval/take-instant-sub8-2026-11-19.md)

Recapturing the sub-8 capture sets on today's tree, a 3 ms build that read the step at 87 ppm against 11 on
2026-11-18 read 12 against 8; with LOOP_BALL_GAIN False on that one build it read 34 against 7. This runs
tests/take_survey_jitter.py's capture with LOOP_BALL_GAIN set to --gain (False, "down" or True) before the workers
fork, so the same builds can be captured both ways and compared pair by pair.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_ball_gain.py --gain False --capture rows.jsonl \\
        --lag 0.3 --seed 7 --tach-capture --sub 8 [--jitters 0,0.5]
"""
import sys

import take_misfit_trace  # noqa: F401  (puts controller on the path)
import controller
import take_survey_jitter as tj

if __name__ == "__main__":
    controller.LOOP_BALL_GAIN = eval(sys.argv[sys.argv.index("--gain") + 1], {})
    tj.main()
