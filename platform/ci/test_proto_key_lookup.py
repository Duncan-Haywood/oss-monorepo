"""Guard: a calculator must not pick a table row with a user-supplied key
via plain `TABLE[input.x] ? ... : default`. A shared link or API caller that
sends `constructor`, `__proto__` or `toString` gets a truthy inherited value,
skips the fallback and crashes (or computes from a function). Use
`Object.hasOwn(TABLE, input.x)`. Found by the 2026-10-15 redteam run."""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
UNSAFE = re.compile(r"\b[A-Z][A-Z_0-9]+\[(?:input|inp|i|o|opts|params)\.\w+\]\s*(?:\?\s|\?\?)")


class ProtoKeyLookup(unittest.TestCase):
    def test_no_unguarded_table_lookup_by_user_key(self):
        bad = []
        for f in sorted((ROOT / "ventures").glob("*/calc.mjs")):
            for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                if UNSAFE.search(line):
                    bad.append(f"{f.relative_to(ROOT)}:{n}: {line.strip()[:100]}")
        self.assertEqual(bad, [], "use Object.hasOwn(TABLE, key) before TABLE[key]")


if __name__ == "__main__":
    unittest.main()
