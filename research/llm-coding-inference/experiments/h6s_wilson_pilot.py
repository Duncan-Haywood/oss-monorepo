"""Milestone 6s: three pilot S2 rules for the rare-category audit-size rule of 6r (GoEmotions fear, sadness).
A plug-in (6r), B Wilson-upper human-only S2, C shrinkage of the group S2 towards the pooled pilot S2. Writes h6s_wilson_pilot.txt.

    python3 experiments/h6s_wilson_pilot.py     # downloads ~/.cache/qual-real/goemotions_{1,2,3}.csv on first use; a few minutes
"""
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift_reddit as R  # noqa: E402
import h6r_rare_pilot as H  # noqa: E402
from llmci import estimators as E  # noqa: E402

SEED, REPS, K_SHRINK = 20261030, H.REPS, 30
FLOOR = 1e-4


def wilson_upper(x, n, z=E.Z95):
    if n == 0:
        return 0.5
    p = x / n
    c = (p + z * z / (2 * n) + z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n)
    return min(0.5, c)


def group_stats(sets, human, f, pil, k):
    ids = [i for i in sets[k] if i in pil]
    ya, fp = [human[i] for i in ids], [f[i] for i in ids]
    vf = E._var([f[i] for i in sets[k]])
    lam = 0.0 if vf == 0 or len(ids) < 2 else min(1.0, max(0.0, E._cov(ya, fp) / vf))
    s2 = max(FLOOR, E._var([a - lam * b for a, b in zip(ya, fp)])) if len(ids) > 1 else FLOOR
    return ids, ya, s2


def pilot_s2(rule, sets, human, f, pil):
    st = [group_stats(sets, human, f, pil, k) for k in H.GROUPS]
    if rule == "A plug-in":
        return [s[2] for s in st]
    if rule == "B wilson":
        out = []
        for ids, ya, _ in st:
            p = wilson_upper(sum(ya), len(ids))
            out.append(max(FLOOR, p * (1 - p)))
        return out
    pool = [i for i in pil if any(i in sets[k] for k in H.GROUPS)]
    py = [human[i] for i in pool]
    pool_s2 = max(FLOOR, E._var(py))
    return [max(FLOOR, (len(s[0]) * s[2] + K_SHRINK * pool_s2) / (len(s[0]) + K_SHRINK)) for s in st]


def main():
    out = []
    for cat in H.CATS:
        rows = H.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        human, n = [t[2] for t in test], len(test)
        f = H.coder(train, test)
        sets = {g: [i for i in range(n) if test[i][1] == g] for g in H.GROUPS}
        sizes = [len(sets[g]) for g in H.GROUPS]
        truth = sum(human) / n
        s2o = [E.stratum_lambda_s2([human[i] for i in sets[g]], [f[i] for i in sets[g]])[1] for g in H.GROUPS]
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f}")
        out.append("category | target pts | pilot | rule | planned n mean (x oracle) | sd/oracle n | mean half | share half > 1.25 target | coverage")
        for tgt in H.TARGETS:
            o = math.ceil(E.neyman_total(sizes, s2o, tgt))
            for pn in H.PILOTS:
                for rule in ("A plug-in", "B wilson", "C shrink"):
                    rr = random.Random(SEED + pn)
                    res, planned = [], []
                    for _ in range(REPS):
                        pil = set(rr.sample(range(n), pn))
                        s2h = pilot_s2(rule, sets, human, f, pil)
                        nn = math.ceil(E.neyman_total(sizes, s2h, tgt))
                        avail = [len([i for i in sets[k] if i not in pil]) for k in H.GROUPS]
                        al = H.allocate(nn, sizes, s2h, avail)
                        planned.append(sum(al))
                        res.append(H.run_audit(rr, sets, f, human, truth, al, None, exclude=pil))
                    m = statistics.fmean(planned)
                    out.append(f"{cat} | {100 * tgt:.1f} | {pn} | {rule} | {m:.0f} ({m / o:.2f}x of {o}) | {statistics.pstdev(planned) / o:.3f} | "
                               f"{100 * statistics.fmean(r[0] for r in res):.3f} | {sum(r[0] > 1.25 * tgt for r in res) / REPS:.3f} | {sum(r[1] for r in res) / REPS:.3f}")
                    print(out[-1], flush=True)
        out.append("")
    (HERE / "h6s_wilson_pilot.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
