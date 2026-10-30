import tempfile
import unittest
from pathlib import Path

from check_storage_guard import check_tree, main, unguarded_reads


class UnguardedReads(unittest.TestCase):
    def test_flags_bare_typeof(self):
        src = 'export function record() {\n  if (typeof localStorage === "undefined") return;\n}\n'
        self.assertEqual(unguarded_reads(src), [2])

    def test_try_block_is_guarded(self):
        src = 'function f() {\n  try {\n    return typeof localStorage === "undefined";\n  } catch {\n    return true;\n  }\n}\n'
        self.assertEqual(unguarded_reads(src), [])

    def test_read_after_the_try_is_flagged(self):
        src = 'try {\n  a();\n} catch {}\nlocalStorage.getItem("k");\n'
        self.assertEqual(unguarded_reads(src), [4])

    def test_identifier_starting_with_try_is_not_a_try_block(self):
        for name in ("tryIt", "try2", "_try", "try_", "try$", "$try"):
            src = f"function {name}() {{\n  localStorage.getItem('k');\n}}\n"
            self.assertEqual(unguarded_reads(src), [2], name)

    def test_try_preceded_by_identifier_chars_further_back_still_guards(self):
        # Only the char directly before `try` decides; ones further back must not.
        src = "ab;try { localStorage.getItem('k'); } catch {}\n"
        self.assertEqual(unguarded_reads(src), [])

    def test_line_number_when_source_starts_with_newline(self):
        self.assertEqual(unguarded_reads("\nlocalStorage.getItem('k');\n"), [2])

    def test_comments_and_strings_are_ignored(self):
        src = '// localStorage throws\nconst k = "localStorage";\n'
        self.assertEqual(unguarded_reads(src), [])


class Tree(unittest.TestCase):
    def test_tree_and_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "a"
            v.mkdir()
            (v / "usage.mjs").write_text("if (typeof localStorage === 'undefined') return;\n")
            self.assertEqual(len(check_tree(d)), 1)
            self.assertEqual(main(["x", d]), 1)
            (v / "usage.mjs").write_text("try { localStorage.getItem('k'); } catch {}\n")
            self.assertEqual(main(["x", d]), 0)

    def test_default_root_is_the_ventures_dir_and_not_empty(self):
        import check_storage_guard as g
        seen = []
        orig = g.check_tree
        g.check_tree = lambda root: seen.append(Path(root)) or []
        try:
            main(["x"])
        finally:
            g.check_tree = orig
        self.assertTrue(list(seen[0].glob("*/usage.mjs")), seen[0])

    def test_repo_is_clean(self):
        self.assertEqual(main(["x"]), 0)


if __name__ == "__main__":
    unittest.main()
