#!/usr/bin/env python3
"""Move this repository's original work from MIT to FSL-1.1-MIT.

Owner, 2026-11-24: "I want to do the change to a more restrictive license",
choosing a source-available licence for the public repository. The
Functional Source License 1.1 (MIT future licence) lets anyone read, run,
modify and redistribute the code for any purpose except a Competing Use (a
commercial product or service that substitutes for it), and every version
becomes MIT two years after it is published. Why this licence, and what it
cannot change: `portfolio/monetization/LICENSING_TRANSITION.md`.

What the script does, idempotently (run it again and nothing changes):

1. Every licence file whose text is the owner's MIT licence (copyright held by
   Duncan Haywood or Maris Stella Labs) is replaced by the FSL-1.1-MIT text
   (`FSL_TEXT`, verbatim from fsl.software and the SPDX list), keeping its
   copyright holder. Third-party licence files are never touched.
2. Our own statements that the code is MIT or "open source" (page footers,
   llms.txt, READMEs, FAQ JSON-LD, our own package.json `license` fields and
   the page tests that assert the licence) are rewritten to say FSL-1.1-MIT
   and "source available". Only the exact phrasings listed in `REWRITES` are
   touched, so a sentence about someone else's open-source project stays.

Left on MIT, on purpose:

* `research/`: built to be cited and reproduced (`research/CLAUDE.md`).
* Website-request results from outside requesters: the intake forms promise
  MIT. None exist yet (R-0001..R-0005 are the owner's own asks); a later one
  ships with an MIT `LICENSE` in its own directory.
* Third-party code, data and lockfiles: they keep their own licences.

Usage: python3 portfolio/monetization/relicense_fsl.py [--check]
(`--check` exits 1 and lists files when something still needs rewriting.)
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNERS = ("Duncan Haywood", "Maris Stella Labs")
SPDX_ID = "FSL-1.1-MIT"

FSL_TEXT = """# Functional Source License, Version 1.1, MIT Future License

## Abbreviation

FSL-1.1-MIT

## Notice

Copyright (c) {year} {holder}

## Terms and Conditions

### Licensor ("We")

The party offering the Software under these Terms and Conditions.

### The Software

The "Software" is each version of the software that we make available under
these Terms and Conditions, as indicated by our inclusion of these Terms and
Conditions with the Software.

### License Grant

Subject to your compliance with this License Grant and the Patents,
Redistribution and Trademark clauses below, we hereby grant you the right to
use, copy, modify, create derivative works, publicly perform, publicly display
and redistribute the Software for any Permitted Purpose identified below.

### Permitted Purpose

A Permitted Purpose is any purpose other than a Competing Use. A Competing Use
means making the Software available to others in a commercial product or
service that:

1. substitutes for the Software;

2. substitutes for any other product or service we offer using the Software
   that exists as of the date we make the Software available; or

3. offers the same or substantially similar functionality as the Software.

Permitted Purposes specifically include using the Software:

1. for your internal use and access;

2. for non-commercial education;

3. for non-commercial research; and

4. in connection with professional services that you provide to a licensee
   using the Software in accordance with these Terms and Conditions.

### Patents

To the extent your use for a Permitted Purpose would necessarily infringe our
patents, the license grant above includes a license under our patents. If you
make a claim against any party that the Software infringes or contributes to
the infringement of any patent, then your patent license to the Software ends
immediately.

### Redistribution

The Terms and Conditions apply to all copies, modifications and derivatives of
the Software.

If you redistribute any copies, modifications or derivatives of the Software,
you must include a copy of or a link to these Terms and Conditions and not
remove any copyright notices provided in or with the Software.

### Disclaimer

THE SOFTWARE IS PROVIDED "AS IS" AND WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF FITNESS FOR A PARTICULAR
PURPOSE, MERCHANTABILITY, TITLE OR NON-INFRINGEMENT.

