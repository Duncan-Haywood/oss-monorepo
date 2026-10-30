"""Milestone 6c: sequential audit. Start with p items per stratum, then add batches of B (split by the Neyman
shares from the current variance estimates) until the stratified-PPI half-width is at most 3 points. Same
corpus, split, coders, floor and seed scheme as h6b_pilot.py. Writes h6c_sequential.txt.

    python3 experiments/h6c_sequential.py     # needs the tsv cache that qual-dialect/experiments/run.py fills
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift as G  # noqa: E402
from llmci import estimators as E  # noqa: E402

qd, d = G.qd, G.d
REPS, SEED, Z, TARGET = 1000, 20261027, E.Z95, 0.03
P, FLOOR, CAP, BATCHES = 20, 0.02, 2500, (30, 90)
ORACLE_N = {"lexicon-en": 902, "nb-english": 1083, "nb-in-language": 927}  # from h5_plugin.txt (6a)


def main():
    rows = qd.load()
    rng = random.Random(qd.SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(qd.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    en = G.r.load_examples(qd.fetch(qd.GOEMO_URL, qd.GOEMO))
    nb_en = d.NB().fit([e[1] for e in en], [e[2] for e in en]).match_rate([e[1] for e in en], [e[2] for e in en])
    nb_in = d.NB().fit([t[1] for t in train], [t[2] for t in train]).match_rate([t[1] for t in train], [t[2] for t in train])
    human = [t[2] for t in test]
    coders = {"lexicon-en": [d.lexicon_code(t[1]) for t in test], "nb-english": [nb_en.code(t[1]) for t in test],
              "nb-in-language": [nb_in.code(t[1]) for t in test]}
    sets = {k: sorted(v) for k, v in d.by_language(test).items()}
    langs = list(sets)
    sizes = [len(sets[k]) for k in langs]
    truth = sum(human) / len(test)
    out = [f"NaijaSenti corpus {len(test)} tweets, true negative share {truth:.4f}; strata " + ", ".join(f"{k} {len(sets[k])}" for k in langs),
           f"{REPS} draws per cell, seed {SEED}. Start p = {P} per stratum, add batches of B by Neyman shares until stratified-PPI half-width <= {100 * TARGET:.0f} pts; cap {CAP}.", "",
           "coder | B | mean n (oracle n) | sd n | p5 n | p95 n | mean half pts | share stopped under cap | coverage"]
    for coder, f in coders.items():
        fs = [[f[i] for i in sets[k]] for k in langs]
        for B in BATCHES:
            rr = random.Random(SEED)
            tot, hw, hit, ok = [], [], 0, 0
            for _ in range(REPS):
                pool = [rr.sample(sets[k], len(sets[k])) for k in langs]  # random order; audit = prefix
                cnt = [P] * len(langs)
                while True:
                    strata, s2 = [], []
                    for j, k in enumerate(langs):
                        idx = pool[j][:cnt[j]]
                        strata.append((sizes[j], fs[j], [human[i] for i in idx], [f[i] for i in idx]))
                        s2.append(max(FLOOR, statistics.variance([human[i] - f[i] for i in idx])))
                    e = E.stratified_ppi(strata)
                    n = sum(cnt)
                    if Z * e.se <= TARGET or n >= CAP:
                        break
                    w = [N * v ** 0.5 for N, v in zip(sizes, s2)]
                    for _b in range(min(B, CAP - n)):
                        j = max((j for j in range(len(langs)) if cnt[j] < sizes[j]), key=lambda j: w[j] / (cnt[j] + 1))
                        cnt[j] += 1
                tot.append(sum(cnt))
                hw.append(Z * e.se)
                hit += E.covers(e, truth)
                ok += Z * e.se <= TARGET
            ts = sorted(tot)
            line = (f"{coder} | {B} | {statistics.fmean(tot):.0f} ({ORACLE_N[coder]}) | {statistics.pstdev(tot):.0f} | {ts[int(0.05 * REPS)]} | "
                    f"{ts[int(0.95 * REPS)]} | {100 * statistics.fmean(hw):.2f} | {ok / REPS:.3f} | {hit / REPS:.3f}")
            out.append(line)
            print(line, flush=True)
    (HERE / "h6c_sequential.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
