#!/usr/bin/env python3
"""Move the paid products from FSL-1.1-MIT to an all-rights-reserved notice.

Owner, 2026-11-26: the paid products "stay in open but with restrcitve
license", and on which licence: "i dont think convert to mit in 2 years. just
all rights reserved license". The products are the `proprietary` track of
`transition.json`; the free tools stay FSL-1.1-MIT. Why, and what cannot
change (published versions keep the licence they shipped under):
`portfolio/monetization/LICENSING_TRANSITION.md`, "Superseded, 2026-11-26".

What the script does, idempotently, inside `ventures/<slug>/` for each product:

1. The owner's own FSL-1.1-MIT licence file (copyright held by Duncan Haywood
   or Maris Stella Labs) is replaced by `licences/ALL-RIGHTS-RESERVED`, keeping
   its copyright year and holder. Third-party licence files are never touched.
2. Our own statements that the code is FSL-1.1-MIT or "source available" (page
   footers, FAQ answers, READMEs, llms.txt, package.json `license` fields and
   the tests that assert them) are rewritten to say it is source visible and
   all rights reserved. Only the phrasings in `REWRITES` are touched.
3. `--check` lists what still needs rewriting, and `--residue` lists lines that
   still name FSL, "open source" or self-hosting, which a person reads by hand:
   a "run your own copy" offer, for one, is no longer true and is not a
   phrase swap.

Usage: python3 portfolio/monetization/relicense_arr.py [--check | --residue] [slug ...]
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OWNERS = ("Duncan Haywood", "Maris Stella Labs")
SPDX_ID = "LicenseRef-AllRightsReserved"
TEMPLATE = HERE / "licences" / "ALL-RIGHTS-RESERVED"

FSL_HEAD = re.compile(r"\A# Functional Source License, Version 1\.1, MIT Future License\b")
FSL_NOTICE = re.compile(r"^Copyright \(c\) (\d{4}(?:-\d{4})?) ([^\n]+?)\s*$", re.M)
ARR_FIRST = re.compile(r"\ACopyright \(c\) \d{4}(?:-\d{4})? .+?\. All rights reserved\.\n")

FSL = r"FSL-1\.1-MIT"
ARR = "all rights reserved"
# Ordered: longer, more specific phrasings first. Each one names our own code.
REWRITES: list[tuple[re.Pattern[str], str]] = [
    # Links to the licence file.
    (re.compile(rf"(?:\bthe )?(<a href=\"LICENSE\"[^>]*>)(?:the )?{FSL} licen[cs]e</a>"),
     r"an \1all-rights-reserved notice</a>"),
    (re.compile(rf"\[{FSL} licen[cs]e\]\(LICENSE\)"), "[all-rights-reserved notice](LICENSE)"),
    (re.compile(rf"\[{FSL}\]\(LICENSE\)"), "[all rights reserved](LICENSE)"),
    (re.compile(rf"(<a href=\"LICENSE\"[^>]*>){FSL}</a>"), r"\1all rights reserved</a>"),
    # "under the FSL-1.1-MIT licence", "code is under the FSL-1.1-MIT licence".
    (re.compile(rf"\bunder (?:the|an) {FSL}(\s+)licen[cs]e\b"), r"under an all-rights-reserved\1notice"),
    # Sentence-initial "FSL-1.1-MIT licensed" after a full stop.
    (re.compile(rf"(\. |^){FSL}[- ]licensed\b", re.M), r"\1All rights reserved"),
    (re.compile(rf"(\. |^(?:\s*(?://|#)\s*)?){FSL} licen[cs]e\.", re.M), r"\1All rights reserved."),
    (re.compile(rf"\bare {FSL}[- ]licensed\b"), "are under an all-rights-reserved notice"),
    (re.compile(rf"\bis {FSL}[- ]licensed\b"), "is under an all-rights-reserved notice"),
    (re.compile(rf"\b{FSL}[- ]licensed\b"), "all rights reserved"),
    (re.compile(rf"\b{FSL} licen[cs]e\b"), "all-rights-reserved notice"),
    (re.compile(rf"\(source available, {FSL}\)"), f"(source visible, {ARR})"),
    (re.compile(rf"\({FSL}\)"), f"({ARR})"),
    (re.compile(rf"\({FSL}, see `LICENSE`\)"), f"({ARR}, see `LICENSE`)"),
    (re.compile(rf"\bcode is {FSL}\b"), f"code is {ARR}"),
    (re.compile(rf"\bSource: {FSL}\b"), f"Source: {ARR}"),
    # "source available" says others may use it; "source visible" says only
    # that it can be read.
    (re.compile(r"\bSource available\b"), "Source visible"),
    (re.compile(r"\bsource available\b"), "source visible"),
    (re.compile(r"\bSource-available\b"), "Source-visible"),
    (re.compile(r"\bsource-available\b"), "source-visible"),
    # "Open source" is not true of an all-rights-reserved product.
    (re.compile(r"\bOpen source under an all-rights-reserved"), "Source visible under an all-rights-reserved"),
    (re.compile(r"\bopen source under an all-rights-reserved"), "source visible under an all-rights-reserved"),
    # Page tests that assert the shipped licence.
    (re.compile(r"/Functional Source License/"), "/All rights reserved/"),
    (re.compile(rf"/{FSL} licen\[cs\]e/"), "/all-rights-reserved notice/"),
]
# A line that describes another project's code or data keeps its licence
# words, even when an earlier rewrite (relicense_fsl.py) gave them our name:
# rewriting it would misstate someone else's licence. A line that also names
# our own product is rewritten as usual.
THIRD_PARTY = re.compile(r"\bproject\b|GitHub (?:copy|file)|hledger|tinydng|csv2ofx|ofxparse|pysyncon|DeltaCFO"
                         r"|MoneyChat|written by someone else|\bupstream\b|fetched at run time"
                         r"|photos-import-tools", re.I)
OWN = re.compile(r"oss-monorepo|marisstella|Maris Stella|\bour own\b|this tool|this repository"
                 r"|ShootFlow is|IDS Model Check is|Free to use and source|It is source available", re.I)
# Spans lines, so it runs on the whole text after the line rewrites.
LICENCE_HEADING = re.compile(rf"^(## Licen[cs]e\s*\n+){FSL}\b", re.M)
PKG_LICENSE = re.compile(r'^(\s*"license":\s*)"FSL-1\.1-MIT"', re.M)
RESIDUE = re.compile(r"FSL|Functional Source|open[- ]source|self-host|host it yourself|run your own|MIT licen",
                     re.I)

TEXT_EXT = {".html", ".htm", ".md", ".txt", ".mjs", ".js", ".cjs", ".ts", ".tsx",
            ".jsx", ".json", ".toml", ".yaml", ".yml", ".py", ".xml", ".webmanifest"}
LICENSE_NAMES = {"LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md"}
SKIP_DIRS = ("node_modules/", "/vendor/", "/third_party/", "/eval/", "/fixtures/", "/samples/",
             "sales-export-to-journal/engines/")  # engines: byte copies of free tools (copy-engines.mjs)
SKIP_FILES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "third_party.json", "THIRD_PARTY.md",
              "PROVENANCE.md", "paddle.mjs"}  # paddle.mjs: a byte copy of platform/billing/client.mjs (sync.mjs)


def products() -> list[str]:
    data = json.loads((HERE / "transition.json").read_text(encoding="utf-8"))
    return [p["venture"] for p in data["proprietary"]]


def tracked(root: Path, slugs: list[str]) -> list[str]:
    out = subprocess.run(["git", "-C", str(root), "ls-files", "-z", "--", *[f"ventures/{s}" for s in slugs]],
                         capture_output=True, check=True)
    return [p for p in out.stdout.decode().split("\0") if p]


def in_scope(rel: str) -> bool:
    if any(s in "/" + rel for s in SKIP_DIRS):
        return False
    return os.path.basename(rel) not in SKIP_FILES


def relicense_file(text: str) -> str | None:
    """The notice for one of our own FSL licence files; None for anything else."""
    if not FSL_HEAD.match(text):
        return None
    m = FSL_NOTICE.search(text)
    if not m or not any(o in m.group(2) for o in OWNERS):
        return None
    year, holder = m.group(1), m.group(2).strip()
    body = ARR_FIRST.sub("", TEMPLATE.read_text(encoding="utf-8"), count=1)
    return f"Copyright (c) {year} {holder}. All rights reserved.\n" + body


def _about_someone_else(line: str) -> bool:
    return bool(THIRD_PARTY.search(line)) and not OWN.search(line)


def rewrite_text(text: str, rel: str) -> str:
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if _about_someone_else(line):
            continue
        for pat, repl in REWRITES:
            line = pat.sub(repl, line)
        lines[i] = line
    text = LICENCE_HEADING.sub(r"\1All rights reserved", "\n".join(lines))
    if os.path.basename(rel) == "package.json":
        text = PKG_LICENSE.sub(rf'\1"{SPDX_ID}"', text)
    return text


def _read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def plan(root: Path, slugs: list[str]) -> dict[str, str]:
    changes: dict[str, str] = {}
    for rel in tracked(root, slugs):
        if not in_scope(rel):
            continue
        base = os.path.basename(rel)
        if base in LICENSE_NAMES:
            text = _read(root / rel)
            new = relicense_file(text) if text is not None else None
            if new is not None and new != text:
                changes[rel] = new
            continue
        if os.path.splitext(base)[1].lower() not in TEXT_EXT:
            continue
        text = _read(root / rel)
        if text is None or ("FSL" not in text and "ource available" not in text
                            and "ource-available" not in text and "Functional Source" not in text):
            continue
        new = rewrite_text(text, rel)
        if new != text:
            changes[rel] = new
    return changes


def residue(root: Path, slugs: list[str]) -> list[str]:
    out = []
    for rel in tracked(root, slugs):
        if not in_scope(rel) or os.path.basename(rel) in LICENSE_NAMES:
            continue
        if os.path.splitext(rel)[1].lower() not in TEXT_EXT:
            continue
        text = _read(root / rel)
        if text is None:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if RESIDUE.search(line):
                out.append(f"{rel}:{n}: {line.strip()[:200]}")
    return out


def main(argv: list[str]) -> int:
    flags = [a for a in argv if a.startswith("--")]
    slugs = [a for a in argv if not a.startswith("--")] or products()
    unknown = sorted(set(slugs) - set(products()))
    if unknown:
        print(f"not in the proprietary track: {', '.join(unknown)}", file=sys.stderr)
        return 2
    if "--residue" in flags:
        for line in residue(ROOT, slugs):
            print(line)
        return 0
    changes = plan(ROOT, slugs)
    if "--check" in flags:
        for rel in sorted(changes):
            print(rel)
        return 1 if changes else 0
    for rel, text in changes.items():
        (ROOT / rel).write_text(text, encoding="utf-8")
    print(f"relicensed or rewrote {len(changes)} files in {len(slugs)} product(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
