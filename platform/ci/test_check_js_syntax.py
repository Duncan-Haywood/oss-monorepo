import unittest
import check_js_syntax as c


class CheckText(unittest.TestCase):
    def test_ok(self):
        self.assertIsNone(c.check_text("const a = 1;\nconsole.log(a);\n"))

    def test_module_in_js(self):
        self.assertIsNone(c.check_text("import fs from 'fs';\nexport const x = fs;\n"))

    def test_syntax_error(self):
        self.assertTrue(c.check_text("function (){\n"))

    def test_jsx_skipped(self):
        self.assertEqual(c.check_text("const A = () => (\n  <View style={s}>\n  </View>\n);\n"), "jsx")


# Sources where the one-process parse and `node --check` could disagree: the
# batch must never pass what the per-file check fails, and every result must
# be the per-file check's (docs/history/ci-perf-2026-11-12-js-syntax-one-process.md).
CASES = [
    ("const a = 1;\n", ".js"),
    ("import fs from 'fs';\nexport const x = fs;\n", ".js"),
    ("function (){\n", ".js"),
    ("const A = () => (\n  <View style={s}>\n  </View>\n);\n", ".js"),
    ("await 1;\n", ".js"),           # node --check retries this as a module
    ("let require = 1;\n", ".js"),   # same
    ("return 1;\n", ".js"),          # legal in a CommonJS body
    ("return 1;\n", ".mjs"),         # not in a module
    ("#!/usr/bin/env node\nlet a = 1;\n", ".js"),
    ("export default 1;\nexport default 2;\n", ".mjs"),
    ("let x = ;\n", ".mjs"),
]


def _norm(v):
    # check_text's error line starts with its temporary file's path
    return v if v in (None, "jsx") else v.split(":", 1)[-1]


class CheckAll(unittest.TestCase):
    def test_same_answers_as_check_text(self):
        got = c.check_all(CASES + [None])
        want = [c.check_text(t, s) for t, s in CASES] + [None]
        self.assertEqual([_norm(v) for v in got], [_norm(v) for v in want])
        self.assertIn(None, got)
        self.assertIn("jsx", got)
        self.assertTrue(any(v not in (None, "jsx") for v in got))

    def test_batch_never_passes_a_failing_source(self):
        sure = c.batch_parses([(c.parse_suffix(t, s), t) for t, s in CASES])
        for (t, s), ok in zip(CASES, sure):
            if ok:
                self.assertIsNone(c.check_text(t, s), (t, s))

    def test_broken_batch_falls_back_to_per_file(self):
        old = c.BATCH
        c.BATCH = c.BATCH.with_name("no_such_batch.mjs")
        try:
            self.assertEqual(c.batch_parses([(".js", "1;")]), [False])
            self.assertEqual([_norm(v) for v in c.check_all(CASES)],
                             [_norm(c.check_text(t, s)) for t, s in CASES])
        finally:
            c.BATCH = old


if __name__ == "__main__":
    unittest.main()
