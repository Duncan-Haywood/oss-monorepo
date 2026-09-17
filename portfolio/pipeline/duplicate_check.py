#!/usr/bin/env python3
"""Check whether a proposed niche already exists somewhere in the portfolio.

    python3 portfolio/pipeline/duplicate_check.py "one-line description of the niche"

`README.md` says a candidate is screened against three things before it is
worth writing up: the 199 (and rising) `ventures/*/VENTURE.yaml` descriptions,
`screened-out.md`, and the eight ideas in `ventures/ai-first-markets`. In
practice that check is "read three documents and a directory listing by eye,"
which is exactly the kind of manual step this repo has learned, repeatedly,
to replace with a script once the list got long enough that eyeballing it
reliably misses something (`supersede_check.py`, `checklist_coverage.py`,
`check_no_payment_code.py` are the same move for other lists). At 199
`ventures/` directories — most of them a "<trade>-bid-calculator" shape —
eyeballing is no longer reliable, and a near-duplicate is exactly what
`DIRECTION.md`'s "raise the bar, not just the count" note warns against.

This does word- and bigram-overlap scoring, not semantic understanding: it
will not catch a genuine paraphrase, and a low score is not a clearance to
skip reading the closest matches yourself. What it is good for is the
mechanical case that actually recurs here: a proposed niche that shares most
of its nouns with an existing venture or a screened-out row, which a fast
skim across 199 directory names reliably misses.

Exits 1 (and prints the closest matches) when the top score clears the
"read this before you write a candidate" threshold. Exit 0 means nothing
scored that close — still read the top handful printed, they are evidence,
not a verdict.
"""

from __future__ import annotations

import argparse
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
VENTURES_DIR = ROOT / "ventures"
PIPELINE_DIR = Path(__file__).resolve().parent
SCREENED_OUT = PIPELINE_DIR / "screened-out.md"
CANDIDATES_YAML = PIPELINE_DIR / "candidates.yaml"
IDEAS_TS = VENTURES_DIR / "ai-first-markets" / "src" / "data" / "ideas.ts"

# High enough that two unrelated "X-bid-calculator" ventures (which all share
# generic vocabulary -- "bid", "labor", "margin", "walk-away price" -- but that
# vocabulary is down-weighted below because it is common across the corpus)
# don't trip it; low enough that a same-trade near-duplicate does. Picked by
# running the script against pairs of already-graduated ventures known to be
# genuinely different trades versus a venture's own description reworded with
# a couple of words changed; see the test file for both cases pinned.
WARN_THRESHOLD = 0.45
TOP_N = 10

STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "by",
    "with", "from", "that", "this", "is", "are", "be", "it", "its", "their",
    "your", "you", "who", "what", "when", "before", "after", "than", "not",
    "no", "does", "do", "has", "have", "will", "can", "into", "over", "as",
    "each", "own", "so", "which", "was", "were", "free", "browser",
    "calculator", "private",
}

WORD_RE = re.compile(r"[a-z]+")


@dataclass(frozen=True)
class Item:
    source: str  # "venture" | "screened-out" | "ai-first-markets idea" | "pipeline candidate"
    label: str
    text: str


def tokenize(text: str) -> list[str]:
    return [w for w in WORD_RE.findall(text.lower()) if w not in STOPWORDS and len(w) > 2]


def bigrams(words: list[str]) -> set[tuple[str, str]]:
    return {(words[i], words[i + 1]) for i in range(len(words) - 1)}


def document_frequency(items: list["Item"]) -> dict[str, int]:
    df: dict[str, int] = {}
    for item in items:
        for word in set(tokenize(item.text)):
            df[word] = df.get(word, 0) + 1
    return df


def idf(word: str, df: dict[str, int], corpus_size: int) -> float:
    # Smoothed, always positive -- a word absent from the corpus (a brand-new
    # trade term) gets the maximum weight rather than dividing by zero.
    return math.log((corpus_size + 1) / (df.get(word, 0) + 1)) + 1.0


def weighted_containment(query_words: list[str], item_words: list[str], df: dict[str, int], corpus_size: int) -> float:
    """What share of the QUERY's (weighted) vocabulary the item already covers.

    Containment against the query, not full Jaccard against the item: an
    existing venture's write-up is routinely 10x longer than a one-line
    candidate description, and plain Jaccard punishes that length gap so hard
    it hides a genuine near-duplicate (a short query that is a pure subset of
    a long description used to score well under 0.2). IDF weighting is what
    keeps that containment score from firing on generic fleet-wide vocabulary
    ("price", "job", "margin", "contractor" appear in most of the ~200
    bid-calculator ventures, so they carry little weight; "sealcoating" or
    "beekeeper" appear in at most a couple, so they carry a lot).
    """
    query_set = set(query_words)
    if not query_set:
        return 0.0
    item_set = set(item_words)
    weights = {w: idf(w, df, corpus_size) for w in query_set}
    total = sum(weights.values())
    if total == 0:
        return 0.0
    matched = sum(weights[w] for w in query_set if w in item_set)
    return matched / total


def bigram_containment(query_bigrams: set, item_bigrams: set) -> float:
    if not query_bigrams:
        return 0.0
    return len(query_bigrams & item_bigrams) / len(query_bigrams)


def is_marked_not_a_venture(venture_dir: Path) -> bool:
    return any(p.name.upper() == "NOT-A-VENTURE" for p in venture_dir.iterdir())