IN NO EVENT WILL WE HAVE ANY LIABILITY TO YOU ARISING OUT OF OR RELATED TO THE
SOFTWARE, INCLUDING INDIRECT, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES,
EVEN IF WE HAVE BEEN INFORMED OF THEIR POSSIBILITY IN ADVANCE.

### Trademarks

Except for displaying the License Details and identifying us as the origin of
the Software, you have no right under these Terms and Conditions to use our
trademarks, trade names, service marks or product names.

## Grant of Future License

We hereby irrevocably grant you an additional license to use the Software under
the MIT license that is effective on the second anniversary of the date we make
the Software available. On or after that date, you may use the Software under
the MIT license, in which case the following will apply:

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

MIT_HEAD = re.compile(
    r"\A\s*(?:The )?MIT License\s+Copyright \(c\) (\d{4}(?:-\d{4})?) ([^\n]+?)\s*\n"
    r"\s*Permission is hereby granted, free of charge",
)

# Ordered: the longer, more specific phrasings first. Each pattern names our
# own code; none of them can match a sentence about a third-party project.
LICENCE = '<a href="LICENSE"'
REWRITES: list[tuple[re.Pattern[str], str]] = [
    # "Open source" claims about our own code. No leading \b: some sit right
    # after a literal "\n" in JavaScript source.
    (re.compile(r"Free and open[- ]source"), "Free to use and source available"),
    (re.compile(r"free and open[- ]source"), "free to use and source available"),
    (re.compile(r"Free, open-source \(MIT\)"), f"Free, source available ({SPDX_ID})"),
    (re.compile(r"free, open-source \(MIT\)"), f"free, source-available ({SPDX_ID})"),
    (re.compile(r"\bopen[- ]source hardware \(MIT\)"), f"source-available hardware ({SPDX_ID})"),
    (re.compile(r"\bopen source \(MIT\)"), f"source available ({SPDX_ID})"),
    # "(MIT)" only where it names our own work; a third-party credit such as
    # "as published by ggplot2 (MIT)" keeps its licence.
    (re.compile(r"(source available|>Source|manufacturing package|written for this tool|IDS Model Check"
                r"|changepoint-detector/) \(MIT\)"), rf"\1 ({SPDX_ID})"),
    (re.compile(r"\(MIT, see `LICENSE`\)"), f"({SPDX_ID}, see `LICENSE`)"),
    (re.compile(r"\bunder an MIT licen([cs])e\b"), rf"under the {SPDX_ID} licen\1e"),
    (re.compile(r"\bunder the MIT licen([cs])e\b"), rf"under the {SPDX_ID} licen\1e"),
    (re.compile(r"\ban (<a href=\"LICENSE\"[^>]*>)MIT licen([cs])e"), rf"the \1{SPDX_ID} licen\2e"),
    (re.compile(r"(?:\bthe )?(<a href=\"LICENSE\"[^>]*>)MIT licen([cs])e"), rf"the \1{SPDX_ID} licen\2e"),
    (re.compile(r"\ban \[MIT licen([cs])e\]\(LICENSE\)"), rf"the [{SPDX_ID} licen\1e](LICENSE)"),
    (re.compile(r"\[MIT licen([cs])e\]\(LICENSE\)"), rf"[{SPDX_ID} licen\1e](LICENSE)"),
    (re.compile(r"\[MIT\]\(LICENSE\)"), f"[{SPDX_ID}](LICENSE)"),
    (re.compile(r"(<a href=\"LICENSE\"[^>]*>)MIT licensed"), rf"\1{SPDX_ID} licensed"),
    (re.compile(r"(<a href=\"LICENSE\"[^>]*>)MIT</a>"), rf"\1{SPDX_ID}</a>"),
    (re.compile(r"(?<!-)\bMIT licen([cs])e, see `LICENSE`"), rf"{SPDX_ID} licen\1e, see `LICENSE`"),
    (re.compile(r"(?<!-)\bMIT licensed\b"), f"{SPDX_ID} licensed"),
    (re.compile(r"(?<!-)\bMIT-licensed\b"), f"{SPDX_ID}-licensed"),
    (re.compile(r"(?<!-)\bMIT, no warranty\b"), f"{SPDX_ID}, no warranty"),
    (re.compile(r"(?<!-)\bMIT\. See `LICENSE`"), f"{SPDX_ID}. See `LICENSE`"),
    (re.compile(r"\bCode: MIT\b"), f"Code: {SPDX_ID}"),
    (re.compile(r"\bcode is MIT\b"), f"code is {SPDX_ID}"),
    (re.compile(r"^(## Licen[cs]e\s*\n+)MIT\b", re.M), rf"\1{SPDX_ID}"),
    (re.compile(r"(?<!-)\bMIT licen([cs])e\b"), rf"{SPDX_ID} licen\1e"),
    (re.compile(r"(?<!-)\bMIT\. No warranty"), f"{SPDX_ID}. No warranty"),
    (re.compile(r"\b([Ff]ree) and MIT\b"), rf"\1 and {SPDX_ID}"),
    (re.compile(r"Academy</a>\. MIT\b"), f"Academy</a>. {SPDX_ID}"),
    (re.compile(r"https://opensource\.org/licenses/MIT\b"), "https://spdx.org/licenses/FSL-1.1-MIT.html"),
    (re.compile(r"\bfree, open-source <a"), "free, source-available <a"),
    (re.compile(r"\bopen-source (tools you run yourself|portfolio|repo\b)"), r"source-available \1"),
    (re.compile(r"\"description\": \"Open-source "), "\"description\": \"Source-available "),
    (re.compile(r"(// )?is MIT, so this is a convenience"), rf"\1is source available ({SPDX_ID}), so this is a convenience"),
    (re.compile(r"code is under an MIT(\s+)licen([cs])e"), rf"code is under the {SPDX_ID}\1licen\2e"),
    (re.compile(r"\bOpen source, MIT\b"), f"Source available, {SPDX_ID}"),
    (re.compile(r"\bFree, MIT\b"), f"Free, {SPDX_ID}"),
    (re.compile(r"\b(\w+ Keeper) is MIT\b"), rf"\1 is {SPDX_ID}"),
    (re.compile(r"\bfree, private, and open source\b"), "free, private, and source available"),
    (re.compile(r"\b([Tt]he|small|optional) open-source (server|read-only server|signing server|preset file)"),
     r"\1 source-available \2"),
    (re.compile(r"\b([Aa]n) open-source alternative\b"), r"\1 source-available alternative"),
    (re.compile(r"\b([Aa]) free, open-source, self-hosted\b"), r"\1 free, source-available, self-hosted"),
    (re.compile(r"\bFree, open source, self-hosted\b"), "Free, source available, self-hosted"),
    (re.compile(r"/MIT licen\[cs\]e/"), f"/{SPDX_ID} licen[cs]e/"),
    # "FET is free, open source ..." is a third-party desktop program.
    (re.compile(r"(?<!FET is )\b([Ff])ree, open source\b"), r"\1ree, source available"),
    # Page tests that assert the shipped licence.
    (re.compile(r"/MIT License/"), "/Functional Source License/"),
]
PKG_LICENSE = re.compile(r'^(\s*"license":\s*)"MIT"', re.M)

