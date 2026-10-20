"""Refit swe-errors' keyword rules on half of swe-errlabel's hand labels and score them on the other half (two-fold)."""
import itertools
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "swe-errors" / "src"))
sys.path.insert(0, str(HERE.parent / "swe-errlabel" / "src"))
from swe_errors import RULES  # noqa: E402
from swe_errlabel import LABELS, read_tsv, wilson  # noqa: E402

CLASSES = [name for name, _ in RULES]  # rule order of swe-errors; 'other' is what no rule matches
STOP = set("the and for with was were that this from not but are has had its into then than when which have been used only after before each all one two per via".split())


_RX = {}


def predict(rules, text):
    t = text.lower()
    for name, pat in rules:
        rx = _RX.get(pat) or _RX.setdefault(pat, re.compile(pat))
        if rx.search(t):
            return name
    return "other"


def accuracy(rules, items):
    return sum(1 for text, hand in items if predict(rules, text) == hand)


def best_order(rules, items):
    """Reorder the rules to maximise accuracy on items; ties keep the order closest to the original (fewest inversions)."""
    base = [n for n, _ in rules]
    pats = dict(rules)

    def inversions(order):
        return sum(1 for i, a in enumerate(order) for b in order[i + 1:] if base.index(a) > base.index(b))

    best = None
    for order in itertools.permutations(base):
        cand = [(n, pats[n]) for n in order]
        key = (-accuracy(cand, items), inversions(order))
        if best is None or key < best[0]:
            best = (key, cand)
    return best[1]


def candidate_words(items):
    """Words (3+ letters) that occur in at least two entries; a word seen once cannot generalise."""
    count = {}
    for text, _ in items:
        for w in set(re.findall(r"[a-z][a-z0-9_.-]{2,}", text.lower())):
            if w not in STOP:
                count[w] = count.get(w, 0) + 1
    return sorted(w for w, c in count.items() if c >= 2)


def add_words(rules, items, max_add=6, min_gain=2):
    """Greedily append one word at a time to one rule's pattern while that gains at least min_gain correct entries on items."""
    rules = list(rules)
    added = []
    words = candidate_words(items)
    for _ in range(max_add):
        cur = accuracy(rules, items)
        best = None
        for i, (name, pat) in enumerate(rules):
            for w in words:
                new = pat + "|" + re.escape(w)
                trial = rules[:i] + [(name, new)] + rules[i + 1:]
                gain = accuracy(trial, items) - cur
                if gain >= min_gain and (best is None or gain > best[0]):
                    best = (gain, i, w)
        if best is None:
            break
        gain, i, w = best
        rules[i] = (rules[i][0], rules[i][1] + "|" + re.escape(w))
        added.append((rules[i][0], w, gain))
    return rules, added


def refit(items, max_add=6, min_gain=2):
    rules = best_order(RULES, items)
    rules, added = add_words(rules, items, max_add, min_gain)
    return rules, added


def load_items():
    base = HERE.parent / "swe-errlabel" / "data"
    texts = dict(read_tsv(base / "to_label.tsv"))
    labels = dict(read_tsv(base / "labels.tsv"))
    ids = sorted(texts, key=float)
    return [(i, texts[i], labels[i]) for i in ids]


def split(items, seed):
    """Two folds of 30, shuffled by run so entries from the same run (112.0, 112.1) stay in one fold."""
    runs = sorted({i.split(".")[0] for i, _, _ in items}, key=int)
    random.Random(seed).shuffle(runs)
    a = set(runs[: len(runs) // 2])
    f0 = [(t, h) for i, t, h in items if i.split(".")[0] in a]
    f1 = [(t, h) for i, t, h in items if i.split(".")[0] not in a]
    return f0, f1


def two_fold(items, seed, max_add=6, min_gain=2):
    """Returns (baseline_correct, refit_correct, n, fits) over both held-out folds."""
    f0, f1 = split(items, seed)
    base = refit_c = n = 0
    fits = []
    for dev, held in ((f0, f1), (f1, f0)):
        rules, added = refit(dev, max_add, min_gain)
        base += accuracy(RULES, held)
        refit_c += accuracy(rules, held)
        n += len(held)
        fits.append(([name for name, _ in rules], added, len(dev), len(held)))
    return base, refit_c, n, fits
