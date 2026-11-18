"""The decimal-comma contract passes on the tree and fails on a broken copy."""
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_decimal_comma_contract as c  # noqa: E402

GOOD = '''export function detectDecimalComma(table, delim = ",") {
  let comma = 0, dot = 0;
  for (const row of table) {
    for (const cell of row) {
      const s = String(cell ?? "").trim();
      if (!/\\d/.test(s) || /[a-z]{3,}/i.test(s.replace(/usd|eur|gbp|cad|aud/gi, ""))) continue;
      if (/^\\d{1,4}[/.-]\\d{1,2}[/.-]\\d{2,4}/.test(s) || /\\d:\\d\\d/.test(s)) continue;
      const v = s.replace(/[^0-9.,]/g, "");
      if (/,\\d{1,2}$/.test(v) || /\\.\\d{3},/.test(v)) comma += 1;
      else if (/\\.\\d{1,2}$/.test(v) || /,\\d{3}\\./.test(v)) dot += 1;
    }
  }
  return comma === dot ? delim === ";" : comma > dot;
}
'''


@unittest.skipUnless(shutil.which("node"), "node not installed")
class ContractTest(unittest.TestCase):
    def tree(self, src):
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d)
        (d / "v").mkdir()
        (d / "v" / "calc.mjs").write_text(src)
        return d

    def test_reference_copy_passes(self):
        code, out = c.run(self.tree(GOOD))
        self.assertEqual(code, 0, out)

    def test_seeded_faults_fail(self):
        for old, new in [("|| /[a-z]{3,}/", "&& /[a-z]{3,}/"),
                         ("[/.-]\\d{1,2}[/.-]", "[/.-]\\d{1,3}[/.-]"),
                         ("else if (/\\.\\d{1,2}$/", "else if (/\\.\\d{2,2}$/"),
                         ("delim === \";\"", "delim === \",\"")]:
            self.assertIn(old, GOOD)
            code, out = c.run(self.tree(GOOD.replace(old, new)))
            self.assertEqual(code, 1, (old, out))

    def test_no_copies_is_a_failure(self):
        code, out = c.run(self.tree("export const x = 1;\n"))
        self.assertEqual(code, 1, out)

    def test_main_tree_passes(self):
        self.assertEqual(c.main(["x"]), 0)


if __name__ == "__main__":
    unittest.main()
