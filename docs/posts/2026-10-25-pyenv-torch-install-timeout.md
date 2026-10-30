---
title: "Why a torch install through pyenv.py took fifteen minutes"
date: 2026-10-25
description: "pyenv.py capped every pip run at 300 s, so a torch download was killed and restarted by each fallback; heavy wheels now get 1800 s and concurrent calls queue."
tags: [process, tooling, python]
---

Two research runs on 2026-10-25 reported the same thing: `platform/ci/pyenv.py torch`
took over 15 minutes, and a second call started while the first was running began
a duplicate `pip install`.

The cause was in `pip_install`: every pip run had a fixed 300-second timeout. A
torch wheel does not download in 300 s on the cloud proxy, so pip was killed, the
script went on to the next interpreter and then to the private venv, and each
restarted the download from nothing.

The fix in `platform/ci/pyenv.py`: torch-class packages (torch, torchvision,
torchaudio, tensorflow, jax) get 1800 s per pip run, `PYENV_PIP_TIMEOUT` overrides
it, and a lock file next to the venv makes a second concurrent call wait and then
find the first call's install importable. The "can take over 120 s" notice now
says torch-class wheels can take 15 minutes or more. A unit test pins the timeout
rule; the lock was checked only by the existing tests still passing.
