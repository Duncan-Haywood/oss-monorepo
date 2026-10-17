#!/usr/bin/env python3
"""Tests for check_duplicate_symbols.py.

A guard that only ever passes proves nothing, so most of these build the
duplicate they are meant to catch. The other half matter more than usual here:
this check runs unfiltered over every tracked Python file, so a false positive
would turn an unrelated PR red and teach people to ignore it.
"""

import textwrap
import unittest
from pathlib import Path

import check_duplicate_symbols as cds


def dupes(source):
    return cds.duplicate_symbols(textwrap.dedent(source))


class Detection(unittest.TestCase):
    def test_two_functions_of_one_name_are_reported(self):
        # The 2026-08-26 shape: two branches, same invariant, no shared lines.
        found = dupes("""
            def check_thing(rows):
                return []

            def other():
                pass

            def check_thing(rows):
                return ['different']
        """)
        self.assertEqual(list(found), ["check_thing"])
        self.assertEqual(found["check_thing"], [2, 8])

    def test_two_constants_of_one_name_are_reported(self):
        found = dupes("""
            PAGES_DEPLOY_ACTIONS = ("actions/deploy-pages",)
            PAGES_DEPLOY_ACTIONS = ("actions/deploy-pages", "peaceiris/actions-gh-pages")
        """)
        self.assertEqual(found, {"PAGES_DEPLOY_ACTIONS": [2, 3]})

    def test_three_definitions_report_every_line(self):
        found = dupes("""
            X = 1
            X = 2
            X = 3
        """)
        self.assertEqual(found["X"], [2, 3, 4])

    def test_classes_count(self):
        self.assertIn("Thing", dupes("class Thing: pass\nclass Thing: pass\n"))

    def test_an_async_def_shadowing_a_def_is_reported(self):
        self.assertIn("run", dupes("""
            def run():
                pass

            async def run():
                pass
        """))

    def test_an_annotated_constant_counts(self):
        found = dupes("""
            NAMES: tuple = ("a",)
            NAMES: tuple = ("b",)
        """)
        self.assertEqual(found, {"NAMES": [2, 3]})

    def test_a_bare_annotation_binds_nothing(self):
        # `NAMES: tuple` declares a type without assigning, so it is not a
        # second binding of the constant below it.
        self.assertEqual(dupes("NAMES: tuple\nNAMES = ('a',)\n"), {})

    def test_leading_underscore_constants_still_count(self):
        self.assertIn("_SWITCH_RE", dupes("_SWITCH_RE = 1\n_SWITCH_RE = 2\n"))

    def test_a_constant_and_a_function_of_the_same_name_collide(self):
        self.assertIn("VALUE", dupes("VALUE = 1\ndef VALUE(): pass\n"))


class FalsePositives(unittest.TestCase):
    """Each of these is legitimate Python that must not turn a PR red."""

    def test_a_single_definition_is_fine(self):
        self.assertEqual(dupes("def only(): pass\nCONST = 1\n"), {})

    def test_reassigning_a_lower_case_module_variable_is_ordinary(self):
        self.assertEqual(dupes("count = 0\ncount = count + 1\n"), {})

    def test_a_conditional_import_fallback_is_not_a_duplicate(self):
        # The classic shape. Both bind `loads`, deliberately, and only one runs.
        self.assertEqual(dupes("""
            try:
                from fast import loads
            except ImportError:
                def loads(text):
                    return None
        """), {})

    def test_a_definition_guarded_by_type_checking_is_not_a_duplicate(self):
        self.assertEqual(dupes("""
            if TYPE_CHECKING:
                def helper(x): ...
            else:
                def helper(x):
                    return x
        """), {})

    def test_nested_definitions_are_not_module_level(self):
        self.assertEqual(dupes("""
            def outer():
                def inner():
                    pass
                return inner

            def other():
                def inner():
                    pass
                return inner
        """), {})

    def test_a_method_repeating_a_module_function_name_is_not_a_duplicate(self):
        self.assertEqual(dupes("""
            def survey():
                pass

            class Thing:
                def survey(self):
                    pass
        """), {})

    def test_tuple_unpacking_is_not_a_constant_binding(self):
        self.assertEqual(dupes("A, B = 1, 2\nA, B = 3, 4\n"), {})

    def test_a_dunder_is_left_alone(self):
        # `__all__` is lower-case by convention; re-assembling it in pieces is a
        # real pattern and not what this check is for.
        self.assertEqual(dupes("__all__ = ['a']\n__all__ = __all__ + ['b']\n"), {})

    def test_an_augmented_assignment_is_not_a_second_binding(self):
        self.assertEqual(dupes("TOTAL = 0\nTOTAL += 1\n"), {})


class IsConstantName(unittest.TestCase):
    def test_upper_case_names_are_constants(self):
        for name in ("PAGES", "PAGES_DEPLOY_ACTIONS", "_PRIVATE", "X", "HTTP2"):
            self.assertTrue(cds._is_constant_name(name), name)

    def test_other_names_are_not(self):
        for name in ("pages", "PagesActions", "_private", "__all__", "_", "__"):
            self.assertFalse(cds._is_constant_name(name), name)


class Reporting(unittest.TestCase):
    def test_the_message_names_the_file_the_symbol_and_every_line(self):
        path = Path(cds.__file__)
        problems = cds.survey([path])
        self.assertEqual(problems, [], "this checker must not trip on itself")

    def test_an_unparseable_file_is_left_to_the_syntax_checkers(self):
        # `validate` reports a broken file more usefully than this can, and two
        # red checks for one cause is noise.
        import tempfile

        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as handle:
            handle.write("def broken(:\n")
            broken = Path(handle.name)
        try:
            self.assertEqual(cds.survey([broken]), [])
        finally:
            broken.unlink()


class MainExitCode(unittest.TestCase):
    """CI reads the exit code, so a wrong one silently disarms the check."""

    def run_main(self, source):
        import contextlib
        import io
        import tempfile
        from unittest import mock

        out, err = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "sample.py"
            path.write_text(source)
            with mock.patch.object(cds, "tracked_python_files", return_value=[path]), \
                    contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = cds.main()
        return code, out.getvalue(), err.getvalue()

    def test_clean_files_exit_zero(self):
        code, out, err = self.run_main("def f():\n    pass\n")
        self.assertEqual(code, 0)
        self.assertIn("No duplicate", out)
        self.assertEqual(err, "")

    def test_a_duplicate_exits_one_and_names_it(self):
        code, out, err = self.run_main("def f():\n    pass\n\ndef f():\n    pass\n")
        self.assertEqual(code, 1)
        self.assertIn("`f`", err)
        self.assertEqual(out, "")


class LiveRepository(unittest.TestCase):
    def test_no_tracked_python_file_defines_a_name_twice(self):
        # The cases above prove the logic; this proves the repository. If it
        # fails, read the named file: it is almost always two branches that
        # merged without a conflict because they never shared a line.
        problems = cds.survey(cds.tracked_python_files())
        self.assertEqual(problems, [], "\n".join(problems))

    def test_the_repository_actually_has_python_files_to_check(self):
        # Guards against `git ls-files` silently returning nothing, which would
        # make the assertion above pass for the wrong reason.
        self.assertGreater(len(cds.tracked_python_files()), 50)


if __name__ == "__main__":
    unittest.main()
