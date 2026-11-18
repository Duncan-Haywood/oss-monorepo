"""Tests for check_clipboard_guard.py: each shape it reports, and each it must let pass."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_clipboard_guard as c  # noqa: E402


def kinds(src):
    return [k for _, k in c.classify(src)]


class Classify(unittest.TestCase):
    def test_awaited_in_try_is_ok(self):
        self.assertEqual(kinds("b.onclick = async () => { try { await navigator.clipboard.writeText(t); ok(); } catch { no(); } };"), ["ok"])

    def test_catch_chain_is_ok(self):
        self.assertEqual(kinds("navigator.clipboard.writeText(t).then(ok).catch(no);"), ["ok"])

    def test_two_argument_then_is_ok(self):
        self.assertEqual(kinds("navigator.clipboard.writeText(t).then(() => ok(), () => no());"), ["ok"])

    def test_one_argument_then_is_unhandled(self):
        self.assertEqual(kinds("navigator.clipboard.writeText(t).then(() => ok());"), ["unhandled"])

    def test_bare_await_is_unhandled(self):
        self.assertEqual(kinds("b.onclick = async () => { await navigator.clipboard.writeText(t); say('Copied'); };"), ["unhandled"])

    def test_unawaited_in_try(self):
        self.assertEqual(kinds("try { navigator.clipboard.writeText(t); } catch (e) {} say('Copied');"), ["unawaited"])

    def test_returned_is_left_to_the_caller(self):
        self.assertEqual(kinds("function copy(t) { return navigator.clipboard.writeText(t); }"), ["returned"])
        self.assertEqual(kinds("const copy = (t) => navigator.clipboard.writeText(t);"), ["returned"])

    def test_ternary_group_handled_after_the_paren(self):
        src = "(navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => ok(), () => no());"
        self.assertEqual(kinds(src), ["ok"])

    def test_async_function_whose_callers_catch(self):
        src = "async function share() { await navigator.clipboard.writeText(u); say('ok'); }\nb.onclick = () => { share().catch(() => no()); };"
        self.assertEqual(kinds(src), ["ok"])

    def test_async_function_with_an_uncaught_caller(self):
        src = "async function share() { await navigator.clipboard.writeText(u); }\na.onclick = () => share().catch(no);\nb.onclick = () => share();"
        self.assertEqual(kinds(src), ["unhandled"])

    def test_try_closed_before_the_call(self):
        self.assertEqual(kinds("try { x(); } catch {} await navigator.clipboard.writeText(t);"), ["unhandled"])

    def test_text_in_strings_and_comments_is_ignored(self):
        src = "// navigator.clipboard.writeText(t)\nconst s = 'clipboard.writeText(x)'; const u = `clipboard.writeText(${y})`;"
        self.assertEqual(kinds(src), [])

    def test_template_expression_is_still_code(self):
        src = "const s = `${await navigator.clipboard.writeText(t)}`;"
        self.assertEqual(kinds(src), ["unhandled"])

    def test_brace_in_string_does_not_open_a_try(self):
        src = "try { const s = '}'; await navigator.clipboard.writeText(t); } catch {}"
        self.assertEqual(kinds(src), ["ok"])


class Tree(unittest.TestCase):
    def test_reports_lines_inside_html_scripts_and_skips_tests(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "v"
            v.mkdir()
            (v / "index.html").write_text("<p>hi</p>\n<script>\nb.onclick = async () => {\n  await navigator.clipboard.writeText(t);\n};\n</script>\n")
            (v / "app.test.mjs").write_text("await navigator.clipboard.writeText(t);")
            found = c.check_tree(d)
            self.assertEqual([(Path(p).name, line, k) for p, line, k in found], [("index.html", 4, "unhandled")])
            self.assertEqual(c.main(["x", d]), 1)

    def test_clean_tree_exits_zero(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "a.js").write_text("try { await navigator.clipboard.writeText(t); } catch {}")
            self.assertEqual(c.main(["x", d]), 0)


if __name__ == "__main__":
    unittest.main()
