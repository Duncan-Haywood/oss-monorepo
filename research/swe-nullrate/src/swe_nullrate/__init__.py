"""Headline-type census of the research portfolio's project summaries (stdlib only)."""
import csv
import html
import json
import math
import random
import re

LABELS = ("positive", "mixed", "negative", "descriptive")
SHORT = {"P": "positive", "M": "mixed", "N": "negative", "D": "descriptive"}

# Words a summary uses when it reports that something did not work or did not hold.
NEG = re.compile(
    r"\b(negative result|mostly negative|negative for|null result|no gain|no better|barely helps?|does not|did not|"
    r"fails?|failed|not significant|worse than|no advantage|artefact|artifact|discard|not identified|within (?:three-)?seed noise|"
    r"hurts?|cannot|ties)\b",
    re.I,
)
DISCLOSE = re.compile(r"\b(stylised|stylized|preliminary|illustrative|assumed|simulated only|textbook-level)\b", re.I)


def plain(summary):
    """HTML summary -> plain text with entities decoded and whitespace collapsed."""
    t = re.sub(r"<[^>]+>", " ", summary)
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def load_projects(path):
    """[(slug, theme, title, plain summary)] from _homepage/projects.json."""
    d = json.load(open(path, encoding="utf-8"))
    out = []
    for th in d["themes"]:
        for p in th.get("projects", []):
            out.append((p["slug"], th["id"], p["title"], plain(p["summary"])))
    return out


def sample(slugs, k, seed):
    """Reproducible simple random sample of k slugs (sorted input, seeded Mersenne Twister)."""
    return random.Random(seed).sample(sorted(slugs), k)


def keyword_flag(text):
    """True if the rule says the summary reports a negative or mixed headline."""
    return bool(NEG.search(text))


def discloses(text):
    return bool(DISCLOSE.search(text))


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d, (c + h) / d)


def read_tsv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return [r for r in csv.reader(f, delimiter="\t")]


def binary_scores(pairs):
    """pairs of (hand_is_neg, rule_flag) -> dict with tp, fp, fn, tn, precision, recall."""
    tp = sum(1 for h, r in pairs if h and r)
    fp = sum(1 for h, r in pairs if not h and r)
    fn = sum(1 for h, r in pairs if h and not r)
    tn = sum(1 for h, r in pairs if not h and not r)
    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "precision": tp / (tp + fp) if tp + fp else float("nan"),
        "recall": tp / (tp + fn) if tp + fn else float("nan"),
    }
