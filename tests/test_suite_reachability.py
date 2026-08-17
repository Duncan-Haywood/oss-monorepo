"""No test is defined below its own file's `if __name__ == "__main__":` guard.

A test class written after the guard runs under `pytest`, which collects by
importing the module and does not care where the guard sits — so CI stays
green and nothing looks wrong. Run the same file as a script, which is how
these are debugged by hand and how several of the gate modules invite you to
run them, and `unittest.main()` executes at the guard: the classes below it
have not been defined yet, so they are silently not run. The file reports
"OK" over a strictly smaller suite than the one it contains.

Found live on 2026-08-17 in `tests/test_register_claims.py`, where
`ImageRegisterGuardTests` — five tests holding the image register's
claim-name guard, the control that stops a decorative claim being written —
sat four lines below the guard. Under `pytest` all five ran and passed;
run as a script the file printed a clean result for the 60 tests above it.

This is the same shape as every other hole this repository keeps closing: a
control that is present, correct, and on no path the runner takes. The rule
is stated over `git ls-files` rather than over a list of files, so a new test
module is enrolled by existing.
"""

import ast
import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def _tracked_python_sources() -> list[str]:
    """Every tracked `.py` path, from git rather than a walk of the filesystem.

    A `readdirSync`-style walk here would count an untracked scratch file or a
    dependency's vendored tests as repository code, which has produced a false
    reading in this repo before.
    """
    result = subprocess.run(
        ["git", "ls-files", "*.py"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return sorted(p for p in result.stdout.split("\n") if p)


def _is_main_guard(node: ast.stmt) -> bool:
    """`if __name__ == "__main__":`, in the shapes it is actually written in.

    Matched structurally rather than by text so that `'__main__' == __name__`
    and `__name__ in ("__main__",)` are recognised too — a rule that only knew
    one spelling would be a denylist, which is the shape this repository has
    had to correct more than once.
    """
    if not isinstance(node, ast.If):
        return False
    for child in ast.walk(node.test):
        if isinstance(child, ast.Name) and child.id == "__name__":
            return True
    return False


def definitions_below_the_main_guard(source: str) -> list[tuple[int, str]]:
    """`(lineno, name)` for every top-level def/class written after the guard.

    Only module level is inspected. A guard nested inside a function is not
    the module's entry point and does not shadow anything.
    """
    tree = ast.parse(source)
    guard_seen = False
    unreachable: list[tuple[int, str]] = []
    for node in tree.body:
        if _is_main_guard(node):
            guard_seen = True
            continue
        if guard_seen and isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            unreachable.append((node.lineno, node.name))
    return unreachable


class TestNothingIsDefinedBelowTheMainGuard(unittest.TestCase):
    def test_no_tracked_python_file_defines_anything_below_its_guard(self):
        offenders: list[str] = []
        for rel in _tracked_python_sources():
            path = REPO_ROOT / rel
            try:
                source = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            try:
                found = definitions_below_the_main_guard(source)
            except SyntaxError:
                # Not this contract's job. A file that does not parse is
                # already a red somewhere else, and guessing at its structure
                # here would report a second, misleading failure.
                continue
            for lineno, name in found:
                offenders.append(f"{rel}:{lineno} defines {name!r} below the file's __main__ guard")

        self.assertEqual(
            offenders,
            [],
            "\n".join(
                ["These definitions never run when their file is executed as a script:", *offenders]
            ),
        )

    def test_the_population_is_not_empty(self):
        """A rule over an empty file set is a passing gate.

        If `git ls-files *.py` ever returns nothing — wrong cwd, a git failure
        swallowed into an empty string — the test above passes over zero files
        and says nothing. This is the check that notices.
        """
        sources = _tracked_python_sources()
        self.assertGreater(
            len(sources),
            30,
            f"only {len(sources)} tracked Python files found; the enumeration is not reading the repository",
        )
        self.assertIn("scripts/ci/cap_ratchet.py", sources)

    def test_the_matcher_catches_the_defect_it_was_written_for(self):
        """Feed the detector the real shape, so a broken matcher cannot pass.

        The test above reads the live tree and is green today. It would be
        green identically if `definitions_below_the_main_guard` returned `[]`
        for every input — the failure mode that has bitten this repo before,
        where a guard filtered a list against itself and could not fail. This
        is the synthetic source that proves the matcher still works.
        """
        offending = (
            "import unittest\n"
            "\n"
            "class Above(unittest.TestCase):\n"
            "    pass\n"
            "\n"
            'if __name__ == "__main__":\n'
            "    unittest.main()\n"
            "\n"
            "class Below(unittest.TestCase):\n"
            "    pass\n"
        )
        self.assertEqual(definitions_below_the_main_guard(offending), [(9, "Below")])

    def test_a_correctly_ordered_file_is_clean(self):
        correct = (
            "import unittest\n"
            "\n"
            "class Above(unittest.TestCase):\n"
            "    pass\n"
            "\n"
            'if __name__ == "__main__":\n'
            "    unittest.main()\n"
        )
        self.assertEqual(definitions_below_the_main_guard(correct), [])

    def test_a_file_with_no_guard_is_clean(self):
        self.assertEqual(definitions_below_the_main_guard("class A:\n    pass\n"), [])

    def test_a_guard_nested_inside_a_function_does_not_arm_the_rule(self):
        """Only a module-level guard is the entry point.

        Without this the rule would flag every definition following any nested
        `__name__` comparison, and the noise would get it deleted.
        """
        nested = (
            "def build():\n"
            '    if __name__ == "__main__":\n'
            "        pass\n"
            "\n"
            "class After:\n"
            "    pass\n"
        )
        self.assertEqual(definitions_below_the_main_guard(nested), [])

    def test_the_reversed_comparison_is_recognised(self):
        reversed_form = (
            '__name__ == "__main__"\n'
            'if "__main__" == __name__:\n'
            "    pass\n"
            "\n"
            "def after():\n"
            "    pass\n"
        )
        self.assertEqual(definitions_below_the_main_guard(reversed_form), [(5, "after")])


if __name__ == "__main__":
    unittest.main()
