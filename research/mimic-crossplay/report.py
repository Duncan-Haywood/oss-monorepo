"""Build results.txt, results.json and results/figure.svg from results/*_matrix*.json."""
import json, os, random, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import analysis  # noqa: E402

FAMILIES = ("reddit", "reviews")
PROPOSERS = ("random", "ga", "grips", "llm")
EPS = 0.15  # about 1.5 standard errors of a difference of two 48-title accuracies near 0.5
BOOT = 300


def acc_matrix(margins, ks):
    """margins[j][i][k] -> A[i][j] = share of titles k in ks where the detector picked the human text."""
    nd, ni = len(margins), len(margins[0])
    return np.array([[np.mean([margins[j][i][k] > 0 for k in ks]) for j in range(nd)] for i in range(ni)])


def index(prompts, proposer, rnd):
    for n, p in enumerate(prompts):
        if [proposer, rnd] in p["origin"]:
            return n
    raise KeyError((proposer, rnd))


def run_matrix(m, A, proposer):
    ii = [index(m["imitators"], proposer, r) for r in range(4)]
    jj = [index(m["detectors"], proposer, r) for r in range(4)]
    return A[np.ix_(ii, jj)], ii, jj


def nash_boot(margins, ks, reps=BOOT, seed=0):
    rng = random.Random(seed)
    vals = []
    for _ in range(reps):
        sub = [rng.choice(ks) for _ in ks]
        vals.append(analysis.solve_zero_sum(acc_matrix(margins, sub))[2])
    vals.sort()
    return float(vals[int(0.025 * reps)]), float(vals[int(0.975 * reps) - 1])


def family_report(fam, tag=None):
    path = os.path.join(HERE, "results", f"{fam}_matrix{'_' + tag if tag else ''}.json")
    base = json.load(open(os.path.join(HERE, "results", f"{fam}_matrix.json")))
    m = json.load(open(path))
    margins = m["margins"]
    nt = base["n_test"]; n = nt + base["n_fresh"]
    allk, testk, freshk = list(range(n)), list(range(nt)), list(range(nt, n))
    A = acc_matrix(margins, allk)
    x, w, v = analysis.solve_zero_sum(A)
    r = {"family": fam, "model": m.get("model", "Qwen/Qwen2.5-0.5B-Instruct"), "n_imitators": A.shape[0],
         "n_detectors": A.shape[1], "titles": n, "matrix": A.round(4).tolist(),
         "matrix_test": acc_matrix(margins, testk).round(4).tolist(),
         "matrix_fresh": acc_matrix(margins, freshk).round(4).tolist(),
         "value": float(v), "value_ci": nash_boot(margins, allk), "pure": analysis.pure_value(A),
         "exploit": analysis.exploitability(A, x, w), "imitator_mix": x.round(4).tolist(),
         "detector_mix": w.round(4).tolist(), "runs": {}, "final": {}}
    valid = [i for i, im in enumerate(base["imitators"]) if im["valid"]]
    if valid:
        xv, wv, vv = analysis.solve_zero_sum(A[valid])
        r["valid_only"] = {"imitators": valid, "value": float(vv), "imitator_mix": xv.round(4).tolist(),
                           "detector_mix": wv.round(4).tolist(), "pure": analysis.pure_value(A[valid])}
    lens = np.array([im["mean_len"] for im in base["imitators"]]); means = A.mean(axis=1)
    rk = lambda v: np.argsort(np.argsort(v)).astype(float)
    r["len_vs_detector_acc_spearman"] = float(np.corrcoef(rk(lens), rk(means))[0, 1])
    for p in PROPOSERS:
        sub, ii, jj = run_matrix(base, A, p)
        found, total = analysis.reversals(sub, EPS)
        r["runs"][p] = {"matrix": sub.round(3).tolist(), "reversals": len(found), "checked": total,
                        "reversals_eps0": len(analysis.reversals(sub, 0.0)[0]),
                        "reversal_quads": found, "i": ii, "j": jj}
        fi, fj = ii[-1], jj[-1]
        r["final"][p] = {"vs_own_last_detector": float(A[fi, fj]), "mean_vs_all_detectors": float(A[fi].mean()),
                         "worst_vs_any_detector": float(A[fi].max()),
                         "detector_vs_plain_imitator": float(A[ii[0], fj]),
                         "detector_mean_vs_all_imitators": float(A[:, fj].mean())}
    r["detectors"] = [{"origin": d["origin"], "mean_vs_all": float(A[:, j].mean()), "vs_plain_imitator": float(A[index(base["imitators"], "random", 0), j])}
                      for j, d in enumerate(base["detectors"])]
    r["imitators"] = [{"origin": d["origin"], "mean_vs_all": float(A[i].mean()), "mean_len": d["mean_len"],
                       "copy4": d["copy4"], "valid": d["valid"], "distinct2": d["distinct2"]}
                      for i, d in enumerate(base["imitators"])]
    r["ref_len"] = base["ref_len"]; r["human_distinct2"] = base["human_distinct2"]
    return r


