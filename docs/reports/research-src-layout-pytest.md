# Research src-layout pytest collection, 2026-11-11

`research/_shared/src_layout.py` (run by `programme_check.py` in research CI) checks that a
src-layout project's tests can be imported by a plain `pytest` run in the project directory,
and `--fix` adds the `pythonpath` line. On 2026-11-11 it fixed 391 projects. After the fix, 366
collect with `/usr/bin/python3.13` (`pyenv.py pytest numpy`) and no `PYTHONPATH`. The 25 that
still fail are listed below, so the next run doesn't have to rediscover them.

**Needs a package (use `pyenv.py -r <project>/requirements.txt` or name it):**
- `research/chip-digits`: sklearn
- `research/chip-digits-qat`: sklearn
- `research/eda-surrogate`: sklearn
- `research/lowcomm-training`: torch
- `research/robofab-insert`: mujoco
- `research/robofab-mujocotorque`: mujoco
- `research/sensing-ba`: scipy
- `research/sensing-bafocal`: scipy
- `research/sensing-baoutlier`: scipy
- `research/sensing-calibviews`: cv2
- `research/sensing-epigate`: scipy
- `research/sensing-gatecorr`: scipy
- `research/sensing-gatemix`: scipy
- `research/sensing-kploc`: cv2
- `research/sensing-matchmix`: scipy
- `research/sensing-matchreal`: cv2
- `research/sensing-mixgate`: scipy
- `research/verifiable-training-mechanisms`: scipy

**Imports another research project's package.** To run these, put that project's `src/` on `PYTHONPATH` too, or vendor the function. The check doesn't flag them because their own `src/` is configured:
- `research/eda-harness`: imports `chip_accel`
- `research/free-rdseeds`: imports `free_qmcdr`
- `research/marine-fleet`: imports `marine_hull`
- `research/osrobot-uavwind`: imports `osrobot_uav`
- `research/replay-law`: imports `forgetting_law`
- `research/replay-memory`: imports `replay_law`
- `research/router-impurity`: imports `forgetting_law`
