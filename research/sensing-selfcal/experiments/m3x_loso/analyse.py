"""Milestone 3x: does milestone 3w's update rule survive being chosen without the sequence it is scored on?
Scores H254-H259 (LOG.md, milestone 3x planned). Leave-one-sequence-out: on two TUM sequences pick 3w's
minimax rule, score it on the third. Re-uses milestone 3w's rules and scoring and milestone 3v's blocks
(milestone 3s's real solves, 3u's history-floored pool); nothing is re-solved.
Writes summary.json and loso.png.
Run (from research/sensing-selfcal): python3 experiments/m3x_loso/analyse.py
"""
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")


def _load(name, path):
    s = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


m3w = _load("m3w_an", os.path.join(EXP, "m3w_update", "analyse.py"))
m3v = m3w.m3v
KS, MODELS, DELTAS, RULES, POOL = m3w.KS, m3w.MODELS, m3w.DELTAS, m3w.RULES, m3w.POOL


def curves(bl, rule_of, ref="board", pool=POOL):
    """Median and 95th-percentile |e| (%) over the delta grid when block i is updated by rule_of[i]; also the
    never and always medians on the same blocks. Averaged over +delta and -delta as in milestone 3w."""
    R = np.array([b["ref"][ref] for b in bl])
    x = np.array([b[pool][0] for b in bl]); sd = np.array([b[pool][1] for b in bl])
    rule_of = np.asarray(rule_of)
    med, p95, nev, alw = [], [], [], []
    for dl in DELTAS:
        a = ([], [], [], [])
        for sgn in ((1,) if dl == 0 else (1, -1)):
            held = R * (1 + sgn * dl / 100)
            v = np.empty_like(x)
            for r in set(rule_of.tolist()):
                k = rule_of == r
                v[k] = m3w.update(r, x[k], sd[k], held[k])
            e = np.abs(v - R) / R * 100
            a[0].append(np.median(e)); a[1].append(np.percentile(e, 95))
            a[2].append(np.median(np.abs(held - R) / R * 100)); a[3].append(np.median(np.abs(x - R) / R * 100))
        for lst, q in zip((med, p95, nev, alw), a):
            lst.append(float(np.mean(q)))
    best = np.minimum(nev, alw)
    reg = np.array(med) - best
    return {"med": med, "p95": p95, "worst_regret": float(reg.max()), "argworst_delta": DELTAS[int(reg.argmax())],
            "mean_regret": float(reg.mean()), "worst_p95": float(max(p95))}


def by_seq(R, S, model, k, refs):
    out = {}
    for s in sorted({r["seq"] for r in S}):
        rs = sorted([r for r in S if r["seq"] == s], key=lambda r: r["rank"])
        ur = sorted([r for r in R if r["unit"] == rs[0]["unit"]], key=lambda r: r["rank"])
        out[s] = m3v.blocks(rs, ur, model, k, refs)
    return out


def loso(bs, ref="board"):
    """bs: {seq: blocks}. Per fold the rule chosen on the other sequences and every rule's held-out regret;
    pooled out-of-sample and in-sample scores on the union."""
    seqs = sorted(bs)
    folds, pooled_bl, pooled_rule = {}, [], []
    for s in seqs:
        train = [b for t in seqs if t != s for b in bs[t]]
        tr = m3w.score(train, ref)
        chosen = min(RULES, key=lambda r: tr["rules"][r]["worst_regret"])  # ties: 3w's rule order
        held = {r: curves(bs[s], [r] * len(bs[s]), ref) for r in RULES}
        folds[s] = {"n_train": len(train), "n_test": len(bs[s]), "chosen": chosen,
                    "train_worst_regret": tr["rules"][chosen]["worst_regret"],
                    "test_worst_regret": {r: held[r]["worst_regret"] for r in RULES},
                    "test_argworst": {r: held[r]["argworst_delta"] for r in RULES},
                    "test_worst_p95": {r: held[r]["worst_p95"] for r in RULES}}
        pooled_bl += bs[s]; pooled_rule += [chosen] * len(bs[s])
    allin = m3w.score(pooled_bl, ref)
    oos = curves(pooled_bl, pooled_rule, ref)
    return {"folds": folds, "n": len(pooled_bl),
            "oos": {k: oos[k] for k in ("worst_regret", "argworst_delta", "mean_regret", "worst_p95", "med", "p95")},
            "in_sample_minimax": allin["minimax"],
            "in_sample_worst_regret": {r: allin["rules"][r]["worst_regret"] for r in RULES},
            "in_sample_worst_p95": {r: allin["rules"][r]["worst_p95"] for r in RULES}}


def analyse(R, S, refs):
    return {m: {k: {ref: loso(by_seq(R, S, m, k, refs), ref) for ref in refs} for k in KS} for m in MODELS}