TEXT_EXT = {".html", ".htm", ".md", ".txt", ".mjs", ".js", ".cjs", ".ts", ".tsx",
            ".jsx", ".json", ".toml", ".yaml", ".yml", ".py", ".xml", ".webmanifest", ".svelte", ".vue"}
LICENSE_NAMES = {"LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md"}
SKIP_DIRS = ("research/", "node_modules/", "/vendor/", "/third_party/", "/eval/", "/samples/")
# Files that talk about MIT as their subject (a pyproject licence checker) or
# write a repository the user owns (its template keeps its own licence).
SUBJECT_FILES = ("ventures/pyproject-metadata-check/", "ventures/changepoint-detector/watch-repo-files.mjs",
                 "ventures/liability-audit/audit.test.mjs")
SKIP_FILES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "third_party.json", "THIRD_PARTY.md"}
# Phrase rewrites run only in ventures/ (product pages, their READMEs and
# tests). platform/ also writes research and custom-request pages, which stay
# MIT, so its generators were edited by hand, as were README.md and docs/.
REWRITE_ROOTS = ("ventures/",)
# Text the rewrites must not touch even inside our own trees: the history of
# what the licence was (posts and decision records), and this script.
SKIP_PREFIXES = ("docs/posts/", "docs/history/", "docs/reports/", "prompts/",
                 "portfolio/monetization/relicense_fsl.py", "portfolio/monetization/test_relicense_fsl.py",
                 "portfolio/monetization/LICENSING_TRANSITION.md", "platform/ci/check_third_party.py",
                 "platform/ci/test_check_third_party.py", "IDEAS.md", "CLAUDE.md", "AGENTS.md")


