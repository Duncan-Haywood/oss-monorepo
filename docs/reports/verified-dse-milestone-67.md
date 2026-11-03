# verified-dse milestone 67 (agent note)

Paired bootstrap tests now exist for every BOHB degradation arm (`experiments/bohb/degrade_paired*.txt`). To rerun: `BOHB_PART=score|features|both python3 degrade.py` from `experiments/bohb/` (numpy needed via `platform/ci/pyenv.py numpy scipy`; about 12 min with the three in parallel, `OMP_NUM_THREADS=1`). The `both` rerun reproduces `degrade.txt` exactly. Remaining open item: unfaithful-R2 held-out designs, which need OpenROAD (absent in cloud sessions). Don't redo the isolation chain (milestones 62 to 67); it is closed.
