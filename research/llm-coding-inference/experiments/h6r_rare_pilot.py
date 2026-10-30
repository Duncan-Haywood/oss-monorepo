"""Milestone 6r: the pilot-estimated audit-size rule (6q) on a rare category, GoEmotions subreddit groups.
Target = a majority of raters marked the emotion (fear, sadness). Coder = pooled naive Bayes, cut so coder-positives are
about 3x the train prevalence. Strata = the four groups. Per target half-width and pilot size: an oracle plan (S2 from the
whole corpus) and the pilot version (random pilot -> per-group lambda, S2 -> neyman_total -> fresh audit). Writes h6r_rare_pilot.txt.

    python3 experiments/h6r_rare_pilot.py     # downloads ~/.cache/qual-real/goemotions_{1,2,3}.csv on first use; a few minutes
"""
import csv
import math
import random
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift_reddit as R  # noqa: E402
import rare_audit as ra  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS, SEED, Z = 500, 20261029, E.Z95
CATS = ("fear", "sadness")
TARGETS = (0.01, 0.005)
PILOTS = (400, 1500)
GROUPS = list(R.GROUPS)


def load(cat):
    pos, texts, sub, cnt, unclear = defaultdict(int), {}, {}, Counter(), set()
    for p in ra.ensure_csvs():
        with open(p, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["subreddit"] not in R.SUB2G:
                    continue
                i = row["id"]
                texts[i], sub[i] = row["text"], R.SUB2G[row["subreddit"]]
                cnt[i] += 1
                pos[i] += row[cat] == "1"
                if row["example_very_unclear"] == "True":
                    unclear.add(i)
    ids = sorted(i for i in texts if cnt[i] >= 3 and i not in unclear)
    return [(ra.toks(texts[i]), sub[i], int(pos[i] * 2 > cnt[i])) for i in ids]


def coder(train, test):
    m = ra.NB().fit([t[0] for t in train], [t[2] for t in train])
    sc = sorted(m.score(t[0]) for t in train)
    prev = sum(t[2] for t in train) / len(train)
    thr = sc[int(len(sc) * (1 - min(0.5, 3 * prev)))]
    return [int(m.score(t[0]) > thr) for t in test]


def allocate(n, sizes, s2, avail):
    sw = [math.sqrt(v) * N for v, N in zip(s2, sizes)]
    tot = sum(sw)
    return [min(a, max(2, round(n * w / tot))) for w, a in zip(sw, avail)]


def run_audit(rr, sets, f, human, truth, alloc, lam, exclude=()):
    strata = []
    for k, a in zip(GROUPS, alloc):
        pool = [i for i in sets[k] if i not in exclude]
        idx = rr.sample(pool, a)
        strata.append((len(sets[k]), [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
    e = E.stratified_ppi_tuned(strata, lam)
    return Z * e.se, E.covers(e, truth)


def main():
    out = []
    for cat in CATS:
        rows = load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        human, n = [t[2] for t in test], len(test)
        f = coder(train, test)
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in GROUPS}
        sizes = [len(sets[g]) for g in GROUPS]
        truth = sum(human) / n
        ls, s2o = zip(*(E.stratum_lambda_s2([human[i] for i in sets[g]], [f[i] for i in sets[g]]) for g in GROUPS))
        out += [f"{cat}: corpus {n}, prevalence {truth:.4f}, positives by group " + ", ".join(f"{g} {sum(human[i] for i in sets[g])}" for g in GROUPS)
                + f"; coder positive rate {sum(f) / n:.4f}, agreement {sum(a == b for a, b in zip(f, human)) / n:.4f}",
                f"{cat}: oracle lambda " + ", ".join(f"{x:.2f}" for x in ls) + "; S2 " + ", ".join(f"{x:.5f}" for x in s2o)]
        print("\n".join(out[-2:]), flush=True)
        out.append("category | target pts | plan | planned n mean | sd/oracle n | mean half | share half > 1.25 target | coverage")
        for tgt in TARGETS:
            o = math.ceil(E.neyman_total(sizes, list(s2o), tgt))
            al = allocate(o, sizes, s2o, sizes)
            rr = random.Random(SEED)
            res = [run_audit(rr, sets, f, human, truth, al, list(ls)) for _ in range(REPS)]
            out.append(f"{cat} | {100 * tgt:.1f} | oracle (lam fixed) | {o} | 0 | {100 * statistics.fmean(r[0] for r in res):.3f} | "
                       f"{sum(r[0] > 1.25 * tgt for r in res) / REPS:.3f} | {sum(r[1] for r in res) / REPS:.3f}")
            print(out[-1], flush=True)
            for pn in PILOTS:
                rr = random.Random(SEED + pn)
                res, planned = [], []
                for _ in range(REPS):
                    pil = set(rr.sample(range(n), pn))
                    s2h = []
                    for k in GROUPS:
                        ids = [i for i in sets[k] if i in pil]
                        ya, fp = [human[i] for i in ids], [f[i] for i in ids]
                        vf = E._var([f[i] for i in sets[k]])
                        lam = 0.0 if vf == 0 or len(ids) < 2 else min(1.0, max(0.0, E._cov(ya, fp) / vf))
                        s2h.append(max(1e-4, E._var([a - lam * b for a, b in zip(ya, fp)]) if len(ids) > 1 else 1e-4))
                    nn = math.ceil(E.neyman_total(sizes, s2h, tgt))
                    avail = [len([i for i in sets[k] if i not in pil]) for k in GROUPS]
                    al = allocate(nn, sizes, s2h, avail)
                    planned.append(sum(al))
                    res.append(run_audit(rr, sets, f, human, truth, al, None, exclude=pil))
                out.append(f"{cat} | {100 * tgt:.1f} | pilot {pn} | {statistics.fmean(planned):.0f} (oracle {o}) | {statistics.pstdev(planned) / o:.3f} | "
                           f"{100 * statistics.fmean(r[0] for r in res):.3f} | {sum(r[0] > 1.25 * tgt for r in res) / REPS:.3f} | {sum(r[1] for r in res) / REPS:.3f}")
                print(out[-1], flush=True)
        out.append("")
    (HERE / "h6r_rare_pilot.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
