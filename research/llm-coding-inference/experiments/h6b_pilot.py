"""Milestone 6b: plan the audit size from a pilot. Audit p items per stratum, estimate S_h^2 (variance of
r = y - f) from them, set the total n by the Neyman rule for a +/-3 point target, top up, and estimate with
stratified PPI. Same corpus, split, coders and seed scheme as h5_plugin.py. Writes h6b_pilot.txt.

    python3 experiments/h6b_pilot.py     # needs the tsv cache that qual-dialect/experiments/run.py fills
"""
import math
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift as G  # noqa: E402
import h5_plugin as H  # noqa: E402
from llmci import estimators as E  # noqa: E402

qd, d = G.qd, G.d
REPS, SEED, Z, TARGET = 1000, 20261026, E.Z95, 0.03
PILOTS, FLOOR = (10, 20, 40), 0.02
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
           f"{REPS} draws per cell, seed {SEED}. Pilot p per stratum -> S_h^2 hat (floor {FLOOR}) -> Neyman total n for +/-{100 * TARGET:.0f} pts -> top up -> stratified PPI.", "",
           "coder | p | mean total n (oracle n) | sd n | mean half pts | p95 half pts | share half<=3.0 | share half<=3.3 | coverage"]
    for coder, f in coders.items():
        for p in PILOTS:
            rr = random.Random(SEED)
            tot, hw, hit = [], [], 0
            for _ in range(REPS):
                pilot = {k: rr.sample(sets[k], p) for k in langs}
                s2 = []
                for k in langs:
                    res = [human[i] - f[i] for i in pilot[k]]
                    s2.append(max(FLOOR, statistics.variance(res)))
                nt = math.ceil(H.neyman_total(sizes, s2, TARGET))
                sw = [math.sqrt(v) * N for v, N in zip(s2, sizes)]
                alloc = [min(N, max(p, round(nt * w / sum(sw)))) for w, N in zip(sw, sizes)]
                strata = []
                for k, N, a in zip(langs, sizes, alloc):
                    taken = set(pilot[k])
                    rest = [i for i in sets[k] if i not in taken]
                    idx = pilot[k] + rr.sample(rest, a - p)
                    strata.append((N, [f[i] for i in sets[k]], [human[i] for i in idx], [f[i] for i in idx]))
                e = E.stratified_ppi(strata)
                tot.append(sum(alloc))
                hw.append(Z * e.se)
                hit += E.covers(e, truth)
            hs = sorted(hw)
            line = (f"{coder} | {p} | {statistics.fmean(tot):.0f} ({ORACLE_N[coder]}) | {statistics.pstdev(tot):.0f} | {100 * statistics.fmean(hw):.2f} | "
                    f"{100 * hs[int(0.95 * REPS)]:.2f} | {sum(h <= 0.03 for h in hw) / REPS:.3f} | {sum(h <= 0.033 for h in hw) / REPS:.3f} | {hit / REPS:.3f}")
            out.append(line)
            print(line, flush=True)
    (HERE / "h6b_pilot.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