def hypotheses(res):
    q5, q3 = res["est_c"][5]["board"], res["est_c"][3]["board"]
    f5 = q5["folds"]
    h = {}
    ch = {s: f["chosen"] for s, f in f5.items()}
    h["H254"] = {"chosen": ch, "holds": all(c == "gate0.5" for c in ch.values())}
    beat = {s: (f["test_worst_regret"][f["chosen"]], f["test_worst_regret"]["always"]) for s, f in f5.items()}
    h["H255"] = {"chosen_vs_always": beat, "holds": sum(a <= b for a, b in beat.values()) >= 2}
    g2 = {s: (f["test_worst_regret"][f["chosen"]], f["test_worst_regret"]["gate2.0"]) for s, f in f5.items()}
    h["H256"] = {"chosen_vs_gate2": g2, "holds": all(a < b for a, b in g2.values())}
    o, a = q5["oos"]["worst_regret"], q5["in_sample_worst_regret"]["always"]
    h["H257"] = {"oos_worst_regret": o, "always": a, "holds": o <= 0.84 and o < a}
    o3, a3 = q3["oos"]["worst_regret"], q3["in_sample_worst_regret"]["always"]
    h["H258"] = {"oos_worst_regret": o3, "always": a3, "holds": o3 < a3}
    x = f5["fr3_stf"]
    h["H259"] = {"chosen": x["chosen"], "fr3_worst_regret": x["test_worst_regret"][x["chosen"]],
                 "holds": x["test_worst_regret"][x["chosen"]] <= 1.0}
    return h


def main():
    m3s = _load("m3s_an", os.path.join(EXP, "m3s_causal", "analyse.py"))
    R, _ = m3s.rows()
    S = [r for r in R if r["scored"]]
    res = analyse(R, S, m3s.REFS)
    hyp = hypotheses(res)
    out = {"rules": {"K": KS, "deltas_pct": DELTAS, "rules": RULES, "pool": POOL, "windows": len(S), "counted": len(R)},
           "hypotheses": hyp, "scores": res}
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for k, v in hyp.items():
        print(k, json.dumps(v))
    for m in MODELS:
        for k in KS:
            for ref in m3s.REFS:
                q = res[m][k][ref]
                fs = " ".join(f"{s}:{f['chosen']}->{f['test_worst_regret'][f['chosen']]:.2f}"
                              f"(alw {f['test_worst_regret']['always']:.2f}, g2 {f['test_worst_regret']['gate2.0']:.2f})"
                              for s, f in q["folds"].items())
                ins = q["in_sample_minimax"]
                print(f"{m:6s} K={k} {ref:5s} n={q['n']:2d} oos {q['oos']['worst_regret']:.2f}@{q['oos']['argworst_delta']}"
                      f" p95 {q['oos']['worst_p95']:.1f} | in-sample {ins} {q['in_sample_worst_regret'][ins]:.2f}"
                      f" always {q['in_sample_worst_regret']['always']:.2f} | {fs}")
    figure(res)


def figure(res):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib missing: loso.png not drawn")
        return
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    for m, col in (("est", "#7f7f7f"), ("est_c", "#1f77b4"), ("est_cr", "#2ca02c")):
        ins = [res[m][k]["board"]["in_sample_worst_regret"][res[m][k]["board"]["in_sample_minimax"]] for k in KS]
        oos = [res[m][k]["board"]["oos"]["worst_regret"] for k in KS]
        alw = [res[m][k]["board"]["in_sample_worst_regret"]["always"] for k in KS]
        axes[0].plot(KS, ins, "o:", color=col, label=f"{m} in-sample minimax")
        axes[0].plot(KS, oos, "o-", color=col, label=f"{m} leave-one-sequence-out")
        axes[0].plot(KS, alw, "x--", color=col, alpha=0.5, label=f"{m} always adopt")
    axes[0].set_xlabel("pooled windows K"); axes[0].set_ylabel("worst regret over staleness (points)")
    axes[0].set_title("chosen rule: in-sample vs held-out sequence", fontsize=9)
    axes[0].legend(fontsize=6)
    q = res["est_c"][5]["board"]["folds"]
    seqs = list(q)
    show = ("always", "gate0.5", "gate1.0", "shrink", "gate2.0")
    w = 0.15
    for i, r in enumerate(show):
        axes[1].bar(np.arange(len(seqs)) + (i - 2) * w, [q[s]["test_worst_regret"][r] for s in seqs], w, label=r)
    axes[1].set_xticks(range(len(seqs)))
    axes[1].set_xticklabels([f"{s}\n(chose {q[s]['chosen']})" for s in seqs], fontsize=7)
    axes[1].set_ylabel("held-out worst regret (points)")
    axes[1].set_title("est_c, five windows: each held-out sequence", fontsize=9)
    axes[1].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "loso.png"), dpi=130)


if __name__ == "__main__":
    main()