def tracked(root: Path) -> list[str]:
    out = subprocess.run(["git", "-C", str(root), "ls-files", "-z"], capture_output=True, check=True)
    return [p for p in out.stdout.decode().split("\0") if p]


def in_scope(rel: str) -> bool:
    base = os.path.basename(rel)
    if base not in LICENSE_NAMES and not rel.startswith(REWRITE_ROOTS):
        return False
    if rel.startswith(SKIP_PREFIXES) or any(s in "/" + rel for s in SKIP_DIRS):
        return False
    return os.path.basename(rel) not in SKIP_FILES


def relicense_file(text: str) -> str | None:
    m = MIT_HEAD.match(text)
    if not m or not any(o in m.group(2) for o in OWNERS):
        return None
    return FSL_TEXT.format(year=m.group(1), holder=m.group(2).strip())


def rewrite_text(text: str, rel: str) -> str:
    if rel.startswith(SUBJECT_FILES):
        # Only the page footer's claim about our own code.
        return REWRITES[0][0].sub(REWRITES[0][1], text).replace(
            "Free to use and source available (MIT)", f"Free to use and source available ({SPDX_ID})")
    for pat, repl in REWRITES:
        text = pat.sub(repl, text)
    base = os.path.basename(rel)
    if base == "package.json":
        text = PKG_LICENSE.sub(rf'\1"{SPDX_ID}"', text)
    if base == "Cargo.toml":
        text = re.sub(r'^license = "MIT"$', f'license = "{SPDX_ID}"', text, flags=re.M)
    if base == "pyproject.toml":
        # The table form: setuptools before 77 rejects a bare string here.
        text = re.sub(r'^license = (?:"MIT"|\{ ?text = "MIT" ?\})$', f'license = {{text = "{SPDX_ID}"}}',
                      text, flags=re.M)
        text = re.sub(r'^\s*"License :: OSI Approved :: MIT License",\n', "", text, flags=re.M)
    return text


def plan(root: Path) -> dict[str, str]:
    changes: dict[str, str] = {}
    for rel in tracked(root):
        if not in_scope(rel):
            continue
        base = os.path.basename(rel)
        path = root / rel
        if base in LICENSE_NAMES:
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            new = relicense_file(text)
            if new is not None and new != text:
                changes[rel] = new
            continue
        if os.path.splitext(base)[1].lower() not in TEXT_EXT:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if "MIT" not in text and "pen source" not in text and "pen-source" not in text:
            continue
        new = rewrite_text(text, rel)
        if new != text:
            changes[rel] = new
    return changes


def main(argv: list[str]) -> int:
    changes = plan(ROOT)
    if "--check" in argv:
        for rel in sorted(changes):
            print(rel)
        return 1 if changes else 0
    for rel, text in changes.items():
        (ROOT / rel).write_text(text, encoding="utf-8")
    print(f"relicensed or rewrote {len(changes)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
