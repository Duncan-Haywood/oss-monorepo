#!/usr/bin/env python3
"""Fail when a tracked text file gains a hidden or reordering Unicode character.

Why this exists
---------------
This repository is public, takes pull requests from forks, and is read by
coding agents that act on what its Markdown says. Two published attacks fit
that shape exactly:

* **Trojan Source** (Boucher and Anderson, "Trojan Source: Invisible
  Vulnerabilities", USENIX Security 2023; CVE-2021-42574): bidirectional
  control characters (U+202A to U+202E, U+2066 to U+2069) reorder how a line
  is *displayed* without changing what a compiler or an agent *reads*, so a
  reviewer approves one thing and the machine runs another.
* **Invisible prompt injection**: Unicode Tag characters (U+E0000 to
  U+E007F) spell ASCII text that renders as nothing, and zero-width
  characters split words so a keyword filter misses them. Since 2024 both
  have been documented as ways to hide an instruction, in a file an agent
  will read, from the person reviewing it ("ASCII smuggling";
  `ventures/hidden-unicode-check/README.md` has the background).

Variation selectors are left out on purpose: emoji use U+FE0F on nearly
every line that has one, and the ratchet would be noise.

A scan of all 67,712 tracked text files on 2026-11-18 found 355 that carry
one of these characters, and every one was deliberate: test fixtures for the
scanners and readers that handle them, a byte-order mark at the start of a
real-world XML sample, Persian text that needs U+200C, emoji sequences that
need U+200D. One was accidental, a soft hyphen in
`ventures/claude-code-hooks-security-check/README.md`, removed in the same
change. So the check is a ratchet, like `check_csv_formula_guard.py`:

* `hidden_unicode_baseline.txt` lists each file that may carry these
  characters and how many. A new file, or a higher count, fails.
* Agent-instruction and control-plane paths (`CLAUDE.md`, `AGENTS.md`,
  `prompt.md`, `prompts/`, `.github/`, `.claude/` and the like) can never be
  baselined: any hit there fails, because those are the files an agent obeys.
  Fixture trees (`/fixtures/`, `/testdata/`) are exempt from that rule only.
* A few uses are never findings: a byte-order mark as a file's first
  character, U+200D joining two emoji, U+200C or U+200D inside Arabic,
  Persian or Indic script, and a Tag sequence that completes a subdivision
  flag (U+1F3F4 ... U+E007F).

To put one of these characters in source on purpose, prefer an escape
(`\\u200b` in JavaScript or Python) to the literal: the escape is visible in a
diff, the literal is not. That is also how this file names them.

Run it the way CI would:

    python3 platform/ci/check_hidden_unicode.py            # ratchet
    python3 platform/ci/check_hidden_unicode.py --list     # every finding
    python3 platform/ci/check_hidden_unicode.py --write-baseline
    python3 platform/ci/check_hidden_unicode.py FILE...    # just these files
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from repo_files import ls_files

REPO_ROOT = Path(__file__).resolve().parents[2]
BASELINE = Path(__file__).with_name("hidden_unicode_baseline.txt")

# Each class names a reason a reviewer would want to know.
CLASSES: dict[int, str] = {}
for _cp in (*range(0x202A, 0x202F), *range(0x2066, 0x206A)):
    CLASSES[_cp] = "bidi-control"
for _cp in (0x200E, 0x200F, 0x061C):
    CLASSES[_cp] = "bidi-mark"
for _cp in (0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF):
    CLASSES[_cp] = "zero-width"
for _cp in (0x2061, 0x2062, 0x2063, 0x2064):
    CLASSES[_cp] = "invisible-operator"
for _cp in (0x115F, 0x1160, 0x3164, 0xFFA0, 0x180E, 0x034F):
    CLASSES[_cp] = "blank-filler"
CLASSES[0x00AD] = "soft-hyphen"
for _cp in range(0xE0000, 0xE0080):
    CLASSES[_cp] = "tag"
# The rest of Unicode's Default_Ignorable_Code_Point that renders as nothing
# and has no everyday use (variation selectors stay out: emoji need them).
# Found by diffing ventures/hidden-unicode-check against the UCD, 2026-11-20.
for _cp in (0x17B4, 0x17B5, 0x180B, 0x180C, 0x180D, 0x180F,
            *range(0x206A, 0x2070), *range(0x1BCA0, 0x1BCA4), *range(0x1D173, 0x1D17B)):
    CLASSES[_cp] = "format-control"
for _cp in (0x2065, *range(0xFFF0, 0xFFF9), *range(0xE0080, 0xE0100), *range(0xE01F0, 0xE1000)):
    CLASSES[_cp] = "reserved-ignorable"

PATTERN = re.compile(
    "[\u202a-\u202e\u2066-\u2069\u200b-\u200f\u061c\u2060-\u2064\ufeff"
    "\u115f\u1160\u3164\uffa0\u180e\u034f\u00ad\U000e0000-\U000e007f"
    "\u17b4\u17b5\u180b-\u180d\u180f\u2065-\u206f\ufff0-\ufff8"
    "\U0001bca0-\U0001bca3\U0001d173-\U0001d17a\U000e0080-\U000e00ff\U000e01f0-\U000e0fff]"
)

# Files an agent loads as instructions, or that steer CI and the agents'
# own tooling. Mirrors the spirit of .github/CODEOWNERS.
PROTECTED = re.compile(
    r"""^(
        CLAUDE\.md | AGENTS\.md | prompt\.md | IDEAS\.md | \.mcp\.json
      | \.github/ | \.claude/ | \.cursor/ | platform/agents/
      | prompts/(?!runs/)
    )
    | (^|/)(CLAUDE\.md|AGENTS\.md|\.cursorrules|copilot-instructions\.md)$
    """,
    re.X,
)
FIXTURE = re.compile(r"(^|/)(fixtures|testdata)/")

# Scripts whose spelling uses U+200C / U+200D (ZWNJ / ZWJ) as letters' joiners.
JOINING_SCRIPTS = (
    (0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF),  # Arabic, Persian
    (0x0900, 0x0DFF),  # Devanagari through Sinhala
    (0xFB50, 0xFDFF), (0xFE70, 0xFEFC),  # Arabic presentation forms
)


def _in(cp: int, ranges) -> bool:
    return any(lo <= cp <= hi for lo, hi in ranges)


def _pictographic(ch: str) -> bool:
    cp = ord(ch)
    return (
        0x1F000 <= cp <= 0x1FAFF
        or 0x2600 <= cp <= 0x27BF
        or cp in (0xFE0F, 0x2640, 0x2642, 0x2695, 0x2696, 0x2708, 0x2764)
        or 0x1F3FB <= cp <= 0x1F3FF  # skin tones
    )


def benign(text: str, i: int) -> bool:
    """True when the character at text[i] is doing a legitimate job."""
    cp = ord(text[i])
    prev = text[i - 1] if i else ""
    nxt = text[i + 1] if i + 1 < len(text) else ""
    if cp == 0xFEFF and i == 0:
        return True
    if cp == 0x200D and prev and nxt and _pictographic(prev) and _pictographic(nxt):
        return True
    if cp in (0x200C, 0x200D) and prev and _in(ord(prev), JOINING_SCRIPTS):
        return True
    if 0xE0020 <= cp <= 0xE007F:
        # A subdivision flag: U+1F3F4, tag letters, U+E007F cancel tag.
        j = i
        while j > 0 and 0xE0020 <= ord(text[j - 1]) <= 0xE007E:
            j -= 1
        if j > 0 and ord(text[j - 1]) == 0x1F3F4:
            k = i
            while k < len(text) and 0xE0020 <= ord(text[k]) <= 0xE007E:
                k += 1
            return k < len(text) and ord(text[k]) == 0xE007F
    return False


def findings_in_text(text: str) -> list[tuple[int, int, int, str]]:
    """(line, column, codepoint, class) for each suspicious character."""
    if text.isascii():
        return []
    out = []
    for m in PATTERN.finditer(text):
        i = m.start()
        if benign(text, i):
            continue
        line = text.count("\n", 0, i) + 1
        col = i - (text.rfind("\n", 0, i) + 1) + 1
        cp = ord(m.group())
        out.append((line, col, cp, CLASSES[cp]))
    return out


def read_text(path: Path) -> str | None:
    """The file as text, or None for binary and non-UTF-8 files."""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if b"\0" in data[:8192]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def tracked_files(root: Path) -> list[str]:
    return ls_files(root)


def scan(root: Path, names: list[str]) -> dict[str, list[tuple[int, int, int, str]]]:
    found = {}
    for name in names:
        text = read_text(root / name)
        if text is None:
            continue
        hits = findings_in_text(text)
        if hits:
            found[name] = hits
    return found


def protected(name: str) -> bool:
    return bool(PROTECTED.search(name)) and not FIXTURE.search(name)


def read_baseline(path: Path) -> Counter:
    allowed: Counter = Counter()
    if not path.exists():
        return allowed
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        count, _, name = line.partition("\t")
        allowed[name] = int(count)
    return allowed


def write_baseline(path: Path, found: dict) -> int:
    rows = sorted((n, len(h)) for n, h in found.items() if not protected(n))
    header = (
        "# Files allowed to carry hidden or bidi Unicode (check_hidden_unicode.py).\n"
        "# count<TAB>path. Ratchet: lower or delete a line when you remove one;\n"
        "# raise or add one only for a deliberate test fixture or scanner.\n"
    )
    path.write_text(header + "".join(f"{c}\t{n}\n" for n, c in rows), encoding="utf-8")
    return len(rows)


def describe(cp: int) -> str:
    return unicodedata.name(chr(cp), f"U+{cp:04X}")


def compare(found: dict, allowed: Counter) -> tuple[list[str], list[str]]:
    """(failures, stale baseline lines)."""
    failures, stale = [], []
    for name, hits in sorted(found.items()):
        if protected(name):
            for line, col, cp, cls in hits:
                failures.append(
                    f"{name}:{line}:{col}: U+{cp:04X} {describe(cp)} ({cls}) in an "
                    "agent-instruction or control-plane file; remove it."
                )
        elif len(hits) > allowed.get(name, 0):
            line, col, cp, cls = hits[0]
            failures.append(
                f"{name}: {len(hits)} hidden or bidi characters, baseline allows "
                f"{allowed.get(name, 0)}; first at {line}:{col}: U+{cp:04X} "
                f"{describe(cp)} ({cls}). Remove it, or write it as an escape."
            )
    for name, count in sorted(allowed.items()):
        have = len(found.get(name, []))
        if have < count:
            stale.append(f"{name}: baseline allows {count}, file has {have}; lower the line.")
    return failures, stale


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="*", help="check only these (default: every tracked file)")
    ap.add_argument("--root", type=Path, default=REPO_ROOT)
    ap.add_argument("--baseline", type=Path, default=BASELINE)
    ap.add_argument("--write-baseline", action="store_true")
    ap.add_argument("--list", action="store_true", help="print every finding and exit 0")
    a = ap.parse_args(argv)

    names = a.files or tracked_files(a.root)
    found = scan(a.root, names)

    if a.list:
        for name, hits in sorted(found.items()):
            for line, col, cp, cls in hits:
                print(f"{name}:{line}:{col}: U+{cp:04X} {describe(cp)} ({cls})")
        print(f"{sum(map(len, found.values()))} findings in {len(found)} of {len(names)} files")
        return 0
    if a.write_baseline:
        n = write_baseline(a.baseline, found)
        print(f"wrote {n} entries to {a.baseline}")
        return 0

    allowed = read_baseline(a.baseline)
    failures, stale = compare(found, allowed)
    if a.files:  # a partial run cannot judge the rest of the baseline
        stale = []
    for msg in failures:
        print(msg)
    for msg in stale:
        print(msg)
    if failures or stale:
        return 1
    print(
        f"hidden unicode: ok ({len(names)} files, {len(found)} on the baseline "
        "for deliberate fixtures and scanners)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