def fmt_matrix(A, rows, cols):
    out = ["        " + " ".join(f"{c:>6}" for c in cols)]
    for lab, row in zip(rows, A):
        out.append(f"{lab:>7} " + " ".join(f"{v:6.2f}" for v in row))
    return "\n".join(out)


def svg(reports):
    cell, pad = 34, 16
    parts, y = [], 0
    width = 0
    for r in reports:
        A = np.array(r["matrix"]); m, n = A.shape
        parts.append(f'<text x="{pad}" y="{y + 18}" font-size="13" font-weight="bold">{r["family"]}: detector paired accuracy, '
                     f'imitator prompt (row) vs detector prompt (column), {r["model"].split("/")[-1]}</text>')
        y += 26
        for i in range(m):
            for j in range(n):
                v = A[i, j]; t = max(0.0, min(1.0, v))
                g = int(255 - 150 * abs(t - 0.5) * 2)
                col = f"rgb({g},{g},255)" if t >= 0.5 else f"rgb(255,{g},{g})"
                parts.append(f'<rect x="{pad + 30 + j * cell}" y="{y + i * cell}" width="{cell - 2}" height="{cell - 2}" fill="{col}" stroke="#888"/>')
                parts.append(f'<text x="{pad + 30 + j * cell + cell / 2 - 1}" y="{y + i * cell + cell / 2 + 3}" font-size="10" text-anchor="middle">{v:.2f}</text>')
            parts.append(f'<text x="{pad}" y="{y + i * cell + cell / 2 + 3}" font-size="10">I{i}</text>')
        for j in range(n):
            parts.append(f'<text x="{pad + 30 + j * cell + cell / 2 - 1}" y="{y + m * cell + 12}" font-size="10" text-anchor="middle">D{j}</text>')
        width = max(width, pad * 2 + 30 + n * cell)
        y += m * cell + 34
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{y}" viewBox="0 0 {width} {y}" font-family="sans-serif">'
            f'<rect width="100%" height="100%" fill="white"/>' + "".join(parts) + "</svg>")


def regeneration_check(fam):
    """Do the regenerated texts match the first three stored samples of every mimic-loop snapshot?"""
    m = json.load(open(os.path.join(HERE, "results", f"{fam}_matrix.json")))
    same = tot = 0
    for p in PROPOSERS:
        d = json.load(open(os.path.join(HERE, "..", "mimic-loop", "results", f"{fam}_{p}_s0.json")))
        for row in d["rounds"]:
            im = m["imitators"][index(m["imitators"], p, row["round"])]
            tot += 1; same += im["texts"][:3] == row["sample"]
    return same, tot