def load_ventures() -> list[Item]:
    items: list[Item] = []
    for manifest in sorted(VENTURES_DIR.glob("*/VENTURE.yaml")):
        venture_dir = manifest.parent
        if is_marked_not_a_venture(venture_dir):
            continue
        try:
            doc = yaml.safe_load(manifest.read_text()) or {}
        except yaml.YAMLError:
            continue
        name = str(doc.get("name") or venture_dir.name)
        description = str(doc.get("description") or "")
        items.append(Item("venture", venture_dir.name, f"{name} {description}"))
        for line in doc.get("product_lines") or []:
            line_name = line.get("name") if isinstance(line, dict) else str(line)
            line_desc = line.get("description") if isinstance(line, dict) else ""
            items.append(
                Item(
                    "venture (product line)",
                    f"{venture_dir.name}/{line_name}",
                    f"{line_name} {line_desc}",
                )
            )
    return items


TABLE_ROW_RE = re.compile(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$")


def load_screened_out() -> list[Item]:
    if not SCREENED_OUT.exists():
        return []
    items: list[Item] = []
    for line in SCREENED_OUT.read_text().splitlines():
        match = TABLE_ROW_RE.match(line)
        if not match:
            continue
        left, right = match.groups()
        if left in ("Candidate", "---") or set(left) <= {"-", " "}:
            continue
        items.append(Item("screened-out.md row", left[:80], f"{left} {right}"))
    return items


IDEA_FIELD_RE = re.compile(r'(name|tagline|summary|problem|solution)\s*:\s*\n?\s*"([^"]*)"')


def load_ai_first_markets_ideas() -> list[Item]:
    if not IDEAS_TS.exists():
        return []
    text = IDEAS_TS.read_text()
    ideas: list[dict] = []
    current: dict = {}
    for match in IDEA_FIELD_RE.finditer(text):
        field, value = match.groups()
        if field == "name" and current:
            ideas.append(current)
            current = {}
        current[field] = value
    if current:
        ideas.append(current)
    return [
        Item(
            "ai-first-markets idea",
            idea.get("name", "?"),
            " ".join(idea.get(f, "") for f in ("name", "tagline", "summary", "problem", "solution")),
        )
        for idea in ideas
    ]


def load_pipeline_candidates() -> list[Item]:
    if not CANDIDATES_YAML.exists():
        return []
    doc = yaml.safe_load(CANDIDATES_YAML.read_text()) or {}
    items: list[Item] = []
    for entry in doc.get("candidates") or []:
        slug = entry.get("slug") or "?"
        name = entry.get("name") or slug
        extra = ""
        doc_path = entry.get("doc")
        if doc_path:
            write_up = (PIPELINE_DIR / doc_path).resolve()
            if write_up.exists():
                # First couple of paragraphs carry the actual description;
                # the rest is scoring detail that would just dilute the match.
                paragraphs = [p for p in write_up.read_text().split("\n\n") if p.strip()]
                extra = " ".join(paragraphs[:3])
        items.append(Item("pipeline candidate", slug, f"{name} {extra}"))
    return items


def load_all() -> list[Item]:
    return (
        load_ventures()
        + load_screened_out()
        + load_ai_first_markets_ideas()
        + load_pipeline_candidates()
    )


def rank(query: str, items: list[Item]) -> list[tuple[float, Item]]:
    words = tokenize(query)
    grams = bigrams(words)
    df = document_frequency(items)
    corpus_size = len(items)

    scored = []
    for item in items:
        item_words = tokenize(item.text)
        word_score = weighted_containment(words, item_words, df, corpus_size)
        gram_score = bigram_containment(grams, bigrams(item_words))
        scored.append((0.7 * word_score + 0.3 * gram_score, item))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return scored


def report(query: str, ranked: list[tuple[float, Item]]) -> tuple[str, bool]:
    lines = [f"Duplicate check for: {query!r}", ""]
    top = ranked[:TOP_N]
    if not top or top[0][0] == 0.0:
        lines.append("No lexical overlap with anything in ventures/, screened-out.md,")
        lines.append("ai-first-markets, or pipeline/candidates.yaml. That is evidence of")
        lines.append("novelty, not proof — this is word overlap, not meaning.")
        return "\n".join(lines), False

    lines.append(f"{'score':>6}  source                    label")
    for value, item in top:
        lines.append(f"{value:6.2f}  {item.source:<25} {item.label}")
    lines.append("")

    flagged = top[0][0] >= WARN_THRESHOLD
    if flagged:
        lines.append(
            f"HIGH OVERLAP ({top[0][0]:.2f} >= {WARN_THRESHOLD}) with "
            f"{top[0][1].label!r} ({top[0][1].source})."
        )
        lines.append(
            "Read it before writing a candidate write-up. If it is the same"
        )
        lines.append(
            "business, this is a product line or a screened idea, not a new venture"
        )
        lines.append(
            "(README.md: 'a candidate that fits an existing venture is a product"
        )
        lines.append("line first'). If it is a genuinely different job, say so in the")
        lines.append("candidate write-up's own overlap section rather than skipping it.")
    else:
        lines.append(
            f"Nothing scored >= {WARN_THRESHOLD}. Still read the top few above — this is"
        )
        lines.append("word overlap, not a semantic check, and a paraphrase can score low.")
    return "\n".join(lines), flagged


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "query",
        nargs="+",
        help="the candidate niche, in a sentence or two -- same length as a VENTURE.yaml description",
    )
    args = parser.parse_args()
    query = " ".join(args.query)

    items = load_all()
    ranked = rank(query, items)
    text, flagged = report(query, ranked)
    print(text)
    return 1 if flagged else 0


if __name__ == "__main__":
    sys.exit(main())
