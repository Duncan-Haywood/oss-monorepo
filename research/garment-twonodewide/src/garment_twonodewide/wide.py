"""Retune the on/off and proportional gates on a narrow (22-26 C) or a wide (20-28 C) set of training rooms and score
both on the same held-out rooms. Model, gates, grids, penalty and tuning come from `garment-twonodepen`; this module
only adds the room sets."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-twonodepen", "src"))
from garment_twonodepen import pen as Q  # noqa: E402

scenarios = Q.h.scenarios
TRAIN_NARROW = scenarios((22.0, 24.0, 26.0))              # the training set of garment-twonodepen
TRAIN_WIDE = scenarios((20.0, 22.0, 24.0, 26.0, 28.0))
# Held-out rooms, none in either training set; grouped by where they sit relative to the two training ranges.
TEST = {
    "inside both (23, 25 C)": scenarios((23.0, 25.0)),
    "outside narrow, inside wide (21, 27 C)": scenarios((21.0, 27.0)),
    "outside both (18, 30 C)": scenarios((18.0, 30.0)),
}
PENALTIES = (0.01, 0.1)


def disjoint():
    train = set(TRAIN_NARROW) | set(TRAIN_WIDE)
    return all(not (set(s) & train) for s in TEST.values())
