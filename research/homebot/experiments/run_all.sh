#!/usr/bin/env bash
# Every training run reported in the README, in order (about 3.5 h on 4 CPU cores).
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

for seed in 0 1 2; do
  run "ArmReach_nominal_s$seed" --env ArmReach --steps 1500000 --seed $seed
  run "ArmReach_dr_s$seed" --env ArmReach --steps 1500000 --seed $seed --dr
done
run BimanualReach_dr_s0 --env BimanualReach --steps 3000000 --seed 0 --dr
run MobileReach_dr_s0 --env MobileReach --steps 6000000 --seed 0 --dr --eval-also MobileReachRollers
