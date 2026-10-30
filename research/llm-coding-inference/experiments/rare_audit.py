"""H2 and H4: rare categories and audit design on real text (GoEmotions part 1, Demszky et al. 2020).
Truth = a majority of raters marked the emotion. Coder = per-category naive-Bayes score (a stand-in,
not an LLM). Corpus = the 70% test part, so the true prevalence is known. Writes rare_audit.txt.

    python3 experiments/rare_audit.py [reps]   # downloads ~/.cache/qual-real/goemotions_{1,2,3}.csv on first use
"""
import csv
import math
import random
import statistics
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0]))
from llmci import estimators as E  # noqa: E402

CSVS = [Path.home() / ".cache" / "qual-real" / f"goemotions_{i}.csv" for i in (1, 2, 3)]
URL = "https://storage.googleapis.com/gresearch/goemotions/data/full_dataset/goemotions_{}.csv"


def ensure_csvs():
    """Download any missing GoEmotions part to the cache (same URL as qual-real/experiments/run.py)."""
    for i, p in enumerate(CSVS, 1):
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(URL.format(i), p)
    return CSVS
CATS = ("grief", "pride", "relief", "embarrassment", "nervousness", "remorse", "disgust", "fear", "sadness")
N_AUDIT, SEED, SPLIT_SEED, TRAIN_SHARE = 200, 20261024, 2026, 0.3
REPS = int(sys.argv[1]) if len(sys.argv) > 1 else 1000


def load():
    votes, texts, unclear = defaultdict(lambda: defaultdict(int)), {}, set()
    cnt = Counter()
    for path in ensure_csvs():
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                i = row["id"]
                texts[i] = row["text"]
                cnt[i] += 1
                for c in CATS:
                    votes[i][c] += row[c] == "1"
                if row["example_very_unclear"] == "True":
                    unclear.add(i)
    ids = sorted(i for i in texts if cnt[i] >= 3 and i not in unclear)
    return [(texts[i], {c: int(votes[i][c] * 2 > cnt[i]) for c in CATS}) for i in ids]


def toks(t):
    return set(t.lower().split())


class NB:
    """Class-weighted logistic regression on word presence, trained by seeded SGD (name kept for the
    score() interface; it is not naive Bayes). Weight on positives = min(30, negatives/positives)."""
    EPOCHS, LR, L2 = 6, 0.1, 1e-5

    def fit(self, docs, y):
        df = Counter(w for d in docs for w in d)
        self.w, self.b = defaultdict(float), 0.0
        keep = {w for w, c in df.items() if c >= 3}
        npos = max(1, sum(y))
        cw = min(30.0, (len(y) - npos) / npos)
        rng = random.Random(7)
        order = list(range(len(y)))
        for ep in range(self.EPOCHS):
            rng.shuffle(order)
            for i in order:
                ws = [w for w in docs[i] if w in keep]
                z = self.b + sum(self.w[w] for w in ws)
                p = 1 / (1 + math.exp(-max(-30, min(30, z))))
                g = (p - y[i]) * (cw if y[i] else 1.0) * self.LR / (1 + ep)
                self.b -= g
                for w in ws:
                    self.w[w] -= g + self.L2 * self.w[w]
        return self

    def score(self, d):
        return self.b + sum(self.w.get(w, 0.0) for w in d)


def wilson(k, n, z=E.Z95):
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return c - h, c + h


