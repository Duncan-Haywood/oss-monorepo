"""Every venture test that pokes localStorage must poke its own venture's key.

Found by a red-team run on 2026-11-24: 50 copies of usage.test.mjs had been
copied from another venture with the other venture's storage key left in
("solo-401k-contribution-calculator-usage" in truck-detention-pay-calculator,
"donor-acknowledgment-letter-generator-usage" in 34 others). Their test
"corrupt stored JSON is treated as empty rather than thrown" wrote the corrupt
value under a key the counter never reads, so it passed whatever the counter
did with corrupt input: the test name promised a guard that did not exist.

The rule: a string literal shaped like a usage key (`<slug>-usage` or
`<slug>-usage-opt-out`) passed to setItem/getItem/removeItem in a venture's
test file must appear somewhere in that venture's own non-test source.
Runs without a workflow entry through platform/ci/unwired_checks.py.
"""
import re
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CALL = re.compile(r"""(?:setItem|getItem|removeItem)\(\s*["'`]([a-z0-9][a-z0-9-]*-usage(?:-opt-out)?)["'`]""")
SOURCE_GLOBS = ("*.mjs", "*.js", "*.html")


def foreign_keys(ventures: Path):
    """[(test file, key)] for usage keys a test uses that its venture never defines."""
    found = []
    for test in sorted(ventures.glob("*/*.test.mjs")):
        keys = set(CALL.findall(test.read_text(errors="ignore")))
        if not keys:
            continue
        src = "".join(
            p.read_text(errors="ignore")
            for g in SOURCE_GLOBS
            for p in test.parent.glob(g)
            if not p.name.endswith(".test.mjs")
        )
        for key in sorted(keys):
            if not any(q + key + q in src for q in "\"'`"):
                found.append((test.relative_to(ventures.parent).as_posix(), key))
    return found


class UsageTestKeys(unittest.TestCase):
    def test_a_foreign_key_is_found_and_the_own_key_is_not(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "ventures"
            for name in ("alpha", "beta"):
                (v / name).mkdir(parents=True)
                (v / name / "usage.mjs").write_text(f'const KEY = "{name}-usage";\n')
            (v / "alpha" / "usage.test.mjs").write_text(
                'localStorage.setItem("alpha-usage", "x");\n'
                'localStorage.getItem("alpha-usage-opt-out");\n'
            )
            (v / "beta" / "usage.test.mjs").write_text(
                'globalThis.localStorage.setItem(\n  "alpha-usage", "not json");\n'
            )
            self.assertEqual(
                foreign_keys(v),
                [("ventures/alpha/usage.test.mjs", "alpha-usage-opt-out"),
                 ("ventures/beta/usage.test.mjs", "alpha-usage")],
            )
            (v / "alpha" / "usage.mjs").write_text(
                'const KEY = "alpha-usage";\nconst OPT_OUT = "alpha-usage-opt-out";\n'
            )
            self.assertEqual(foreign_keys(v), [("ventures/beta/usage.test.mjs", "alpha-usage")])

    def test_every_venture_test_uses_its_own_usage_key(self):
        bad = foreign_keys(ROOT / "ventures")
        self.assertEqual(
            bad, [],
            "these tests write a usage key their venture never reads (copied from "
            "another venture?), so they pass whatever the counter does: "
            + "; ".join(f"{f}: {k}" for f, k in bad),
        )


if __name__ == "__main__":
    unittest.main()
