"""Milestone 24: does the rung bias of milestone 1 survive a second corner (SKY130 HD ss_100C_1v60 against tt_025C_1v80)?
Reads rung_bias/results.jsonl (tt) and corner_ss/results.jsonl (ss); pairs points by (design, clock tag, pass sequence).
Runs no flow. Writes results.txt and summary.json. Usage: python3 compare.py"""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402

M = statistics.median


def load(p):
    d = {}
    for l in p.read_text().splitlines():
        r = json.loads(l)
        if r["status"] == "ok":
            d[(r["tag"], r["design"], tuple(r["seq"]))] = r
    return d


def rank(v):
    o = sorted(range(len(v)), key=lambda i: v[i])
    rk = [0.0] * len(v)
    i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
            j += 1
        for k in range(i, j + 1):
            rk[o[k]] = (i + j) / 2
        i = j + 1
    return rk


def spearman(x, y):
    a, b = rank(x), rank(y)
    ma, mb = statistics.mean(a), statistics.mean(b)
    num = sum((p - ma) * (q - mb) for p, q in zip(a, b))
    den = (sum((p - ma) ** 2 for p in a) * sum((q - mb) ** 2 for q in b)) ** 0.5
    return num / den if den else None


tt, ss = load(HERE.parent / "rung_bias" / "results.jsonl"), load(HERE / "results.jsonl")
out, summ = [], {}
out.append("design | clock | n paired | spearman r4 tt/ss | tau(r2,r4) tt | tau(r2,r4) ss | tau(r1,r4) tt | tau(r1,r4) ss | tt-optimum regret under ss % | same argmin | ss r2-pick regret % | tt r2-pick regret %")
for tag in ("tight", "relaxed"):
    for d in flow.DESIGNS:
        keys = [k for k in tt if k[0] == tag and k[1] == d and k in ss]
        if len(keys) < 8:
            continue
        a = [flow.scores(tt[k]) for k in keys]
        b = [flow.scores(ss[k]) for k in keys]
        r4a, r4b = [s["r4"] for s in a], [s["r4"] for s in b]
        sp = spearman(r4a, r4b)
        t2a, t2b = (stats.kendall_tau_b([s["r2"] for s in z], [s["r4"] for s in z]) for z in (a, b))
        t1a, t1b = (stats.kendall_tau_b([s["r1"] for s in z], [s["r4"] for s in z]) for z in (a, b))
        ia = min(range(len(keys)), key=lambda i: r4a[i])
        ib = min(range(len(keys)), key=lambda i: r4b[i])
        transfer = (r4b[ia] / r4b[ib] - 1) * 100
        rg_b = stats.pick_regret([s["r2"] for s in b], r4b) * 100
        rg_a = stats.pick_regret([s["r2"] for s in a], r4a) * 100
        summ[f"{tag}:{d}"] = dict(n=len(keys), spearman=sp, tau2_tt=t2a, tau2_ss=t2b, tau1_tt=t1a, tau1_ss=t1b,
                                   transfer_regret_pct=transfer, same_argmin=ia == ib, r2pick_ss=rg_b, r2pick_tt=rg_a)
        f = lambda v: "n/a" if v is None else f"{v:.2f}"
        out.append(f"{d} | {tag} | {len(keys)} | {f(sp)} | {f(t2a)} | {f(t2b)} | {f(t1a)} | {f(t1b)} | {transfer:.1f} | {'Y' if ia == ib else 'n'} | {rg_b:.1f} | {rg_a:.1f}")
out.append("")
S = list(summ.values())
def col(k):
    return [s[k] for s in S if s[k] is not None]
out.append(f"cells {len(S)}; median spearman r4 tt/ss {M(col('spearman')):.2f} (min {min(col('spearman')):.2f}); same argmin in {sum(s['same_argmin'] for s in S)} of {len(S)}")
out.append(f"median tau(r2,r4): tt {M(col('tau2_tt')):.2f}, ss {M(col('tau2_ss')):.2f}; median |ss - tt| {M([abs(s['tau2_ss'] - s['tau2_tt']) for s in S if s['tau2_ss'] is not None and s['tau2_tt'] is not None]):.2f}")
out.append(f"median tau(r1,r4): tt {M(col('tau1_tt')):.2f}, ss {M(col('tau1_ss')):.2f}")
out.append(f"tt-optimum regret under ss: median {M(col('transfer_regret_pct')):.1f}%, max {max(col('transfer_regret_pct')):.1f}%")
out.append(f"cells where r2-pick regret exceeds 10%: tt {sum(s['r2pick_tt'] > 10 for s in S)}, ss {sum(s['r2pick_ss'] > 10 for s in S)}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summ, indent=1))
print("\n".join(out))
