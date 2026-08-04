#!/usr/bin/env python3
"""
Tests for the duplicate top-level definition detector.

Two of these carry the weight.

`test_it_finds_the_router_tail_this_control_was_written_for` reconstructs the
actual 2026-08-04 defect — a module whose second half redefines every name in
its first half, with `if __name__ == "__main__": main()` sitting between the
copies. That file parses, imports, and passes its tests, so a control that only
ran the code could not see it.

`test_a_conditional_definition_is_not_a_duplicate` and the JavaScript
noise-stripping cases are the other half. This detector reads source rather than
running it, so its whole risk is false positives: a `function` inside a block
comment, inside a template literal, or after a regex literal containing a quote
all look like declarations to a naive line scan. A detector that cried duplicate
on ordinary code would be switched off within a day, which is the same outcome
as not having one.

No test here is skipped or conditionally skipped, and none should be.
"""

import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import duplicate_definitions
from duplicate_definitions import (
    DuplicateDefinitionError,
    find_duplicates,
    scan_python,
    scan_script,
    source_files,
    strip_js_noise,
)


def dedent(text: str) -> str:
    return textwrap.dedent(text).lstrip("\n")


class TestPython(unittest.TestCase):
    def names(self, source: str):
        return [(d.scope, d.name, d.lines) for d in scan_python("m.py", dedent(source))]

    def test_one_definition_is_not_a_duplicate(self):
        self.assertEqual(self.names("def f():\n    return 1\n"), [])

    def test_the_same_function_defined_twice_is_a_duplicate(self):
        self.assertEqual(
            self.names(
                """
                def f():
                    return 1

                def f():
                    return 2
                """
            ),
            [("module", "f", [1, 4])],
        )

    def test_the_same_class_defined_twice_is_a_duplicate(self):
        self.assertEqual(
            self.names("class C:\n    pass\n\nclass C:\n    pass\n"),
            [("module", "C", [1, 4])],
        )

    def test_an_async_definition_counts(self):
        self.assertEqual(
            self.names("async def f():\n    pass\n\ndef f():\n    pass\n"),
            [("module", "f", [1, 4])],
        )

    def test_a_class_and_a_function_of_the_same_name_collide(self):
        # Whichever comes last wins, exactly as with two functions.
        self.assertEqual(
            self.names("class Thing:\n    pass\n\ndef Thing():\n    pass\n"),
            [("module", "Thing", [1, 4])],
        )

    def test_three_copies_are_reported_with_all_three_lines(self):
        found = scan_python("m.py", "def f():\n    pass\n\ndef f():\n    pass\n\ndef f():\n    pass\n")
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].copies, 3)
        self.assertEqual(found[0].lines, [1, 4, 7])

    def test_a_conditional_definition_is_not_a_duplicate(self):
        # The ordinary optional-dependency shim. Neither copy is a top-level
        # body item, so neither is reported. If this ever fires, the control is
        # unusable and will be deleted rather than fixed.
        self.assertEqual(
            self.names(
                """
                try:
                    from fast import parse
                except ImportError:
                    def parse(text):
                        return text

                if sys.version_info >= (3, 12):
                    def helper():
                        return "new"
                else:
                    def helper():
                        return "old"
                """
            ),
            [],
        )

    def test_a_nested_function_of_the_same_name_is_not_a_duplicate(self):
        self.assertEqual(
            self.names(
                """
                def outer():
                    def inner():
                        pass
                    return inner

                def other():
                    def inner():
                        pass
                    return inner
                """
            ),
            [],
        )

    def test_a_method_defined_twice_in_one_class_is_a_duplicate(self):
        self.assertEqual(
            self.names(
                """
                class C:
                    def run(self):
                        return 1

                    def run(self):
                        return 2
                """
            ),
            [("class C", "run", [2, 5])],
        )

    def test_the_same_method_name_in_two_classes_is_not_a_duplicate(self):
        self.assertEqual(
            self.names(
                """
                class A:
                    def run(self):
                        pass

                class B:
                    def run(self):
                        pass
                """
            ),
            [],
        )

    def test_a_property_and_its_setter_are_not_a_duplicate(self):
        self.assertEqual(
            self.names(
                """
                class C:
                    @property
                    def value(self):
                        return self._v

                    @value.setter
                    def value(self, v):
                        self._v = v

                    @value.deleter
                    def value(self):
                        del self._v
                """
            ),
            [],
        )

    def test_typing_overloads_are_not_a_duplicate(self):
        self.assertEqual(
            self.names(
                """
                @overload
                def f(x: int) -> int: ...

                @typing.overload
                def f(x: str) -> str: ...

                def f(x):
                    return x
                """
            ),
            [],
        )

    def test_a_lookalike_decorator_does_not_buy_an_exemption(self):
        # `@value.setter_factory()` is not an accessor; matching by suffix must
        # not be loosened into matching by substring. The reported lines are the
        # `def` lines, not the decorator lines, which is what `ast` records.
        found = self.names(
            """
            class C:
                @value.setter_factory()
                def value(self):
                    pass

                @value.setter_factory()
                def value(self):
                    pass
            """
        )
        self.assertEqual(found, [("class C", "value", [3, 7])])

    def test_an_unparseable_file_refuses_to_report_zero(self):
        with self.assertRaises(DuplicateDefinitionError) as ctx:
            scan_python("broken.py", "def f(:\n")
        self.assertIn("Refusing to report zero", str(ctx.exception))
        self.assertIn("broken.py", str(ctx.exception))

    def test_it_finds_the_router_tail_this_control_was_written_for(self):
        # The 2026-08-04 defect in miniature: a criss-cross merge appended a
        # second copy of the module after the `__main__` guard. Running the file
        # as a script calls the first `main`; importing it binds the second.
        source = dedent(
            """
            def find_repo_root():
                return "first"

            def main():
                return find_repo_root()

            if __name__ == "__main__":
                main()

            def find_repo_root():
                return "second"

            def main():
                return find_repo_root()
            """
        )
        # It parses and imports cleanly, which is the point.
        compile(source, "router.py", "exec")
        found = scan_python("portfolio/router/router.py", source)
        self.assertEqual(
            [(d.name, d.lines) for d in found],
            [("find_repo_root", [1, 10]), ("main", [4, 13])],
        )


