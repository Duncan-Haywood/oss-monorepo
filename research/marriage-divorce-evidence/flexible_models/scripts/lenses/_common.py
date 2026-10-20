"""Shared helpers for the lens loaders: paths, importing a lens's own modules, and the
`claude/marriage-more-predictors` extension scripts (read from that branch with `git show` until
they are on main, then from disk)."""
import importlib.util
import os
import subprocess
import sys
import types
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
PROJ = HERE.parents[2]                      # research/marriage-divorce-evidence
REPRO = PROJ / 'reproducibility'
REPO = PROJ.parents[1]
BRANCH = os.environ.get('MORE_PREDICTORS_REF', 'origin/claude/marriage-more-predictors')
# Raw and intermediate person-level files live OUTSIDE the repository (see each lens's download.sh).
SCRATCH = Path(os.environ.get('FLEX_DATA', '/tmp/claude-0/-home-user-oss-monorepo/923dbe75-fd8c-5824-8bb5-c7e2b6a2405e/scratchpad'))


def lens_path(lens):
    p = str(REPRO / lens)
    for q in (str(REPRO), p):
        if q in sys.path:
            sys.path.remove(q)
        sys.path.insert(0, q)
    # a module name (train_models, metrics, ...) can be shared by several lenses: forget others' copies
    for name in list(sys.modules):
        f = getattr(sys.modules[name], '__file__', None) or ''
        if f.startswith(str(REPRO)) and not f.startswith(p) and Path(f).parent != REPRO:
            del sys.modules[name]


def branch_module(lens, fname, modname):
    """Import reproducibility/<lens>/<fname> from disk if present, else from the more-predictors
    branch, executed as if it lived in its lens folder (so its relative paths resolve)."""
    path = REPRO / lens / fname if lens else REPRO / fname
    if path.exists():
        spec = importlib.util.spec_from_file_location(modname, path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[modname] = mod
        spec.loader.exec_module(mod)
        return mod
    rel = path.relative_to(REPO)
    src = subprocess.run(['git', '-C', str(REPO), 'show', f'{BRANCH}:{rel}'], check=True, capture_output=True,
                         text=True).stdout
    mod = types.ModuleType(modname)
    mod.__file__ = str(path)
    sys.modules[modname] = mod
    exec(compile(src, str(path), 'exec'), mod.__dict__)
    return mod


def extended_eval():
    return branch_module('', 'extended_eval.py', 'extended_eval')


def group_ids(x):
    return pd.factorize(pd.Series(x).astype(str))[0]


def person_folds(n_people, seed, folds=5):
    """The repository's usual person-fold assignment: seeded permutation, i % folds."""
    perm = np.random.default_rng(seed).permutation(n_people)
    f = np.empty(n_people, int)
    f[perm] = np.arange(n_people) % folds
    return f


def grid_score(dur, years, start=0.0, advance=()):
    """score_fn for person-period lenses: cumulative predicted hazard over marriage years
    start..start+years-1 from each person's baseline row (duration set on a grid; columns in
    `advance` move with the duration)."""
    def score(predict, people):
        g = people.loc[people.index.repeat(years)].copy()
        t = np.tile(np.arange(years, dtype=float), len(people)) + start
        for c in advance:
            g[c] = g[c].to_numpy(float) + (t - g[dur].to_numpy(float))
        g[dur] = t
        return predict(g).reshape(len(people), years).sum(1)
    return score
