#!/bin/sh
# Full experiment: 2 families x 4 proposers, 3 rounds, 4 candidate evaluations per side per round.
# Two workers with 2 threads each (about 2.5 hours on 4 CPUs). Usage: ./run_all.sh [seed]
cd "$(dirname "$0")" || exit 1
S=${1:-0}
( for f in reddit reviews; do for p in random ga; do python3 run.py --family $f --proposer $p --seed $S; done; done ) > log_a.txt 2>&1 &
( for f in reddit reviews; do for p in grips llm; do python3 run.py --family $f --proposer $p --seed $S; done; done ) > log_b.txt 2>&1 &
wait