class TestJavaScript(unittest.TestCase):
    def names(self, source: str):
        return [(d.name, d.lines) for d in scan_script("m.mjs", dedent(source))]

    def test_one_function_is_not_a_duplicate(self):
        self.assertEqual(self.names("function f() {}\n"), [])

    def test_the_same_function_declared_twice_is_a_duplicate(self):
        self.assertEqual(
            self.names("function f() {\n  return 1\n}\n\nfunction f() {\n  return 2\n}\n"),
            [("f", [1, 5])],
        )

    def test_export_async_and_generator_forms_all_count(self):
        self.assertEqual(
            self.names(
                """
                export function f() {}
                export async function f() {}
                function* f() {}
                export default function f() {}
                """
            ),
            [("f", [1, 2, 3, 4])],
        )

    def test_var_redeclaration_counts(self):
        self.assertEqual(self.names("var x = 1\nvar x = 2\n"), [("x", [1, 2])])

    def test_const_redeclaration_is_left_to_the_runtime(self):
        # A repeated top-level `const` is a SyntaxError; anything that imports
        # the file already refuses it. Reporting it here would only add
        # false-positive surface.
        self.assertEqual(self.names("const x = 1\nconst x = 2\n"), [])

    def test_an_indented_function_is_not_a_duplicate(self):
        self.assertEqual(
            self.names(
                """
                function outer() {
                  function inner() {}
                }
                function other() {
                  function inner() {}
                }
                """
            ),
            [],
        )

    def test_a_function_inside_a_block_comment_is_not_a_declaration(self):
        self.assertEqual(
            self.names(
                """
                function f() {}
                /*
                function f() {}
                */
                """
            ),
            [],
        )

    def test_a_function_inside_a_line_comment_is_not_a_declaration(self):
        self.assertEqual(self.names("function f() {}\n// function f() {}\n"), [])

    def test_a_function_inside_a_template_literal_is_not_a_declaration(self):
        self.assertEqual(
            self.names(
                """
                function f() {}
                const src = `
                function f() {}
                `
                """
            ),
            [],
        )

    def test_code_after_a_template_literal_is_still_scanned(self):
        # The stripper must resume, not swallow the rest of the file.
        self.assertEqual(
            self.names(
                """
                function f() {}
                const src = `
                anything at all
                `
                function f() {}
                """
            ),
            [("f", [1, 5])],
        )

    def test_a_template_hole_does_not_swallow_the_rest_of_the_file(self):
        self.assertEqual(
            self.names(
                """
                function f() {}
                const src = `a ${ compute({ deep: 1 }) } b`
                function f() {}
                """
            ),
            [("f", [1, 3])],
        )

    def test_a_function_inside_a_string_is_not_a_declaration(self):
        # A backslash line continuation, so the second physical line begins at
        # column 0 *inside* the string literal. Written on one line it would
        # prove nothing: the scan is anchored at column 0 either way.
        self.assertEqual(
            self.names(
                """
                function f() {}
                const s = "start \\
                function f() {}"
                """
            ),
            [],
        )

    def test_a_regex_containing_a_backtick_does_not_desync_the_scanner(self):
        # The failure this guards: the backtick read as an unterminated template
        # literal, blanking the rest of the file and hiding every declaration
        # after it. Unlike a stray quote, a template literal spans lines, so
        # nothing downstream limits the damage.
        self.assertEqual(
            self.names(
                """
                function f() {}
                const tpl = /`/
                function f() {}
                """
            ),
            [("f", [1, 3])],
        )

    def test_a_regex_containing_a_comment_opener_does_not_desync_the_scanner(self):
        self.assertEqual(
            self.names(
                """
                function f() {}
                const opener = /\\/\\*/
                function f() {}
                """
            ),
            [("f", [1, 3])],
        )

    def test_a_regex_containing_a_quote_does_not_desync_the_scanner(self):
        self.assertEqual(
            self.names(
                """
                function f() {}
                const quoted = /['"]/g
                function f() {}
                """
            ),
            [("f", [1, 3])],
        )

    def test_division_is_not_read_as_a_regex(self):
        self.assertEqual(
            self.names(
                """
                function f() {}
                const ratio = (a) / (b) + c
                function f() {}
                """
            ),
            [("f", [1, 3])],
        )

    def test_an_unterminated_string_does_not_swallow_the_file(self):
        self.assertEqual(
            self.names(
                """
                const broken = "oops
                function f() {}
                function f() {}
                """
            ),
            [("f", [2, 3])],
        )

    def test_typescript_overload_signatures_are_not_duplicates(self):
        self.assertEqual(
            self.names(
                """
                export function f(a: string): string;
                export function f(a: number): number;
                export function f(a: any): any {
                  return a
                }
                """
            ),
            [],
        )


