#!/bin/sh
# Re-derives every number in PAPER.md from the cached flow tables (no EDA tools needed, a few minutes on one core).
# The flow itself (experiments/rung_bias/run.py, experiments/proof_success/proof_run.py) needs OpenROAD and Yosys; see README.
# Needs numpy and scikit-learn: PY=$(python3 ../../platform/ci/pyenv.py numpy scikit-learn) sh reproduce.sh
set -e
cd "$(dirname "$0")"
PY=${PY:-python3}
$PY experiments/rung_bias/analyse.py
for d in search_baselines halving hyperband conformal; do $PY experiments/$d/replay.py; done
$PY experiments/proof_success/analyse.py
for s in bound quantile topk sweep; do $PY experiments/theory/$s.py; done
$PY -m unittest discover -s tests
git diff --stat -- experiments   # empty when the committed tables are reproduced exactly
