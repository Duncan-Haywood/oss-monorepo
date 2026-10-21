"""Per-language error of three automated coders on NaijaSenti, and what it does to naive, human-only and PPI
estimates of each language's negative share and of the gaps between languages. Downloads the tweets and
GoEmotions on first use (not committed). Writes experiments/results.txt.

    python3 experiments/run.py      # a few minutes, stdlib only, seeded
"""
import itertools
import random
import statistics
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import qualdialect as d  # noqa: E402
r, q = d.r, d.q

BASE = "https://raw.githubusercontent.com/hausanlp/NaijaSenti/main/data/annotated_tweets"
CACHE = Path.home() / ".cache" / "qual-dialect"
GOEMO = Path.home() / ".cache" / "qual-real" / "goemotions_1.csv"
GOEMO_URL = "https://storage.googleapis.com/gresearch/goemotions/data/full_dataset/goemotions_1.csv"
REPS, SIZES, SEED, TRAIN_SHARE = 500, (200, 400, 800), 20261021, 0.3


def fetch(url, path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, path)
    return path


def load():
    rows = []
    for lang in d.LANGS:
        paths = [fetch(f"{BASE}/{lang}/{s}.tsv", CACHE / f"{lang}_{s}.tsv") for s in ("train", "dev", "test")]
        rows += d.load_language(paths, lang)
    return rows


def main():
    rows = load()
    rng = random.Random(SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(TRAIN_SHARE * len(rows))
    train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    en = r.load_examples(fetch(GOEMO_URL, GOEMO))
    nb_en = d.NB().fit([e[1] for e in en], [e[2] for e in en]).match_rate([e[1] for e in en], [e[2] for e in en])
    nb_in = d.NB().fit([t[1] for t in train], [t[2] for t in train]).match_rate([t[1] for t in train], [t[2] for t in train])
    human = [t[2] for t in test]
    coders = {"lexicon-en": [d.lexicon_code(t[1]) for t in test], "nb-english": [nb_en.code(t[1]) for t in test],
              "nb-in-language": [nb_in.code(t[1]) for t in test]}
    n = len(test)
    sets = d.by_language(test)
    truth = {k: statistics.fmean(human[i] for i in s) for k, s in sets.items()}
    pairs = list(itertools.combinations(d.LANGS, 2))
    out = [f"NaijaSenti (hau, ibo, pcm, yor; train+dev+test pooled): {len(rows)} tweets; {len(train)} train the in-language coder, {n} evaluated.",
           f"GoEmotions (first file): {len(en)} English comments train the English coder. code = negative.",
           "human negative share on the evaluated items: " + ", ".join(f"{k} {truth[k]:.4f} (n={len(sets[k])})" for k in d.LANGS), ""]
    out.append("E1. The coders against human labels, by language")
    out.append("coder  lang  sens  spec  acc  kappa  coded_share  human_share")
    for name, llm in coders.items():
        for lang in d.LANGS:
            idx = sorted(sets[lang])
            a, h = [llm[i] for i in idx], [human[i] for i in idx]
            c = r.confusion(a, h)
            out.append(f"{name} {lang} {c['sens']:.3f} {c['spec']:.3f} {c['acc']:.3f} {q.cohen_kappa(a, h):.3f} "
                       f"{statistics.fmean(a):.3f} {statistics.fmean(h):.3f}")
    out.append("")
    out.append("E2. Gaps between languages (true = human share difference), naive coded-share gap")
    out.append("pair  true_gap  " + "  ".join(coders))
    for a, b in pairs:
        out.append(f"{a}-{b} {truth[a] - truth[b]:+.4f} " + " ".join(
            f"{statistics.fmean(llm[i] for i in sets[a]) - statistics.fmean(llm[i] for i in sets[b]):+.4f}" for llm in coders.values()))
    out.append("")
    stats = {(name, k): d.Stats([llm[i] for i in s]) for name, llm in coders.items() for k, s in sets.items()}
    for name, llm in coders.items():
        for ng in SIZES:
            acc = {k: {m: [] for m in ("naive", "human", "ppi")} for k in list(d.LANGS) + [f"{a}-{b}" for a, b in pairs]}
            for _ in range(REPS):
                gold = rng.sample(range(n), ng)
                est = {}
                for lang in d.LANGS:
                    g = [i for i in gold if i in sets[lang]]
                    st = stats[(name, lang)]
                    est[lang] = {"naive": (st.mean, st.var ** 0.5 / st.n ** 0.5),
                                 "human": q.human_only([human[i] for i in g]),
                                 "ppi": d.ppi_fast(st, [llm[i] for i in g], [human[i] for i in g])}
                    for m, e in est[lang].items():
                        acc[lang][m].append((e, truth[lang]))
                for a, b in pairs:
                    for m in ("naive", "human", "ppi"):
                        acc[f"{a}-{b}"][m].append((q.gap(est[a][m], est[b][m]), truth[a] - truth[b]))
            out.append(f"E3. {name}, {ng} hand-coded items (random over all languages), {REPS} draws")
            out.append("target  estimator  true  mean_est  bias  coverage  width")
            for k, label in [(l, l) for l in d.LANGS] + [(f"{a}-{b}", f"gap {a}-{b}") for a, b in pairs]:
                for m in ("naive", "human", "ppi"):
                    rws = acc[k][m]
                    t = rws[0][1]
                    ests = [e[0] for e, _ in rws]
                    out.append(f"{label.replace(' ', '_')} {m} {t:+.4f} {statistics.fmean(ests):+.4f} {statistics.fmean(ests) - t:+.4f} "
                               f"{statistics.fmean(q.covers(e, t) for e, _ in rws):.3f} {statistics.fmean(2 * q.Z95 * e[1] for e, _ in rws):.4f}")
            out.append("")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
