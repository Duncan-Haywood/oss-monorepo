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

    def test_repo_is_clean(self):
        self.assertEqual(main(["x"]), 0)


if __name__ == "__main__":
    unittest.main()
