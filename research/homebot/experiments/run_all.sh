#!/usr/bin/env bash
# Every training run reported in the README, in order (about 16 h on 4 CPU cores).
# Resumable: a run whose eval.json exists is skipped; a half-finished run starts over.
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=src
OUT=${RUNS_DIR:-experiments/runs}

run() {  # run <tag> <train.py args...>
  local tag=$1; shift
  if [ -f "$OUT/$tag/eval.json" ]; then echo "skip $tag (done)"; return; fi
  rm -rf "${OUT:?}/$tag"
  python experiments/train.py --out "$OUT" "$@"
}

# Picking with the parallel gripper (v2). The first randomised run (no entropy bonus, 5 M
# steps) let PPO's exploration noise collapse and plateaued; the reported randomised policies
# keep an entropy bonus and train for 8 M steps.
for seed in 0 1 2; do
  run "ArmPick_nominal_s$seed" --env ArmPick --steps 3000000 --seed $seed --eval-episodes 100
done
run ArmPick_dr_s0 --env ArmPick --steps 5000000 --seed 0 --dr --eval-episodes 100
for seed in 0 1 2; do
  run "ArmPick_dr_ent_s$seed" --env ArmPick --steps 8000000 --seed $seed --dr --ent-coef 0.005 --variant ent \
    --eval-episodes 100
done
# Ablation: randomised picking trained on the camera observation model (Randomization.camera_model)
run ArmPick_dr_cam_s0 --env ArmPick --steps 8000000 --seed 0 --dr --ent-coef 0.005 --variant cam --camera-model \
  --eval-episodes 100
# Reaching (retrained on the v2 arm)
for seed in 0 1 2; do
  run "ArmReach_nominal_s$seed" --env ArmReach --steps 1500000 --seed $seed
  run "ArmReach_dr_s$seed" --env ArmReach --steps 1500000 --seed $seed --dr
done
run BimanualReach_dr_s0 --env BimanualReach --steps 6000000 --seed 0 --dr
run MobileReach_dr_s0 --env MobileReach --steps 6000000 --seed 0 --dr --eval-also MobileReachRollers
