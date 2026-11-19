"""Check the letter-length version (ral.md) against the extended draft (draft.md), and estimate its length.

    python3 paper/check_short.py      # stdlib only; exit 1 on any miss

ral.md is cut from draft.md and adds no result of its own. So every number in it must already appear in
draft.md, whose numbers check_numbers.py ties to the stored results. A "number" is any digit run with
optional decimal part; it must occur in draft.md with no digit or decimal point either side, so "0.59" does
not match inside "0.591". Numbers inside citation keys, figure paths and the opening italic note are skipped.
Every [key] cited must be a key in references.bib, and every figure path must exist.

The length estimate is a rule of thumb, not a typeset page count: IEEE two-column 10 pt text holds about
1,000 words a page; each figure is counted as 0.4 page and each table row as 0.03 page, and the references as
0.04 page each. Building the LaTeX is the real check, and needs a class this environment does not install.
"""
import pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
DRAFT = (HERE / "draft.md").read_text()
SHORT = (HERE / "ral.md").read_text()
BIB = (HERE / "references.bib").read_text()
LIMIT_PAGES = 8

NUM = re.compile(r"(?<![\d.])\d+(?:\.\d+)?(?![\d])")


def body(text):
    """ral.md without the opening italic note (everything up to '## Abstract')."""
    return text[text.index("## Abstract"):]


def strip_refs(text):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)          # figure embeds
    text = re.sub(r"\[[a-z0-9_, ]+\]", " ", text)              # [key, key] citations
    text = re.sub(r"`[^`]*`", " ", text)                       # code spans (file names, API names)
    text = re.sub(r"<[^>]+>", " ", text)                       # html tags such as <sub>
    return text


def in_draft(tok):
    return re.search(r"(?<![\d.])" + re.escape(tok) + r"(?![\d]|\.\d)", DRAFT) is not None


def main():
    misses = []
    b = body(SHORT)
    text = strip_refs(b)
    toks = NUM.findall(text)
    for t in sorted(set(toks), key=lambda s: (len(s), s)):
        if not in_draft(t):
            misses.append(f"number {t} is not in draft.md")
    keys = set(re.findall(r"@\w+\{([^,]+),", BIB))
    for group in re.findall(r"\[([a-z0-9_, ]+)\]", b):
        for k in (s.strip() for s in group.split(",")):
            if k and k not in keys:
                misses.append(f"citation [{k}] is not in references.bib")
    figs = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", b)
    for f in figs:
        if not (HERE / f).resolve().exists():
            misses.append(f"figure {f} does not exist")

    prose = [ln for ln in b.splitlines() if not ln.startswith("|") and not ln.startswith("![")]
    words = len(strip_refs("\n".join(prose)).split())
    rows = sum(1 for ln in b.splitlines() if ln.startswith("|") and not set(ln) <= set("|- "))
    cited = {k.strip() for g in re.findall(r"\[([a-z0-9_, ]+)\]", b) for k in g.split(",") if k.strip()}
    pages = words / 1000 + 0.4 * len(figs) + 0.03 * rows + 0.04 * len(cited)
    print(f"ral.md: {len(set(toks))} distinct numbers, {len(cited)} references, {len(figs)} figures, "
          f"{rows} table rows, {words} words of prose")
    print(f"length estimate: {pages:.1f} pages (limit {LIMIT_PAGES}; rule of thumb, see the docstring); "
          f"draft.md has {len(strip_refs(body(DRAFT) if '## Abstract' in DRAFT else DRAFT).split())} words")
    if pages > LIMIT_PAGES:
        misses.append(f"estimated {pages:.1f} pages exceeds {LIMIT_PAGES}")
    for m in misses:
        print("MISS", m)
    print("ok" if not misses else f"{len(misses)} miss(es)")
    return 1 if misses else 0


if __name__ == "__main__":
    sys.exit(main())
