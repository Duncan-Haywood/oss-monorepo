"""Interventions on a polarized society, each with one dose parameter.

bridge     share of within-camp ties rewired to cross camps (contact; Allport 1954)
broadcast  chance per sweep that an agent hears a fixed source at 0.5 instead of a neighbour
moderates  share of agents made committed moderates at 0.5 who never move (zealots)
ladder     the same share, split evenly over committed voices spaced at most 0.8*eps apart
           from camp centre 0.2 to camp centre 0.8 (stepping stones within reach)
nudge      share of agents moved once to 0.5, free to move back (a one-off persuasion drive)
tolerance  added to everyone's latitude of acceptance eps (perspective-taking training)
"""
from __future__ import annotations

import numpy as np

from .model import measures, polarized_society, rewire_bridges, run

LEVERS = ("none", "bridge", "broadcast", "moderates", "ladder", "nudge", "tolerance")


def ladder_positions(eps, lo=0.2, hi=0.8):
    k = int(np.ceil((hi - lo) / (0.8 * eps)))
    return np.linspace(lo, hi, k + 1)[1:-1]


def apply(lever, dose, eps, seed=0, n=1000, cross=0.05, design_eps=None):
    """A fresh polarized society with the lever applied; returns (society, run keywords).
    ``design_eps`` is the tolerance a ladder is spaced for (default: the true eps)."""
    soc = polarized_society(n=n, cross=cross, seed=seed)
    kw = {"eps": eps}
    rng = np.random.default_rng(seed + 10_007)
    pick = lambda share: rng.choice(soc.n, int(round(share * soc.n)), replace=False)
    if lever == "bridge":
        soc = rewire_bridges(soc, dose, seed)
    elif lever == "broadcast":
        kw.update(media=0.5, media_p=dose)
    elif lever == "moderates":
        z = pick(dose)
        soc.x[z], soc.fixed[z] = 0.5, True
    elif lever == "ladder":
        z = pick(dose)
        pos = ladder_positions(design_eps or eps)
        soc.x[z] = pos[np.arange(len(z)) % len(pos)]
        soc.fixed[z] = True
    elif lever == "nudge":
        soc.x[pick(dose)] = 0.5
    elif lever == "tolerance":
        kw["eps"] = eps + dose
    elif lever != "none":
        raise ValueError(lever)
    return soc, kw


def outcome(lever, dose, eps, tau, seed=0, sweeps=400, **soc_kw):
    soc, kw = apply(lever, dose, eps, seed, **soc_kw)
    run(soc, sweeps, seed, tau=tau, **kw)
    return measures(soc)