def main():
    reports = [family_report(f) for f in FAMILIES]
    for r in reports:
        r["regenerated_samples_match"] = regeneration_check(r["family"])
    extra = []
    for f in FAMILIES:
        if os.path.exists(os.path.join(HERE, "results", f"{f}_matrix_q15.json")):
            extra.append(family_report(f, "q15"))
    lines = ["mimic-crossplay: every imitator prompt against every detector prompt of the mimic-loop runs",
             "Detector paired accuracy over 48 titles (24 loop-test + 24 fresh); 0.50 = chance; lower = better imitator."]
    for r in reports + extra:
        lines += ["", f"== {r['family']}  detector model {r['model']}  ({r['n_imitators']} imitator prompts x {r['n_detectors']} detector prompts)",
                  f"Nash value (detector accuracy) {r['value']:.3f}  95% title-bootstrap [{r['value_ci'][0]:.3f}, {r['value_ci'][1]:.3f}]",
                  f"pure max-min (detector guarantees) {r['pure']['detector_maxmin']:.3f}   pure min-max (imitator guarantees) {r['pure']['imitator_minmax']:.3f}",
                  f"exploitability at the computed mixture: imitator {r['exploit']['imitator_gain']:.1e}, detector {r['exploit']['detector_gain']:.1e}"]
        A = np.array(r["matrix"])
        lines.append(fmt_matrix(A, [f"I{i}" for i in range(A.shape[0])], [f"D{j}" for j in range(A.shape[1])]))
        if "valid_only" in r:
            vo = r["valid_only"]
            lines.append(f"Game restricted to imitators that pass the length/copy check ({['I%d' % i for i in vo['imitators']]}): Nash value {vo['value']:.3f}, "
                         f"pure max-min {vo['pure']['detector_maxmin']:.3f}, min-max {vo['pure']['imitator_minmax']:.3f}")
        lines.append(f"Spearman correlation, imitator mean text length vs mean detector accuracy: {r['len_vs_detector_acc_spearman']:.2f}")
        if "regenerated_samples_match" in r:
            lines.append("Regenerated texts equal the mimic-loop's stored samples in %d of %d snapshots" % tuple(r["regenerated_samples_match"]))
        lines.append("Nash imitator mixture: " + ", ".join(f"I{i}={p:.2f}" for i, p in enumerate(r["imitator_mix"]) if p > 0.005))
        lines.append("Nash detector mixture: " + ", ".join(f"D{j}={p:.2f}" for j, p in enumerate(r["detector_mix"]) if p > 0.005))
        if r in extra:
            continue
        base = json.load(open(os.path.join(HERE, "results", f"{r['family']}_matrix.json")))
        lines.append("Imitators (I): origin(proposer,round) | mean detector acc | mean len (ref %.0f) | copy4 | valid | distinct2 (human %.2f)" % (r["ref_len"], r["human_distinct2"]))
        for i, d in enumerate(r["imitators"]):
            lines.append(f"  I{i} {d['origin']} {d['mean_vs_all']:.2f} {d['mean_len']:.0f} {d['copy4']:.3f} {d['valid']} {d['distinct2']:.2f}")
        lines.append("Detectors (D): origin | mean acc vs all imitators | acc vs plain imitator")
        for j, d in enumerate(r["detectors"]):
            lines.append(f"  D{j} {d['origin']} {d['mean_vs_all']:.2f} {d['vs_plain_imitator']:.2f}")
        for p in PROPOSERS:
            ru = r["runs"][p]; f = r["final"][p]
            lines += ["", f"-- {r['family']} / {p}: rows = imitator rounds 0-3, columns = detector rounds 0-3 (prompts I{ru['i']} x D{ru['j']})",
                      fmt_matrix(np.array(ru["matrix"]), [f"r{k}" for k in range(4)], [f"r{k}" for k in range(4)]),
                      f"reversals: {ru['reversals']} of {ru['checked']} quadruples at eps {EPS}; {ru['reversals_eps0']} at eps 0",
                      f"final imitator: vs its own last detector {f['vs_own_last_detector']:.2f}, mean over all detectors {f['mean_vs_all_detectors']:.2f}, worst {f['worst_vs_any_detector']:.2f}; "
                      f"final detector: vs plain imitator {f['detector_vs_plain_imitator']:.2f}, mean over all imitators {f['detector_mean_vs_all_imitators']:.2f}"]
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"reports": reports, "larger_detector": extra, "eps": EPS}, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    open(os.path.join(HERE, "results", "figure.svg"), "w").write(svg(reports))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
