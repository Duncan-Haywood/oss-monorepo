"""Score the keyword classifier against the hand labels.  python experiments/run.py > experiments/results.txt"""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from swe_errlabel import LABELS, read_tsv, predict, wilson, confusion, cohen_kappa, per_class  # noqa: E402

texts = dict(read_tsv(HERE.parent / "data" / "to_label.tsv"))
labels = dict(read_tsv(HERE.parent / "data" / "labels.tsv"))
assert set(texts) == set(labels), "every sampled entry needs exactly one hand label"
pairs = [(labels[i], predict(texts[i])) for i in sorted(texts, key=lambda s: float(s))]
n = len(pairs)
k = sum(1 for a, b in pairs if a == b)
lo, hi = wilson(k, n)
print(f"entries {n}; keyword rule agrees with the hand label on {k} = {k/n:.1%} (Wilson 95% {lo:.1%} to {hi:.1%})")
print(f"Cohen's kappa {cohen_kappa(pairs):.2f}")
print("\nconfusion: rows hand label, columns keyword rule")
print(f"{'':14s}" + "".join(f"{c[:8]:>9s}" for c in LABELS))
for a, row in confusion(pairs).items():
    print(f"{a:14s}" + "".join(f"{row[b]:9d}" for b in LABELS))
print("\nper class: keyword assigned / hand labelled / agreed -> precision, recall")
for c, d in per_class(pairs).items():
    p = f"{d['tp']/d['assigned']:.0%}" if d["assigned"] else "n/a"
    r = f"{d['tp']/d['hand']:.0%}" if d["hand"] else "n/a"
    print(f"  {c:14s} {d['assigned']:3d} {d['hand']:3d} {d['tp']:3d}   precision {p:>4s}  recall {r:>4s}")
print("\ndisagreements (hand -> keyword):")
for i in sorted(texts, key=lambda s: float(s)):
    h, kw = labels[i], predict(texts[i])
    if h != kw:
        print(f"  {i:6s} {h} -> {kw}: {texts[i][:110]}")
