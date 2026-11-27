#!/usr/bin/env python3
"""Tests for check_py311_syntax.py: what 3.11 rejects, and that --fix keeps the AST."""
import ast
import io
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_py311_syntax as c  # noqa: E402

BAD = {
    "same quote": "d = {}\nx = f\"{d[\"k\"]}\"\n",
    "nested both quotes": "rs = []\nx = f\"{', '.join(f'{r['a']}' for r in rs)}\"\n",
    "backslash": "x = f\"{'\\n'.join([])}\"\n",
    "comment": "x = f'''{1 # c\n}'''\n",
}
GOOD = {
    "other quote": "d = {}\nx = f\"{d['k']}\"\n",
    "nested ok": "rs = []\nx = f\"{', '.join(f'{r}' for r in rs)}\"\n",
    "triple outer": "d = {}\nx = f'''{d['k']}'''\n",
    "backslash in literal": "x = f\"a\\n{1}\"\n",
    "plain": "x = 'a' \"b\"\n",
}
FIXABLE = ("same quote", "nested both quotes")
PY311 = shutil.which("python3.11")


@unittest.skipUnless(c.FSTRING, "the tokenizer path needs Python 3.12+")
class Tokenizer(unittest.TestCase):
    def test_flags_what_311_rejects(self):
        for name, src in BAD.items():
            with self.subTest(name):
                self.assertTrue(c.problems(src), name)

    def test_passes_what_311_accepts(self):
        for name, src in GOOD.items():
            with self.subTest(name):
                self.assertEqual(c.problems(src), [], name)

    def test_fix_keeps_the_ast_and_clears_the_problem(self):
        for name in FIXABLE:
            src = BAD[name]
            for _ in range(4):
                probs = c.problems(src)
                if not any(p[3] for p in probs):
                    break
                src = c.apply_fixes(src, probs)
            with self.subTest(name):
                self.assertEqual(c.problems(src), [])
                self.assertEqual(ast.dump(ast.parse(src)), ast.dump(ast.parse(BAD[name])))

    @unittest.skipUnless(PY311, "no python3.11 on this machine")
    def test_agrees_with_a_real_311_compile(self):
        for name, src in {**BAD, **GOOD}.items():
            with self.subTest(name), tempfile.TemporaryDirectory() as d:
                f = Path(d) / "x.py"
                f.write_text(src)
                real = subprocess.run([PY311, "-c", f"compile(open({str(f)!r}).read(), 'x', 'exec')"],
                                      capture_output=True).returncode != 0
                self.assertEqual(bool(c.problems(src)), real, name)


@unittest.skipUnless(c.FSTRING, "the tokenizer path needs Python 3.12+")
class FastTokens(unittest.TestCase):
    """_tokens reads the C tokenizer without tokenize.py's wrapper (2026-11-27);
    it must hand problems() exactly what the public API would."""

    EXTRA = {
        "promote": "x = f'{\", \".join(f\"{r[\"a\"]}\" for r in [])}'\n",
        "multiline": "x = (f'a{1}'\n     f\"b{2!r:>{3}}\")\n",
        "unicode": "s = 'é'\nx = f\"{s}ü{s!a}\"  # ünï\n",
        "crlf": "x = f'{1}'\r\ny = 2\r\n",
        "no newline": "x = f'{1}'",
    }

    def test_same_tokens_as_the_public_api(self):
        if c._TokenizerIter is None:
            self.skipTest("no _tokenize on this Python; _tokens is the public API")
        srcs = {**BAD, **GOOD, **self.EXTRA}
        files = [c.ROOT / n for n in c.repo_files.ls_files(c.ROOT, "*.py")]
        for p in files[::40]:  # a spread of real files; the full tree took 8 s
            try:
                srcs[str(p)] = p.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                pass
        for name, src in srcs.items():
            with self.subTest(name):
                fast = list(c._TokenizerIter(io.StringIO(src).readline, extra_tokens=True))
                self.assertEqual(fast, c._public_tokens(src))

    def test_problems_are_unchanged_through_the_public_path(self):
        for name, src in {**BAD, **GOOD, **self.EXTRA}.items():
            with self.subTest(name):
                fast = c.problems(src)
                with mock.patch.object(c, "_TokenizerIter", None):
                    self.assertEqual(fast, c.problems(src))

    def test_an_untokenizable_file_keeps_tokenizes_own_message(self):
        src = "x = f'{1'\n"
        with mock.patch.object(c, "_TokenizerIter", None):
            public = c.problems(src)
        self.assertEqual(c.problems(src), public)
        self.assertTrue(public and public[0][2].startswith("does not tokenize"), public)


class Cli(unittest.TestCase):
    def test_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            good, bad = Path(d) / "g.py", Path(d) / "b.py"
            good.write_text(GOOD["other quote"])
            bad.write_text(BAD["same quote"])
            self.assertEqual(c.main([str(good)]), 0)
            if c.FSTRING or sys.version_info < (3, 12):
                self.assertEqual(c.main([str(bad)]), 1)


if __name__ == "__main__":
    unittest.main()
