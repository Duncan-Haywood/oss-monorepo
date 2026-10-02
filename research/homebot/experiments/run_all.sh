#!/usr/bin/env bash
# Every training run reported in the README, in order (about 3.5 h on 4 CPU cores).
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=src
T="python experiments/train.py --out experiments/runs"
for seed in 0 1 2; do
  $T --env ArmReach --steps 1500000 --seed $seed
  $T --env ArmReach --steps 1500000 --seed $seed --dr
done
$T --env BimanualReach --steps 3000000 --seed 0 --dr
$T --env MobileReach --steps 6000000 --seed 0 --dr --eval-also MobileReachRollers