class TestStripper(unittest.TestCase):
    def test_line_numbers_are_preserved(self):
        text = "a\n/* two\nthree */\nb\n"
        self.assertEqual(len(strip_js_noise(text).splitlines()), len(text.splitlines()))

    def test_comment_bodies_are_removed(self):
        self.assertNotIn("secret", strip_js_noise("// secret\n"))

    def test_code_is_left_alone(self):
        self.assertEqual(strip_js_noise("function f() {}\n"), "function f() {}\n")


class GitTreeTestCase(unittest.TestCase):
    """A real git repository, because `source_files` asks git what is tracked."""

    def git(self, *args):
        result = subprocess.run(
            ["git", *args],
            cwd=str(self.repo),
            capture_output=True,
            text=True,
            env={
                "PATH": "/usr/bin:/bin:/usr/local/bin",
                "HOME": str(self.repo),
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_SYSTEM": "/dev/null",
                "GIT_AUTHOR_NAME": "Test",
                "GIT_AUTHOR_EMAIL": "test@example.invalid",
                "GIT_COMMITTER_NAME": "Test",
                "GIT_COMMITTER_EMAIL": "test@example.invalid",
                "GIT_AUTHOR_DATE": "2026-08-04T12:00:00+00:00",
                "GIT_COMMITTER_DATE": "2026-08-04T12:00:00+00:00",
            },
        )
        if result.returncode != 0:
            raise AssertionError(f"git {' '.join(args)}: {result.stderr}")
        return result.stdout

    def setUp(self):
        self.repo = Path(tempfile.mkdtemp())
        self.git("init", "-q", "-b", "main")

    def write(self, path, text):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(dedent(text))
        self.git("add", "-f", path)
        self.git("commit", "-q", "-m", f"add {path}")


