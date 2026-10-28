#!/bin/sh
# Re-derives every number in PAPER.md from the cached flow tables (no EDA tools needed, a few minutes on one core).
# The flow itself (experiments/rung_bias/run.py, experiments/proof_success/proof_run.py) needs OpenROAD and Yosys; see README.
# Needs numpy and scikit-learn: PY=$(python3 ../../platform/ci/pyenv.py numpy scikit-learn) sh reproduce.sh
set -e
cd "$(dirname "$0")"
PY=${PY:-python3}
$PY experiments/rung_bias/analyse.py
for d in search_baselines halving hyperband conformal; do $PY experiments/$d/replay.py; done
$PY experiments/conformal/replay.py experiments/large/results.jsonl ../large/conformal_   # milestone 10
$PY experiments/hedge/replay.py   # milestone 11
$PY experiments/eta_sweep/sweep.py   # milestone 12
$PY experiments/eta_floor/sweep.py   # milestone 13
$PY experiments/signif/test.py       # milestone 14
$PY experiments/nonarith/analyse.py; $PY experiments/nonarith/sweep.py; $PY experiments/nonarith/perdesign.py   # milestone 15
$PY experiments/pilot_gate/gate.py   # milestone 16
$PY experiments/pilot_sweep/sweep.py       # milestone 17
$PY experiments/r2_components/components.py   # milestone 18
$PY experiments/learned_score/learned.py   # milestone 19
$PY experiments/mf_surrogate/surrogate.py  # milestone 20 (about 150 s)
$PY experiments/mf_explore/explore.py      # milestone 21 (about 350 s)
$PY experiments/mf_gp/gp.py                # milestone 22 (about 940 s)
$PY experiments/heldout_signif/test.py     # milestone 29 (about 2 min, no flow)
$PY experiments/fanout_rich/analyse.py; $PY experiments/fanout_rich/replay.py   # milestone 30
$PY experiments/mf_tpe/tpe.py               # milestone 23 (about 20 min)
$PY experiments/proof_success/analyse.py
for s in bound quantile topk sweep kth kth_pilot; do $PY experiments/theory/$s.py; done
$PY -m unittest discover -s tests
git diff --stat -- experiments   # empty when the committed tables are reproduced exactly
