"""Write experiments/results.txt: edit policies against detector noise, camera count and switch cost, and clock sync (deterministic)."""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from capture_edit.model import (SYNC_TOL, estimate_offset, fixed_cut, greedy, hold, make_quality, observe,  # noqa: E402
                                score_edit, viterbi)

SEEDS = range(20)
DUR = 120
POL = ["fixed 3 s", "fixed 6 s", "greedy", "hold", "viterbi", "oracle"]


def run_policies(n_cams, sigma, cost=1.0):
    acc = {p: [] for p in POL}
    for sd in SEEDS:
        rng = random.Random(sd * 7919 + n_cams)
        q = make_quality(n_cams, DUR, rng)
        s = observe(q, sigma, rng)
        steps = len(q[0])
        paths = {"fixed 3 s": fixed_cut(n_cams, steps, 3.0), "fixed 6 s": fixed_cut(n_cams, steps, 6.0),
                 "greedy": greedy(s), "hold": hold(s), "viterbi": viterbi(s, cost), "oracle": viterbi(q, cost)}
        for p in POL:
            acc[p].append(score_edit(paths[p], q))
    return {p: {k: sum(r[k] for r in acc[p]) / len(acc[p]) for k in acc[p][0]} for p in POL}


def main():
    out = []
    out.append("== A. mean true quality of the chosen camera vs detector noise (4 cameras, 120 s, 20 seeds, switch cost 1.0, chosen from D on these same seeds)")
    out.append("sigma " + " ".join(p.replace(" ", "_") for p in POL))
    for sg in [0.05, 0.15, 0.3, 0.5, 0.8]:
        r = run_policies(4, sg)
        out.append("%.2f " % sg + " ".join("%.3f" % r[p]["quality"] for p in POL))
    out.append("")
    out.append("== B. cuts per minute and jarring-shot share (shots under 1.5 s) vs detector noise, same runs as A")
    out.append("sigma " + " ".join("%s_cuts %s_jar" % (p.replace(" ", "_"), p.replace(" ", "_")) for p in POL))
    for sg in [0.05, 0.15, 0.3, 0.5, 0.8]:
        r = run_policies(4, sg)
        out.append("%.2f " % sg + " ".join("%.1f %.2f" % (r[p]["cuts_per_min"], r[p]["jarring"]) for p in POL))
    out.append("")
    out.append("== C. mean true quality vs number of cameras (sigma 0.3, switch cost 1.0)")
    out.append("cameras " + " ".join(p.replace(" ", "_") for p in POL))
    for n in [2, 3, 4, 6, 8]:
        r = run_policies(n, 0.3)
        out.append("%d " % n + " ".join("%.3f" % r[p]["quality"] for p in POL))
    out.append("")
    out.append("== D. viterbi at 4 cameras, sigma 0.3: switch cost vs quality and cuts per minute")
    out.append("cost quality cuts_per_min jarring")
    for c in [0.0, 0.1, 0.3, 1.0, 3.0, 10.0]:
        r = run_policies(4, 0.3, c)["viterbi"]
        out.append("%.1f %.3f %.1f %.2f" % (c, r["quality"], r["cuts_per_min"], r["jarring"]))
    out.append("")
    out.append("== E. clock sync by envelope cross-correlation: median abs error (ms) and share beyond %d ms, 20 trials" % round(SYNC_TOL * 1000))
    out.append("noise  5s_ms 5s_bad 15s_ms 15s_bad 45s_ms 45s_bad")
    for nz in [0.1, 0.25, 0.5, 1.0]:
        cells = []
        for dur in (5, 15, 45):
            errs = []
            for t in range(20):
                rng = random.Random(1000 + t)
                off = rng.uniform(-0.5, 0.5)
                errs.append(abs(estimate_offset(dur, off, nz, rng) - off))
            errs.sort()
            cells.append("%.0f %.2f" % (errs[len(errs) // 2] * 1000, sum(e > SYNC_TOL for e in errs) / len(errs)))
        out.append("%.2f " % nz + " ".join(cells))
    Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