class TestFileSelection(GitTreeTestCase):
    def test_an_untracked_file_is_not_scanned(self):
        self.write("kept.py", "def f():\n    pass\n")
        (self.repo / "loose.py").write_text("def g():\n    pass\n\ndef g():\n    pass\n")
        self.assertEqual(find_duplicates(self.repo), [])

    def test_a_tracked_duplicate_is_found(self):
        self.write("mod.py", "def g():\n    pass\n\ndef g():\n    pass\n")
        self.assertEqual([d.name for d in find_duplicates(self.repo)], ["g"])

    def test_node_modules_is_not_scanned(self):
        self.write("keep.py", "x = 1\n")
        self.write("node_modules/dep/index.js", "function f() {}\nfunction f() {}\n")
        self.assertEqual(find_duplicates(self.repo), [])

    def test_ambient_declarations_are_not_duplicates(self):
        # `.d.ts` gets no exclusion of its own. It does not need one: an ambient
        # declaration has no body, and repeating one is how overloads are
        # written. An exclusion by file extension would be a region where the
        # rule is merely assumed to hold; this is the rule holding.
        self.write("keep.py", "x = 1\n")
        self.write("types/globals.d.ts", "declare function f(): void\ndeclare function f(): void\n")
        self.write("src/ambient.ts", "declare function g(): void\ndeclare function g(): void\n")
        self.assertEqual(find_duplicates(self.repo), [])

    def test_an_empty_tree_refuses_to_report_zero(self):
        self.write("README.md", "no source here\n")
        with self.assertRaises(DuplicateDefinitionError) as ctx:
            source_files(self.repo)
        self.assertIn("Refusing to report zero", str(ctx.exception))

    def test_a_directory_that_is_not_a_repository_refuses_to_report_zero(self):
        outside = Path(tempfile.mkdtemp())
        with self.assertRaises(DuplicateDefinitionError):
            source_files(outside)

    def test_findings_are_ordered_by_copies_then_path(self):
        self.write("b.py", "def x():\n    pass\n\ndef x():\n    pass\n")
        self.write("a.py", "def y():\n    pass\n\ndef y():\n    pass\n\ndef y():\n    pass\n")
        self.assertEqual([(d.path, d.copies) for d in find_duplicates(self.repo)], [("a.py", 3), ("b.py", 2)])


class TestReportAndExitCode(GitTreeTestCase):
    def test_a_clean_tree_reports_a_pass_and_exits_zero(self):
        self.write("mod.py", "def f():\n    pass\n")
        self.assertEqual(duplicate_definitions.main(["--repo-root", str(self.repo)]), 0)

    def test_a_duplicate_exits_nonzero(self):
        self.write("mod.py", "def f():\n    pass\n\ndef f():\n    pass\n")
        self.assertEqual(duplicate_definitions.main(["--repo-root", str(self.repo)]), 1)

    def test_report_mode_never_fails_the_build(self):
        self.write("mod.py", "def f():\n    pass\n\ndef f():\n    pass\n")
        self.assertEqual(duplicate_definitions.main(["--repo-root", str(self.repo), "--report"]), 0)

    def test_an_unmeasurable_tree_exits_nonzero(self):
        self.write("README.md", "no source here\n")
        self.assertEqual(duplicate_definitions.main(["--repo-root", str(self.repo)]), 1)

    def test_the_pass_and_fail_reports_are_distinguishable(self):
        clean = duplicate_definitions.format_report([], 10)
        self.assertIn("PASS", clean)
        self.assertNotIn("FAIL", clean)
        dirty = duplicate_definitions.format_report(
            [duplicate_definitions.Duplicate("a.py", "module", "f", [1, 9])], 10
        )
        self.assertIn("FAIL", dirty)
        self.assertNotIn("PASS", dirty)
        self.assertIn("a.py", dirty)
        self.assertIn("line 9", dirty)


class TestThisRepository(unittest.TestCase):
    def test_no_module_in_this_repository_defines_a_name_twice(self):
        duplicates = find_duplicates(REPO_ROOT)
        self.assertEqual(
            duplicates,
            [],
            "\n" + duplicate_definitions.format_report(duplicates, len(source_files(REPO_ROOT))),
        )

    def test_the_scan_actually_covers_this_repository(self):
        # A pass is only meaningful if it read the tree. The repository has well
        # over a hundred Python files alone; a collapse to a handful would make
        # the assertion above vacuous.
        self.assertGreater(len(source_files(REPO_ROOT)), 100)


if __name__ == "__main__":
    unittest.main()
