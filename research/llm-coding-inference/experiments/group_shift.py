"""H1: pooled vs language-stratified correction when the audit's language mix differs from the corpus's.
Real data (NaijaSenti, hau/ibo/pcm/yor, native-speaker labels), same seeded split and coders as
../../qual-dialect. Corpus = the 70% test part, so the true prevalence is known. Writes group_shift.txt.

    python3 experiments/group_shift.py     # needs the tsv cache that qual-dialect/experiments/run.py fills
"""
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0]))
sys.path.insert(0, str(HERE.parents[1] / "qual-dialect" / "experiments"))
from llmci import estimators as E  # noqa: E402
import run as qd  # noqa: E402  (qual-dialect's loader; importing runs nothing)

d, r = qd.d, qd.r
N_AUDIT, REPS, SEED = 400, 1000, 20261024
DESIGNS = {"A random": None,
           "B equal quota": {"hau": 100, "ibo": 100, "pcm": 100, "yor": 100},
           "C 70% hau": {"hau": 280, "ibo": 40, "pcm": 40, "yor": 40}}


def main():
    rows = qd.load()
    rng = random.Random(qd.SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(qd.TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    en = r.load_examples(qd.fetch(qd.GOEMO_URL, qd.GOEMO))
    nb_en = d.NB().fit([e[1] for e in en], [e[2] for e in en]).match_rate([e[1] for e in en], [e[2] for e in en])
    nb_in = d.NB().fit([t[1] for t in train], [t[2] for t in train]).match_rate([t[1] for t in train], [t[2] for t in train])
    human = [t[2] for t in test]
    coders = {"lexicon-en": [d.lexicon_code(t[1]) for t in test], "nb-english": [nb_en.code(t[1]) for t in test],
              "nb-in-language": [nb_in.code(t[1]) for t in test]}
    n = len(test)
    sets = {k: sorted(v) for k, v in d.by_language(test).items()}
    truth = sum(human) / n
    out = [f"NaijaSenti corpus {n} tweets, true negative share {truth:.4f}; "
           "corpus mix " + ", ".join(f"{k} {len(v) / n:.3f}" for k, v in sets.items()),
           f"audit n={N_AUDIT}, {REPS} draws per cell, seed {SEED}; coverage of the 95% interval (binomial sd about 0.007), "
           "mean width, mean bias (estimate - truth), points", "",
           "design coder estimator coverage width bias"]
    for dname, quota in DESIGNS.items():
        for cname, f in coders.items():
            rr = random.Random(SEED)
            acc = {m: {"hit": 0, "w": [], "b": []} for m in
                   ("human pooled", "PPI pooled", "PPI++ pooled", "human strat", "PPI strat")}
            for _ in range(REPS):
                if quota is None:
                    idx = rr.sample(range(n), N_AUDIT)
                else:
                    idx = [i for k, q_ in quota.items() for i in rr.sample(sets[k], q_)]
                aset = set(idx)
                y, fa = [human[i] for i in idx], [f[i] for i in idx]
                fu = [f[i] for i in range(n) if i not in aset]
                ests = {"human pooled": E.human_only(y), "PPI pooled": E.ppi(y, fa, fu), "PPI++ pooled": E.ppi_pp(y, fa, fu)}
                # language-stratified: audit items grouped by language (random audit gives random n_s)
                lang_of = {i: k for k, v in sets.items() for i in v}
                groups = {k: [i for i in idx if lang_of[i] == k] for k in sets}
                ests["human strat"] = E.stratified_human([(len(sets[k]), [human[i] for i in groups[k]]) for k in sets])
                ests["PPI strat"] = E.stratified_ppi([(len(sets[k]), [f[i] for i in sets[k]], [human[i] for i in groups[k]],
                                                       [f[i] for i in groups[k]]) for k in sets])
                for m, e in ests.items():
                    acc[m]["hit"] += E.covers(e, truth)
                    acc[m]["w"].append(2 * E.Z95 * e.se)
                    acc[m]["b"].append(e.value - truth)
            for m, a in acc.items():
                out.append(f"{dname} | {cname} | {m} | {a['hit'] / REPS:.3f} | {100 * statistics.fmean(a['w']):.2f} | "
                           f"{100 * statistics.fmean(a['b']):+.2f}")
            print(out[-1], flush=True)
    (HERE / "group_shift.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
