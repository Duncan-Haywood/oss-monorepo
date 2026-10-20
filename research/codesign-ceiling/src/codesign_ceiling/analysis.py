"""Reachability analysis on the per-design, per-force, per-scene success table written by experiments/reach.py."""
import numpy as np

CONDITIONS = {
    "A: as in codesign-diagnose (force capped by finger strength and 30 N)": dict(strength=True, fmax=30.0),
    "B: finger strength ignored, force up to 30 N": dict(strength=False, fmax=30.0),
    "C: finger strength ignored, force up to 60 N": dict(strength=False, fmax=60.0),
}


def table(designs, cond):
    """Boolean array [design, force_index, scene] with disallowed (design, force) pairs set to False, plus the forces."""
    out = []
    for d in designs:
        row = []
        for f, ok in sorted(d["ok"].items(), key=lambda kv: float(kv[0])):
            allowed = float(f) <= cond["fmax"] + 1e-9 and (not cond["strength"] or float(f) <= d["f_max"] + 1e-9)
            row.append(np.array(ok) if allowed else np.zeros(len(ok), dtype=bool))
        out.append(np.array(row))
    return out


def oracle_reach(designs, cond):
    """Per scene: held by some design at some allowed force."""
    return np.any([t.any(axis=0) for t in table(designs, cond)], axis=0)


def per_design_best(designs, cond, n_test):
    """For each design the single best force on the test scenes. Returns (test_success, fresh_success) arrays."""
    te, fr = [], []
    for t in table(designs, cond):
        k = int(np.argmax(t[:, :n_test].mean(axis=1)))
        te.append(t[k, :n_test].mean()); fr.append(t[k, n_test:].mean())
    return np.array(te), np.array(fr)


def per_design_oracle(designs, cond):
    """For each design a force chosen per scene (a design's own ceiling): mean over scenes of 'held at some force'."""
    return np.array([t.any(axis=0).mean() for t in table(designs, cond)])


def reach_by_bins(scenes, reach, key, edges):
    """Share of scenes reachable in each bin of scene[key]."""
    v = np.array([s[key] for s in scenes])
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (v >= lo) & (v < hi)
        out.append((lo, hi, int(m.sum()), float(reach[m].mean()) if m.any() else float("nan")))
    return out
