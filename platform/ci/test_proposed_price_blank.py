"""Red team 2026-11-17: a venture engine must read a blank "price you are considering" as none.

109 calculators decided "was a proposed price given?" with `x !== ''` (or `x === ''`)
on the raw input. Number('  ') is 0, so an agent, CLI or MCP call passing whitespace
got a $0 bid scored against cost (a 0% margin or a "loses everything" verdict) instead
of no comparison. The fix is `String(x ?? '').trim() !== ''`; this lint keeps the
untrimmed form from coming back in a new calculator copied from an old one.
"""
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
# `input.proposedPrice !== ''`, `proposedSeasonal === ''`: an untrimmed blank check.
UNTRIMMED = re.compile(r"\b(?:input\.)?proposed\w*\s*[!=]==\s*''")


def offenders(paths, read=lambda p: (ROOT / p).read_text(encoding="utf-8")):
    hits = []
    for rel in paths:
        for n, line in enumerate(read(rel).splitlines(), 1):
            if line.lstrip().startswith(("//", "*")):
                continue
            if UNTRIMMED.search(line):
                hits.append(f"{rel}:{n}: {line.strip()}")
    return hits


class ProposedPriceBlank(unittest.TestCase):
    def test_pattern_flags_the_old_forms_and_passes_the_fix(self):
        src = {
            "a.mjs": "const hasProposed = input.proposedPrice !== null && input.proposedPrice !== '';",
            "b.mjs": "if (proposedPrice === '' || proposedPrice == null) return null;",
            "c.mjs": "  && input.proposedSeasonal !== '';",
            "ok.mjs": "const hasProposed = String(input.proposedPrice ?? '').trim() !== '';\n// x.proposedPrice !== ''",
        }
        self.assertEqual([h.split(":")[0] for h in offenders(src, read=src.__getitem__)], ["a.mjs", "b.mjs", "c.mjs"])

    def test_no_venture_engine_uses_an_untrimmed_blank_check(self):
        tracked = subprocess.run(["git", "ls-files", "ventures/*.mjs"], cwd=ROOT, capture_output=True,
                                 text=True, check=True).stdout.splitlines()
        # Engines only: share.mjs encodes form fields (a number input never holds whitespace),
        # and tests may name the old form on purpose.
        engines = [p for p in tracked if not p.endswith((".test.mjs", "/share.mjs")) and "/node_modules/" not in p]
        self.assertEqual(offenders(engines), [],
                         "use String(x ?? '').trim() !== '' so a whitespace price is none, not $0")


if __name__ == "__main__":
    unittest.main()
