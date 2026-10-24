"""Lexical overlap between research projects, within and across slug families."""
import re
from itertools import combinations
from pathlib import Path

STOP = set("""the a an and or of to in on for is are was were be been by with as at from that this it its
not no but if than then so we our which what how does do did can could will would has have had per
into over under between against about after before each all any more most less least than also only
run runs result results project projects research""".split())


def family(slug):
    return slug.split("-", 1)[0]


def section(text, name):
    """Body of the '## name' section, or '' if absent."""
    m = re.search(r"^## " + re.escape(name) + r"\s*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return m.group(1) if m else ""


def words(text):
    text = re.sub(r"`[^`]*`|\[[^\]]*\]\([^)]*\)|https?://\S+|\d+(\.\d+)?", " ", text.lower())
    return {w for w in re.findall(r"[a-z]{3,}", text) if w not in STOP}


def project_words(readme_text):
    """Words of the title line plus the Question section: what the project asks, not how it reports."""
    title = readme_text.splitlines()[0] if readme_text else ""
    return words(title + " " + section(readme_text, "Question"))


def jaccard(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0


def load(root):
    out = {}
    for d in sorted(Path(root).iterdir()):
        r = d / "README.md"
        if d.is_dir() and not d.name.startswith(("_", ".")) and r.exists():
            w = project_words(r.read_text(encoding="utf-8"))
            if w:
                out[d.name] = w
    return out


def pair_scores(projects):
    """Yield (slug_a, slug_b, jaccard) for every pair."""
    for a, b in combinations(sorted(projects), 2):
        yield a, b, jaccard(projects[a], projects[b])


def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else float("nan")


def summarise(projects, min_family=5):
    within, across = {}, []
    for a, b, j in pair_scores(projects):
        if family(a) == family(b):
            within.setdefault(family(a), []).append((j, a, b))
        else:
            across.append(j)
    fams = {f: v for f, v in within.items() if len({x for _, a, b in v for x in (a, b)}) >= min_family}
    return fams, across
