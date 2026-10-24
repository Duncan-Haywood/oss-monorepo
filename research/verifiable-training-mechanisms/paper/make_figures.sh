#!/bin/sh
# One command per figure; run from research/verifiable-training-mechanisms.
# Needs numpy, scipy, scikit-learn, matplotlib (milestone 3 and 4 figures).
set -e
PY=${PY:-python3}
export PYTHONPATH=src
$PY experiments/margin/figure.py      # fig. 1: loss given up versus tolerance
$PY experiments/frontier/figure.py    # fig. 2: requester cost versus tolerance
