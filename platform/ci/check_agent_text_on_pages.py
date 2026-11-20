#!/usr/bin/env python3
"""Fail if a public venture page speaks about the agent session that wrote it.

Comparison pages were written by agent sessions whose sandbox could not fetch a
competitor's site, and 162 of them told readers so in those words: "Jobber's own
site is not reachable from this session", "since this session cannot verify
today's figures" (quality census 2026-11-17,
portfolio/quality/audits/2026-11-17-irrigation-winterization-bid-calculator.json).
A reader has no session; the sentence is process residue. Say what the page does
instead ("this page does not track today's prices").

Pages where "this session" means the user's own work session (a gig driver's
shift) are fine: only phrases about reaching, fetching or verifying are flagged.

    python3 platform/ci/check_agent_text_on_pages.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PHRASE = re.compile(
    r"(?:not\s+reachable|blocked|not\s+reached(?:\s+by\s+a\s+live\s+fetch)?|refused|checked)\s+from\s+this\s+session"
    r"|refused\s+this\s+session"
    r"|this\s+session\s+(?:cannot|can't|can\s+not|could\s+not|couldn't|can)\s+(?:independently\s+)?"
    r"(?:verify|reach|confirm|fetch|access|load)"
    r"|this\s+session's\s+(?:egress|proxy|sandbox)"
    r"|egress\s+proxy",
    re.I,
)


# Every PHRASE alternative holds "session" or "egress". Under re.I the only
# non-ASCII characters that match an ASCII letter are these four (dotted and
# dotless i, long s, Kelvin sign), so a page without them is checked with a
# plain substring test first (same hits, about a third of the time:
# docs/history/ci-perf-2026-11-20-paired-check-prefilters.md).
_FOLDS = ("\u0130", "\u0131", "\u017f", "\u212a")


def _may_match(text: str) -> bool:
    if any(ch in text for ch in _FOLDS):
        return True
    low = text.lower()
    return "session" in low or "egress" in low


def agent_text(text: str):
    """Return each flagged phrase in one page, whitespace collapsed."""
    if not _may_match(text):
        return []
    return [re.sub(r"\s+", " ", m.group(0)) for m in PHRASE.finditer(text)]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT / "ventures")
    args = ap.parse_args(argv)
    bad = 0
    pages = [p for p in sorted(args.root.rglob("*.html"))
             if "node_modules" not in p.parts and "_site" not in p.parts]
    if not pages:
        print(f"no .html pages under {args.root}: nothing was checked")
        return 2
    for page in pages:
        hits = agent_text(page.read_text(encoding="utf-8", errors="replace"))
        for h in hits:
            print(f"{page.relative_to(args.root.parent)}: {h!r}")
        bad += len(hits)
    if bad:
        print(f"{bad} agent-session phrase(s) on public pages; say what the page does instead")
        return 1
    print("ok: no agent-session phrases on venture pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