def main():
    rows = load()
    rng = random.Random(SPLIT_SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    tr_docs, te_docs = [toks(t) for t, _ in train], [toks(t) for t, _ in test]
    n = len(test)
    out = [f"GoEmotions parts 1-3: {len(rows)} examples after filters, corpus (test) {n}, train {len(train)}; "
           f"audit n={N_AUDIT}, {REPS} draws per cell, seed {SEED}",
           "columns: category prevalence design estimator coverage mean_width(points) width_vs_human_uniform bias(points)", ""]
    for cat in CATS:
        ytr = [l[cat] for _, l in train]
        human = [l[cat] for _, l in test]
        truth = sum(human) / n
        nb = NB().fit(tr_docs, ytr)
        s_tr = sorted(((nb.score(d), v) for d, v in zip(tr_docs, ytr)), key=lambda x: x[0])
        prev_tr = sum(ytr) / len(ytr)
        k = max(1, round(3 * prev_tr * len(s_tr)))
        thr = s_tr[-k][0]
        # calibration: decile bins of the train score -> positive rate
        edges = [s_tr[int(len(s_tr) * j / 10)][0] for j in range(1, 10)]

        def binof(s, edges=edges):
            return sum(s >= e for e in edges)
        rate = [0.0] * 10
        cntb = [0] * 10
        for s, v in s_tr:
            b = binof(s)
            cntb[b] += 1
            rate[b] += v
        rate = [(rate[b] + 0.5) / (cntb[b] + 1) for b in range(10)]
        sc = [nb.score(d) for d in te_docs]
        f = [int(s >= thr) for s in sc]
        w = [max(0.02, math.sqrt(rate[binof(s)] * (1 - rate[binof(s)]))) for s in sc]
        # Poisson inclusion probabilities with expected audit size N_AUDIT (iterate the cap at 1)
        scale = N_AUDIT / sum(w)
        for _ in range(20):
            pi = [min(1.0, scale * x) for x in w]
            scale *= N_AUDIT / sum(pi)
        pi = [min(1.0, scale * x) for x in w]
        pos = [i for i in range(n) if f[i]]
        neg = [i for i in range(n) if not f[i]]
        tp = sum(human[i] for i in pos)
        out.append(f"# {cat}: true prevalence {100 * truth:.2f}% ({sum(human)} of {n}); coder-positives {len(pos)} "
                   f"(precision {tp / max(1, len(pos)):.2f}, recall {tp / max(1, sum(human)):.2f}); threshold {thr:.2f}")
        rr = random.Random(SEED)
        acc = defaultdict(lambda: {"hit": 0, "w": [], "b": []})

        def rec(name, lo, hi, val):
            a = acc[name]
            a["hit"] += lo <= truth <= hi
            a["w"].append(hi - lo)
            a["b"].append(val - truth)

        for _ in range(REPS):
            idx = rr.sample(range(n), N_AUDIT)
            aset = set(idx)
            y, fa = [human[i] for i in idx], [f[i] for i in idx]
            fu = [f[i] for i in range(n) if i not in aset]
            e = E.human_only(y)
            rec("U human (normal)", *E.interval(e), e.value)
            lo, hi = wilson(sum(y), len(y))
            rec("U human (Wilson)", lo, hi, e.value)
            e = E.ppi_pp(y, fa, fu)
            rec("U PPI++", *E.interval(e), e.value)
            a1, a0 = rr.sample(pos, min(60, len(pos))), rr.sample(neg, N_AUDIT - min(60, len(pos)))
            strata = [(len(g), [f[i] for i in g], [human[i] for i in a], [f[i] for i in a]) for g, a in ((pos, a1), (neg, a0))]
            e = E.stratified_ppi(strata)
            rec("L strat PPI", *E.interval(e), e.value)
            e = E.stratified_human([(len(g), [human[i] for i in a]) for g, a in ((pos, a1), (neg, a0))])
            rec("L strat human", *E.interval(e), e.value)
            aud = [i for i in range(n) if rr.random() < pi[i]]
            if len(aud) >= 2:
                e = E.ipw_audit(f, aud, {i: human[i] for i in aud}, pi)
                rec("Q uncertainty IPW", *E.interval(e), e.value)
                yd = {i: human[i] for i in aud}
                rec("Q IPW Wilson", *E.ipw_audit_wilson(f, aud, yd, pi), e.value)
                rec("Q IPW bootstrap", *E.ipw_audit_bootstrap(f, aud, yd, pi, rr), e.value)
        base = statistics.fmean(acc["U human (normal)"]["w"])
        for name, a in acc.items():
            m = statistics.fmean(a["w"])
            out.append(f"{cat} | {100 * truth:.2f}% | {name} | {a['hit'] / REPS:.3f} | {100 * m:.2f} | {m / max(base, 1e-12):.2f} | "
                       f"{100 * statistics.fmean(a['b']):+.3f}")
        print("\n".join(out[-(len(acc) + 1):]), flush=True)
    (HERE / "rare_audit.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
