"""Milestone 7zo, post-hoc (labelled so; decided after reading section A of results_panel_doublebody.txt): split the
heave-pitch damping coupling into the part consistent with the Timman-Newman relations and the part that breaks them.

    PYTHONPATH=src:experiments python3 experiments/run_coupling_symmetry.py > experiments/results_coupling_symmetry.txt

For a hull symmetric fore and aft, Timman and Newman's (1962) relation B_ij(U) = B_ji(-U) and the x -> -x mirror give
B53(U) = -B35(U). So S = (B35 - B53)/2 is the part a symmetric-consistent model can carry and V = (B35 + B53)/2 is a
violation (0 for an exact linear theory). Stdlib only: reads the 'row' tables of the 7zn and 7zo results and Kashiwagi
et al.'s measured forced-oscillation points (Fig. 1, as `run_kashiwagi_baselines`), measured interpolated to each code's
KL grid (KL >= 3).
"""
import math
import os

import run_kashiwagi_baselines as kb

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = (("strip", "results_panel_speed.txt", 5), ("panel uniform stream (7zn)", "results_panel_speed.txt", 1),
         ("panel double body (7zo)", "results_panel_doublebody.txt", 1))


def rows(name, off):
    out = {}
    with open(os.path.join(HERE, name)) as f:
        in_a = False
        for line in f:
            if line.startswith("== A."):
                in_a = True
            elif line.startswith("=="):
                in_a = False
            if in_a and line.startswith("row "):
                v = line.split()
                kl = float(v[1])
                a35, b35, a53, b53 = (float(x) for x in v[1 + off:5 + off])
                out[kl] = dict(A35=a35, B35=b35, A53=a53, B53=b53)
    return out


def main():
    cur = kb.read_curves()
    meas = {c: kb.smooth_measured(cur[(c, "experiment")]) for c in kb.COEFS}
    print("Timman-Newman split of the damping coupling (non-dimensional), KL >= 3; S = (B35 - B53)/2, V = (B35 + B53)/2")
    m_rows = []
    for kl in (3, 5, 7.5, 10, 15, 20, 25):
        b35, b53 = kb.interp(meas["B35"], kl), kb.interp(meas["B53"], kl)
        if b35 is not None and b53 is not None:
            m_rows.append((kl, (b35 - b53) / 2, (b35 + b53) / 2))
    print("measured (interpolated): " + " ".join(f"KL {k:g}: S {s:+.4f} V {v:+.4f}" for k, s, v in m_rows))
    ms = {k: s for k, s, _ in m_rows}
    for tag, name, off in FILES:
        r = rows(name, off)
        es, vs = [], []
        line = []
        for k in ms:
            if k in r:
                s = (r[k]["B35"] - r[k]["B53"]) / 2
                v = (r[k]["B35"] + r[k]["B53"]) / 2
                es.append(s - ms[k])
                vs.append(v)
                line.append(f"{k:g}:{s:+.4f}/{v:+.4f}")
        rms = lambda e: math.sqrt(sum(x * x for x in e) / len(e))
        mean_ratio = sum(ms[k] + e for k, e in zip(ms, es)) / sum(ms[k] for k in ms)
        print(f"{tag}: S rms error {rms(es):.4f}, S summed over KL / measured {mean_ratio:.3f}, |V| rms {rms(vs):.4f} "
              f"(n {len(es)})")
        print("  KL:S/V " + " ".join(line))
    mv = math.sqrt(sum(v * v for _, _, v in m_rows) / len(m_rows))
    print(f"measured |V| rms {mv:.4f} (the data's own departure from the relation)")


if __name__ == "__main__":
    main()
