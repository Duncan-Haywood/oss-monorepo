#!/usr/bin/env python3
"""Fail if a served venture page has no `<main>` landmark.

Without `<main>` a screen-reader user cannot jump past the header to the
tool (WCAG 1.3.1, 2.4.1). The pages share one shape: `<body><header>..</header>`
cards `<footer>..</footer>`. `--fix` wraps everything between `</header>` and
the single `<footer` (or, on a page with no header, everything after `<body>`) in `<main>`, but only when the page has exactly one of
each and no CSS selector that depends on `body >`, `header +` or `+ footer`
(wrapping would change what those match). Other pages are listed for hand edits.

    python3 platform/ci/check_main_landmark.py [--root DIR] [--fix]   # exit 1 if any left
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHAPE = re.compile(r"<body[^>]*>\s*<header")
BARE = re.compile(r"(<body[^>]*>)(\s*<h1)")
FRAGILE = re.compile(r"body\s*>|header\s*[+~]|[+~]\s*footer|footer\s*[+~]")


# Pages the wrapper cannot touch: a print rule `body > :not(#card)` would hide
# `<main>`, or the page has no header/footer shape. Give them `<main>` by hand
# (and fix the print rule with it), then drop them from this list.
EXEMPT = frozenset("""
deploy-concurrency-check expense-tracker freelance-contract-maker
freelance-dashboard freelance-lead-tracker freelance-proposal-maker
freelancer-tax-pack recompete-radar rental-ledger time-tracker
trade-bid-studio vpat-acr-generator
""".split())


def has_main(s):
    return re.search(r"<main[\s>]", s) is not None


def fixable(s):
    if BARE.search(s) and s.count("<footer") == 1 and "</header>" not in s:
        css = "".join(re.findall(r"<style[^>]*>(.*?)</style>", s, re.S))
        return not FRAGILE.search(css)
    if s.count("</header>") != 1 or s.count("<footer") != 1 or not SHAPE.search(s):
        return False
    if s.index("<footer") < s.index("</header>"):
        return False
    css = "".join(re.findall(r"<style[^>]*>(.*?)</style>", s, re.S))
    return not FRAGILE.search(css)


def wrap(s):
    if "</header>" in s:
        s = s.replace("</header>", "</header>\n<main>", 1)
    else:
        s = BARE.sub(r"\1\n<main>\2", s, count=1)
    return s.replace("<footer", "</main>\n<footer", 1)


# --all mode: secondary pages (guides, comparisons) in any folder, not only index.html.
STRIP = re.compile(r"<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->", re.S | re.I)
BODY = re.compile(r"(<body\b[^>]*>)(.*?)(</body>)", re.S | re.I)
HAS_MAIN = re.compile(r"<main\b|role=[\"']main[\"']", re.I)
BLOCKERS = re.compile(r"<(header|nav|aside|main)\b", re.I)


def _lacks_main(text: str) -> bool:
    return "<html" in text.lower() and not HAS_MAIN.search(STRIP.sub("", text))


def wrap_flat(text: str):
    """Return text with <main> added, or None when the page is not the safe shape."""
    if re.search(r"body\s*>", "\n".join(re.findall(r"<style\b[^>]*>(.*?)</style>", text, re.S | re.I))):
        return None
    m = BODY.search(text)
    if not m:
        return None
    start, inner, end = m.groups()
    bare = STRIP.sub("", inner)
    feet = list(re.finditer(r"<footer\b", inner, re.I))
    if len(feet) != 1 or BLOCKERS.search(bare) or inner.count("<footer") != 1:
        return None
    # the footer must close after nothing but scripts/whitespace
    tail = inner[feet[0].start():]
    if len(re.findall(r"<footer\b", tail, re.I)) != len(re.findall(r"</footer>", tail, re.I)):
        return None
    if re.search(r"</div>|</section>|</article>", STRIP.sub("", tail.split("</footer>", 1)[1])):
        return None
    # content before the footer must be balanced, so <main> nests cleanly
    head = STRIP.sub("", inner[: feet[0].start()])
    for tag in ("div", "section", "article", "ul", "ol", "table", "form", "details"):
        if len(re.findall(rf"<{tag}\b", head, re.I)) != len(re.findall(rf"</{tag}>", head, re.I)):
            return None
    if not head.strip():
        return None
    i = feet[0].start()
    new = inner[:i].rstrip("\n") + "\n</main>\n" + inner[i:]
    return text[: m.start()] + start + "\n<main>" + new + end + text[m.end():]


def sweep_all(root, fix):
    left, done = [], 0
    for f in sorted(Path(root).rglob("*.html")):
        if "node_modules" in f.parts or f.name == "index.html" and f.parent.parent == Path(root):
            continue
        try:
            t = f.read_bytes().decode("utf8")
        except (OSError, UnicodeDecodeError):
            continue
        if not _lacks_main(t):
            continue
        new = wrap_flat(t) if fix and "\r" not in t else None
        if new:
            f.write_bytes(new.encode("utf8"))
            done += 1
        else:
            left.append(f)
    print(f"--all: {done} wrapped, {len(left)} left")
    for f in left:
        print(f"{f.relative_to(ROOT) if f.is_relative_to(ROOT) else f}: no <main> landmark")
    return 1 if left else 0


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--all", action="store_true", help="also sweep secondary pages, not just */index.html")
    a = ap.parse_args(argv)
    if a.all:
        return sweep_all(a.root, a.fix)
    left = []
    fixed = 0
    for f in sorted(Path(a.root).glob("*/index.html")):
        s = f.read_text(encoding="utf8")
        if has_main(s) or (f.parent.name in EXEMPT and Path(a.root).name == "ventures"):
            continue
        if a.fix and fixable(s):
            f.write_text(wrap(s), encoding="utf8")
            fixed += 1
        else:
            left.append(f)
    if a.fix:
        print(f"wrapped {fixed} pages")
    for f in left:
        print(f"{f.relative_to(ROOT) if f.is_relative_to(ROOT) else f}: no <main> landmark")
    return 1 if left else 0


if __name__ == "__main__":
    sys.exit(main())
