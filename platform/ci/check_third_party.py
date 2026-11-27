#!/usr/bin/env python3
"""Fail when third-party code, data or licence text enters the tree unrecorded.

Why this exists
---------------
"Only code we can relicense" is one of the hard limits in
`prompts/goals.md`: everything original here is the repository owner's
copyright, under FSL-1.1-MIT (MIT for `research/` and for work done before
2026-11-24), and anything that is not original keeps its own licence
and its notice. Until this check there was no machine guard for that line at
all. The repository holds 1,459 licence files, and about 40 of them belong to
someone else (Apache-2.0 email corpora, an MIT XPath engine bundled into a
browser page, EUPL and MPL Schematron rules, CC BY 4.0 grid data, a BSD-3
brand list). Each one was added by hand, with care, by a session that knew
the rule. The next one might not be.

So the check finds every *signal* that a file came from somewhere else, and
asks that each one is covered by an entry in `third_party.json`, the
inventory that also renders as `THIRD_PARTY.md` at the repository root.

Signals
-------
* **licence file**: a file named like `LICENSE`, `LICENCE-x.md`,
  `COPYING`, `NOTICE` or `x.LICENSE.txt` that is not the owner's own MIT or
  FSL-1.1-MIT licence (its copyright line names a holder outside
  `owner_holders`, or its text is neither);
* **copyright line** in source code (`.js`, `.py`, `.rs` and the like) whose
  holder is not one of `owner_holders`;
* **SPDX-License-Identifier** in source code naming anything but MIT or
  FSL-1.1-MIT;
* **licence banner** in source code: the opening words of the GPL family,
  Apache-2.0, MPL, EPL, EUPL, BUSL, SSPL or a Creative Commons non-commercial
  licence;
* **bundle**: a JavaScript or CSS file with a line over 5,000 characters
  that is not a JSON-like data literal (minified code is almost always
  someone else's library).

Prose (`.md`, `.html`, `.txt`, `.json`, `.yaml`) is not scanned for the
last four: posts and READMEs discuss licences all the time.

Each inventory entry names `paths` (globs), an SPDX `license` expression,
the `source` and where the `notice` lives. The check also fails when

* an entry's globs match no tracked file (stale entry);
* its `notice` file is missing;
* its licence is strong copyleft or non-commercial (GPL, AGPL, SSPL, BUSL,
  any `-NC`) and the entry carries no `copyleft_ok` reason. Weak or
  file-level copyleft (LGPL, MPL, EUPL, EPL) also needs one: the files stay
  under their own licence, and the reason says why that is fine here.

Usage::

    python3 platform/ci/check_third_party.py            # check, exit 1 on a finding
    python3 platform/ci/check_third_party.py --signals  # list every signal and its entry
    python3 platform/ci/check_third_party.py --write-md # regenerate THIRD_PARTY.md
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import sys
from dataclasses import dataclass
from repo_files import ls_files

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
INVENTORY = os.path.join(ROOT, "platform", "ci", "third_party.json")
MARKDOWN = os.path.join(ROOT, "THIRD_PARTY.md")

# `LICENSE`, `licence.txt`, `COPYING`, `NOTICE`, `LICENSE-talon`, and the
# upper-case suffix form `BLAKEJS-LICENSE`, `fontoxpath.LICENSE.txt`. The
# suffix form is case-sensitive so a post named `...-the-irs-notice.md` is not
# a licence file.
LICENSE_NAME = re.compile(
    r"^(?:(?i:LICEN[CS]E|COPYING|NOTICE|COPYRIGHT)(?:[-._][^/]*)?"
    r"|[^/]*[-._](?:LICEN[CS]E|COPYING|NOTICE)(?:\.(?i:txt|md|rst))?)$"
)
LICENSE_EXT = {"", ".txt", ".md", ".rst"}
CODE_EXT = {
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".rs", ".go", ".java",
    ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".rb", ".php", ".swift", ".kt",
    ".sh", ".css", ".scss", ".sol", ".v", ".sv", ".lua", ".r", ".jl", ".m",
}
BUNDLE_EXT = {".js", ".mjs", ".cjs", ".css"}
BUNDLE_LINE = 5000

# A copyright statement: "Copyright (c) 2020 Holder", "Copyright 2004-2026
# Holder", "© 2019 Holder". The holder is what follows the years.
COPYRIGHT = re.compile(
    r"(?:Copyright\s*(?:\(c\)|©)?|©)\s*((?:\d{4}(?:\s*[-–,]\s*\d{4})*,?\s*)+)([^\n*]*)",
    re.IGNORECASE,
)
SPDX = re.compile(r"SPDX-License-Identifier:\s*([A-Za-z0-9.+\- ()]+)")
BANNERS = [
    ("GPL family", re.compile(r"GNU (?:Affero |Lesser |Library )?General Public License")),
    ("Apache-2.0", re.compile(r"Licensed under the Apache License")),
    ("MPL-2.0", re.compile(r"Mozilla Public License")),
    ("EPL", re.compile(r"Eclipse Public License")),
    ("EUPL", re.compile(r"European Union Public Licen[cs]e")),
    ("BUSL", re.compile(r"Business Source License")),
    ("SSPL", re.compile(r"Server Side Public License")),
    ("CC non-commercial", re.compile(r"Attribution-NonCommercial|CC[ -]BY-NC")),
]
# Necessary conditions for COPYRIGHT and the non-commercial banner, much
# cheaper to search a whole file for (perf, 2026-11-20): COPYRIGHT's
# case-insensitive alternation gets no literal prefix, so `re` tries it at
# every character (2.6 s over the 190 MB of tracked code); this word alone is
# 1.1 s, and the two literals of the CC banner are found by `in`.
COPYRIGHT_WORD = re.compile(r"copyright", re.IGNORECASE)
PREFILTERS = {"CC non-commercial": lambda text: "Attribution-NonCommercial" in text or "BY-NC" in text}
MIT_TEXT = re.compile(r"Permission is hereby granted, free of charge", re.IGNORECASE)
# The owner's licence for new work since 2026-11-24 (portfolio/monetization/
# relicense_fsl.py). Its MIT future grant also matches MIT_TEXT, so a file is
# told apart by this heading.
FSL_TEXT = re.compile(r"^# Functional Source License, Version 1\.1, MIT Future License", re.MULTILINE)
# The owner's notice for the paid products since 2026-11-26 (portfolio/
# monetization/relicense_arr.py): all rights reserved, no licence granted.
ARR_TEXT = re.compile(r"All rights reserved\.[\s\S]*Publishing it\s+grants no licence\.")
OWNER_SPDX = {"MIT", "FSL-1.1-MIT", "LicenseRef-AllRightsReserved"}

STRONG = re.compile(r"\b(?:A?GPL|SSPL|BUSL)|-NC\b|NonCommercial", re.IGNORECASE)
WEAK = re.compile(r"\b(?:LGPL|MPL|EUPL|EPL|CDDL)", re.IGNORECASE)


@dataclass(frozen=True)
class Signal:
    path: str
    kind: str
    detail: str
    line: int = 0


def tracked_files(root: str) -> list[str]:
    return ls_files(root)


def read_text(path: str, limit: int = 4_000_000) -> str | None:
    try:
        with open(path, "rb") as fh:
            raw = fh.read(limit)
    except OSError:
        return None
    if b"\0" in raw[:8192]:
        return None
    return raw.decode("utf-8", "replace")


def holder_is_owner(holder: str, owners: list[str]) -> bool:
    h = holder.lower()
    return any(o.lower() in h for o in owners)


def clean_holder(raw: str) -> str:
    h = re.sub(r"\s+", " ", raw).strip(" .,;:)\"'")
    h = re.sub(r"^(?:by|the)\s+", "", h, flags=re.IGNORECASE)
    return h[:80]


CODE_WORDS = re.compile(r"\b(?:function|return|var|let|const|this|new|if|for|while|typeof|void)\b")


def is_data_literal(line: str) -> bool:
    """A long line with almost no code keywords is data (numbers, strings,
    base64, a regex alternation), not a minified library. Minified code from
    esbuild or terser runs at 10 to 40 keywords per 1,000 characters; the
    data modules in this tree run below 0.5."""
    sample = line[:50000]
    return len(CODE_WORDS.findall(sample)) * 1000 < 2 * len(sample)


def scan_file(rel: str, text: str, owners: list[str]) -> list[Signal]:
    base = os.path.basename(rel)
    ext = os.path.splitext(base)[1].lower()
    signals: list[Signal] = []

    if ext in LICENSE_EXT and LICENSE_NAME.match(base):
        holders = [clean_holder(m.group(2)) for m in COPYRIGHT.finditer(text[:6000])]
        holders = [h for h in holders if h]
        fsl = bool(FSL_TEXT.search(text))
        arr = not fsl and bool(ARR_TEXT.search(text))
        mit = fsl or arr or bool(MIT_TEXT.search(text))
        if not (mit and holders and all(holder_is_owner(h, owners) for h in holders)):
            who = ", ".join(holders) if holders else "no copyright line"
            kind = "FSL-1.1-MIT" if fsl else "all rights reserved" if arr else "MIT" if mit else "not MIT"
            signals.append(Signal(rel, "licence file", f"{kind}; {who}"))
        return signals

    if ext not in CODE_EXT:
        return signals

    # One search of the whole text per pattern says which can match a line at
    # all (perf, 2026-11-20: nine searches on each of 3.6 M lines were 11 s of
    # this check's 11.6). None of them can match across a line break (no \s,
    # no anchors), so a line's match is a match in the text: a pattern the text
    # lacks finds nothing on any line, and the signals are the same.
    copyright = ("©" in text or COPYRIGHT_WORD.search(text) is not None) and COPYRIGHT.search(text) is not None
    spdx = SPDX.search(text) is not None
    banners = [(name, pat) for name, pat in BANNERS
               if PREFILTERS.get(name, bool)(text) and pat.search(text)]
    if not (copyright or spdx or banners or ext in BUNDLE_EXT):
        return signals

    for lineno, line in enumerate(text.splitlines(), 1):
        if len(line) > BUNDLE_LINE:
            if ext in BUNDLE_EXT and not is_data_literal(line):
                signals.append(Signal(rel, "bundle", f"line of {len(line):,} characters", lineno))
            continue
        for m in (COPYRIGHT.finditer(line) if copyright else ()):
            # A copyright string inside a quoted literal is data the program
            # prints or checks ("© 2026 Name", an ICC profile tag), not a notice.
            if m.start() > 0 and line[m.start() - 1] in "\"'`":
                continue
            holder = clean_holder(m.group(2))
            if not holder or holder_is_owner(holder, owners):
                continue
            # Template literals and format strings that print a copyright
            # line for the user's own document are not a notice.
            if re.search(r"\$\{|\{\w*\}|%s|\+\s*$", holder):
                continue
            signals.append(Signal(rel, "copyright", holder, lineno))
        m = SPDX.search(line) if spdx else None
        if m:
            ident = m.group(1).strip()
            if ident and ident not in OWNER_SPDX:
                signals.append(Signal(rel, "spdx", ident, lineno))
        for name, pat in banners:
            if pat.search(line):
                signals.append(Signal(rel, "banner", name, lineno))
    return signals


def scan(root: str, files: list[str], owners: list[str]) -> list[Signal]:
    found: list[Signal] = []
    for rel in files:
        base = os.path.basename(rel)
        ext = os.path.splitext(base)[1].lower()
        if not (ext in CODE_EXT or (ext in LICENSE_EXT and LICENSE_NAME.match(base))):
            continue
        text = read_text(os.path.join(root, rel))
        if text is None:
            continue
        found.extend(scan_file(rel, text, owners))
    return found


def load_inventory(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def matches(rel: str, globs: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(rel, g) for g in globs)


def entry_for(rel: str, entries: list[dict]) -> dict | None:
    for e in entries:
        if matches(rel, e.get("paths", [])):
            return e
    return None


def check(root: str, files: list[str], inventory: dict) -> tuple[list[str], list[tuple[Signal, dict | None]]]:
    owners = inventory.get("owner_holders", [])
    entries = inventory.get("entries", [])
    ignore = inventory.get("not_third_party", [])
    problems: list[str] = []
    pairs: list[tuple[Signal, dict | None]] = []

    for s in scan(root, files, owners):
        if entry_for(s.path, ignore):
            continue
        e = entry_for(s.path, entries)
        pairs.append((s, e))
        if e is None:
            where = f"{s.path}:{s.line}" if s.line else s.path
            problems.append(
                f"{where}: {s.kind} ({s.detail}) is not in platform/ci/third_party.json"
            )

    tracked = set(files)
    for group in ("entries", "not_third_party"):
        for e in inventory.get(group, []):
            name = e.get("name", "?")
            for g in e.get("paths", []):
                # fnmatchcase(f, g) is this compiled match; calling it directly
                # skips a cache lookup per file (1.7 M calls, 1.3 s).
                match = re.compile(fnmatch.translate(g)).match
                if not any(match(f) for f in files):
                    problems.append(f"{group} '{name}': glob {g!r} matches no tracked file (stale?)")
            if group == "not_third_party":
                if not e.get("why"):
                    problems.append(f"not_third_party '{name}': give a `why`")
                continue
            for field in ("license", "source", "notice"):
                if not e.get(field):
                    problems.append(f"entry '{name}': missing `{field}`")
            notice = e.get("notice", "")
            if notice and notice != "inline" and notice not in tracked:
                problems.append(f"entry '{name}': notice file {notice!r} is not tracked")
            lic = e.get("license", "")
            if (STRONG.search(lic) or WEAK.search(lic)) and not e.get("copyleft_ok"):
                problems.append(
                    f"entry '{name}': {lic} is copyleft or non-commercial; add `copyleft_ok` with the reason it may sit here"
                )
    return problems, pairs


def render_markdown(inventory: dict) -> str:
    lines = [
        "# Third-party material in this repository",
        "",
        "Everything original in this repository is the owner's copyright, under",
        "FSL-1.1-MIT (`LICENSE`; `research/` and work before 2026-11-24 are MIT).",
        "The files below are not original: each keeps its own licence and notice,",
        "and is listed here so a reader, a fork or a packager can see the",
        "exceptions in one place.",
        "",
        "This page is generated from `platform/ci/third_party.json` by",
        "`python3 platform/ci/check_third_party.py --write-md`; the same script fails",
        "CI when a licence file, copyright line, licence banner or minified bundle",
        "from someone else appears without an entry.",
        "",
        "| What | Licence | Paths | Source | Notice |",
        "| --- | --- | --- | --- | --- |",
    ]
    for e in sorted(inventory.get("entries", []), key=lambda e: e["paths"][0]):
        paths = "<br>".join(f"`{p}`" for p in e["paths"])
        notice = "in the file" if e["notice"] == "inline" else f"`{e['notice']}`"
        src = e["source"].replace("|", "\\|")
        lines.append(f"| {e['name']} | {e['license']} | {paths} | {src} | {notice} |")
    lines.append("")
    notes = [e for e in inventory.get("entries", []) if e.get("copyleft_ok")]
    if notes:
        lines += ["## Copyleft and non-commercial material, and why it may sit here", ""]
        for e in sorted(notes, key=lambda e: e["name"]):
            lines.append(f"- **{e['name']}** ({e['license']}): {e['copyleft_ok']}")
        lines.append("")
    lines += [
        "This list is kept honestly but is not legal advice. If you find a file that",
        "should be here and is not, please open an issue.",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=ROOT)
    ap.add_argument("--inventory", default=None)
    ap.add_argument("--signals", action="store_true", help="list every signal and the entry covering it")
    ap.add_argument("--write-md", action="store_true", help="regenerate THIRD_PARTY.md")
    args = ap.parse_args(argv)

    inv_path = args.inventory or os.path.join(args.root, "platform", "ci", "third_party.json")
    inventory = load_inventory(inv_path)
    files = tracked_files(args.root)
    problems, pairs = check(args.root, files, inventory)

    md_path = os.path.join(args.root, "THIRD_PARTY.md")
    md = render_markdown(inventory)
    if args.write_md:
        with open(md_path, "w", encoding="utf-8") as fh:
            fh.write(md)
        print(f"wrote {os.path.relpath(md_path, args.root)}")
    else:
        try:
            with open(md_path, encoding="utf-8") as fh:
                if fh.read() != md:
                    problems.append("THIRD_PARTY.md is out of date: run with --write-md")
        except FileNotFoundError:
            problems.append("THIRD_PARTY.md is missing: run with --write-md")

    if args.signals:
        for s, e in pairs:
            where = f"{s.path}:{s.line}" if s.line else s.path
            print(f"{where}\t{s.kind}\t{s.detail}\t-> {e['name'] if e else 'UNRECORDED'}")

    entries = len(inventory.get("entries", []))
    if problems:
        for p in problems:
            print(p)
        print(f"\n{len(problems)} problem(s); {len(pairs)} signal(s), {entries} inventory entries.")
        return 1
    print(f"third-party check: {len(pairs)} signal(s) in {len(files):,} tracked files, all covered by {entries} entries.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
