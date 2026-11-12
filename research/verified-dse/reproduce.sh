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
for s in bound quantile topk sweep kth kth_pilot kth_inflate quantile_g; do $PY experiments/theory/$s.py; done
$PY -m unittest discover -s tests
git diff --stat -- experiments   # empty when the committed tables are reproduced exactly
$PY experiments/bohb/bohb.py       # milestone 54 (about 80 s)
$PY experiments/bohb/gate.py main; $PY experiments/bohb/gate.py unfaithful; $PY experiments/bohb/gate.py unfaithful2   # milestone 70 (about 3 min)
$PY experiments/fanout_sweep/analyse.py; $PY experiments/fanout_sweep/analyse.py results_y033.jsonl results_y033.txt   # milestones 73, 74 (no flow)
# Milestone 83: cached-table analyses that had no line here (no flow; about 7 min in all, of which rung_bias_26q3/replay.py is 3).
for s in theory/anchored theory/optimum_rank theory/optimum_rank_n theory/disjoint_check theory/with_replacement theory/quantile_counterexample theory/quantile_g_pilot tail_risk/tail corner_replay/replay corner_ss/compare r2_area_arm/replay r2_harsh_cut/replay unseen/replay hostile/replay util65/analyse large/analyse large/halving_replay detail_route/analyse detail_route/analyse_sub12 detail_route/analyse_sub4 fanao_mech/analyse rung_bias_26q3/compare rung_bias_26q3/replay proof_success/compare_y070; do $PY experiments/$s.py; done
$PY experiments/theory/pilot_rho.py; $PY experiments/theory/pilot_rho_bound.py   # milestones 84, 90 (no flow) ; $PY experiments/theory/pilot_rho_power.py   # milestone 92
git diff --stat -- experiments   # empty again when all of the above reproduce exactly
$PY experiments/fresh_pool/analyse.py; $PY experiments/fresh_pool/price.py   # milestones 108, 109 (no flow; experiments/fresh_pool/run.py re-runs the 2,400-point flow, about 14 min on 4 cores)
$PY experiments/heldout_designs/replay.py   # milestone 110 (no flow; under a second)
$PY experiments/switch_guard/rule.py   # milestone 111 (no flow; under 10 s)
$PY experiments/fresh_dear/analyse.py   # milestone 112 (no flow; under 2 s; experiments/fresh_dear/run.py re-runs the 1,440-point flow, about 50 min on 4 cores)
$PY experiments/fresh_designs/analyse.py   # milestone 113 (no flow; under 3 s; experiments/fresh_designs/run.py re-runs the 1,920-point flow, about 2 h on 4 cores)
$PY experiments/r2_guard/guard.py   # milestone 114 (no flow; under 15 s)
$PY experiments/clip_score/score.py   # milestone 115 (no flow; under 10 s; experiments/clip_score/run.py re-runs the 1,680-point flow, about 65 min on 4 cores)
$PY experiments/pilot_clip/guard.py   # milestone 116 (no flow; under 15 s; experiments/pilot_clip/run.py re-runs the 1,200-point flow, about 1 h 50 min on 4 cores)
$PY experiments/switch_pooled/pool.py   # milestone 117 (no flow; under 15 s)
