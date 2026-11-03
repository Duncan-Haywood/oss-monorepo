"""Likert-scale agents behind a pluggable policy: the harness for a town of language-model agents.

Each agent holds an opinion on a 7-point scale (0..6), meets one neighbour per sweep, sees the
neighbour's number and returns a move of -1, 0 or +1. The *policy* decides the move:

* ``stub_policy`` (default, deterministic given the seed, free): step toward a partner within
  reach ``eps`` (as a share of the scale), step away from one beyond ``tau``, with decision
  noise ``noise`` (a random move instead). It is the civ-levers rule on a coarse grid; it is NOT
  a language model and nothing here says what one would do.
* a real model: set ``CIV_LLM_POLICY=package.module:callable``. The callable has the signature
  ``policy(own, partner, rng) -> array of -1/0/+1``. Nothing in this repository calls a paid
  API; an owner who wants that run supplies the callable and the budget.

The levers are the ones in ``levers.py`` (the same societies, then opinions rounded to the scale).
"""
from __future__ import annotations

import importlib
import os

import numpy as np

from .levers import apply
from .model import measures

LEVELS = 7


def stub_policy(eps=0.3, tau=np.inf, noise=0.0, levels=LEVELS):
    top = levels - 1

    def policy(own, partner, rng):
        d = (partner - own) / top
        ad = np.abs(d)
        move = np.where(ad < eps, np.sign(d), np.where(ad > tau, -np.sign(d), 0)).astype(int)
        if noise > 0:
            flip = rng.random(len(own)) < noise
            move = np.where(flip, rng.integers(-1, 2, len(own)), move)
        return move
    return policy


def policy_from_env(default):
    spec = os.environ.get("CIV_LLM_POLICY")
    if not spec:
        return default
    mod, fn = spec.split(":")
    return getattr(importlib.import_module(mod), fn)


def run_likert(soc, policy, sweeps=200, seed=0, media=None, media_p=0.0, levels=LEVELS):
    """Rounds opinions to the scale and runs ``sweeps`` sweeps of the policy."""
    rng = np.random.default_rng(seed)
    top = levels - 1
    x = np.rint(soc.x * top).astype(int)
    deg = soc.degree
    for _ in range(sweeps):
        pick = soc.indptr[:-1] + (rng.random(soc.n) * np.maximum(deg, 1)).astype(np.int64)
        pick = np.minimum(pick, len(soc.indices) - 1)
        partner = np.where(deg > 0, x[soc.indices[pick]], x)
        if media is not None and media_p > 0:
            partner = np.where(rng.random(soc.n) < media_p, int(round(media * top)), partner)
        move = policy(x, partner, rng)
        move[soc.fixed] = 0
        x = np.clip(x + move, 0, top)
    soc.x = x / top
    return soc


def outcome(lever, dose, eps, tau, noise=0.0, seed=0, n=300, sweeps=200):
    soc, kw = apply(lever, dose, eps, seed, n=n)
    soc.x = np.rint(soc.x * (LEVELS - 1)) / (LEVELS - 1)
    pol = policy_from_env(stub_policy(kw["eps"], tau, noise))
    run_likert(soc, pol, sweeps, seed, media=kw.get("media"), media_p=kw.get("media_p", 0.0))
    return measures(soc)
