import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import check_code_point_range as g

BARE = 'const d = (s) => s.replace(/&#(\\d+);/g, (_, n) => String.fromCodePoint(Number(n)));\n'
RANGED = 'const d = (s) => s.replace(/&#(\\d+);/g, (m, n) => (+n <= 0x10ffff ? String.fromCodePoint(+n) : m));\n'
HELPER = ('const d = (s) => s.replace(/&#(\\d+);/g, (_, n) => codePointOr(Number(n)));\n'
          'function codePointOr(n) { return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\\uFFFD"; }\n')
TRIED = 'function f(cp) {\n  try { return String.fromCodePoint(cp); } catch { return "?"; }\n}\n'
NEARBY = 'function f(code) {\n  if (code > 0x10ffff) return "";\n  // comment\n  return String.fromCodePoint(code);\n}\n'
FAR = 'function f(code) {\n  if (code > 0x10ffff) return "";\n' + '  x();\n' * 8 + '  return String.fromCodePoint(code);\n}\n'


class CodePointRange(unittest.TestCase):
    def tree(self, files, baseline=""):
        d = Path(tempfile.mkdtemp())
        for rel, text in files.items():
            p = d / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        (d / "base.txt").write_text(baseline)
        return d

    def run_main(self, d):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = g.main(["--root", str(d), "--baseline", str(d / "base.txt")])
        return code, out.getvalue()

    def test_bare_decoder_is_flagged_and_guards_are_seen(self):
        self.assertEqual(g.unguarded_in(BARE), [1])
        for ok in (RANGED, HELPER, TRIED, NEARBY):
            self.assertEqual(g.unguarded_in(ok), [], ok)
        self.assertEqual(g.unguarded_in("const c = String.fromCodePoint(s.codePointAt(0));\n"), [])
        self.assertEqual(g.unguarded_in(FAR), [11], "a guard more than six lines up is out of reach")

    def test_new_unguarded_call_fails_tests_and_vendored_code_do_not(self):
        code, out = self.run_main(self.tree({"ventures/a/parse.mjs": BARE}))
        self.assertEqual(code, 1)
        self.assertIn("ventures/a/parse.mjs:1", out)
        d = self.tree({"ventures/a/parse.test.mjs": BARE, "ventures/a/node_modules/x.mjs": BARE,
                       "platform/pages/vendor/y.js": BARE, "ventures/b/big.js": "x" * 1200 + BARE.strip() + "\n",
                       "ventures/c/ok.mjs": HELPER})
        self.assertEqual(self.run_main(d)[0], 0)

    def test_baseline_allows_and_stale_entry_fails(self):
        d = self.tree({"ventures/a/parse.mjs": BARE}, "# why\nventures/a/parse.mjs  # table-bound\n")
        self.assertEqual(self.run_main(d)[0], 0)
        d = self.tree({"ventures/a/parse.mjs": RANGED}, "ventures/a/parse.mjs\n")
        code, out = self.run_main(d)
        self.assertEqual(code, 1)
        self.assertIn("delete the entry", out)

    def test_repository_is_clean(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = g.main([])
        self.assertEqual(code, 0, out.getvalue())


if __name__ == "__main__":
    unittest.main()
