import tempfile
import unittest
from pathlib import Path

from check_storage_guard import check_tree, main, run_contract, unguarded_reads, unshaped_parses


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

    def test_identifiers_that_merely_start_with_localstorage_are_not_reads(self):
        # `localStorageKey` / `myLocalStorage`-style names are not the global.
        self.assertEqual(unguarded_reads("const k = localStorageKey;\nfoo(localStorageBackup);\n"), [])
        self.assertEqual(unguarded_reads("const v = localStorage.x;\n"), [1])

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


class UnshapedParses(unittest.TestCase):
    def test_flags_a_write_to_an_unchecked_parse(self):
        src = "try {\n  const c = JSON.parse(s.getItem(K) || '{}');\n  c[e] = (c[e] || 0) + 1;\n} catch {}\n"
        self.assertEqual(unshaped_parses(src), [2])

    def test_flags_a_dotted_write(self):
        src = "const c = JSON.parse(s.getItem(K) || '{}');\nc.last_day = d;\n"
        self.assertEqual(unshaped_parses(src), [1])

    def test_a_shape_check_clears_it(self):
        src = ("let c = JSON.parse(s.getItem(K) || '{}');\n"
               "if (!c || typeof c !== 'object' || Array.isArray(c)) c = {};\nc[e] = 1;\n")
        self.assertEqual(unshaped_parses(src), [])
        src = "const c = JSON.parse(s.getItem(K) || '{}');\nif (Array.isArray(c)) return;\nc[e] = 1;\n"
        self.assertEqual(unshaped_parses(src), [])

    def test_read_only_parse_and_comparison_are_not_writes(self):
        self.assertEqual(unshaped_parses("const c = JSON.parse(raw);\nreturn c[e] === 1;\n"), [])

    def test_tree_reports_it(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "a"
            v.mkdir()
            (v / "usage.mjs").write_text("try {\n  const c = JSON.parse(x || '{}');\n  c[e] = 1;\n} catch {}\n")
            self.assertEqual(len(check_tree(d)), 1)


GOOD = (Path(__file__).resolve().parents[2] / "ventures" / "uk-rd-tax-relief-calculator" / "usage.mjs").read_text()
# The two mutants a red-team campaign seeded on 2026-11-11 that the venture's
# own suite missed; the contract must reject both.
MUTANTS = {
    "record keeps a non-object": (
        'typeof current !== "object" || Array.isArray(current)',
        'typeof current !== "object" && Array.isArray(current)',
    ),
    "readUsage returns a non-object": (
        'typeof parsed === "object" && !Array.isArray(parsed)',
        'typeof parsed === "object" || !Array.isArray(parsed)',
    ),
    "Global Privacy Control ignored": (
        ' || navigator.globalPrivacyControl', '',
    ),
    "opt-out keeps counters": (
        'try { localStorage.removeItem(KEY); } catch { /* storage is optional */ }', '',
    ),
}


class Contract(unittest.TestCase):
    def tree(self, d, src, name="a"):
        v = Path(d) / name
        v.mkdir()
        (v / "usage.mjs").write_text(src)

    def test_a_correct_counter_passes(self):
        with tempfile.TemporaryDirectory() as d:
            self.tree(d, GOOD)
            self.assertEqual(main(["x", d]), 0)

    def test_each_seeded_mutant_fails(self):
        for label, (old, new) in MUTANTS.items():
            self.assertIn(old, GOOD, label)
            with self.subTest(label), tempfile.TemporaryDirectory() as d:
                self.tree(d, GOOD.replace(old, new))
                code, out = run_contract(d)
                self.assertEqual(code, 1, out)
                self.assertEqual(main(["x", d]), 1)

    def test_a_module_that_throws_on_import_fails(self):
        with tempfile.TemporaryDirectory() as d:
            self.tree(d, 'throw new Error("boom");\n')
            code, out = run_contract(d)
            self.assertEqual(code, 1)
            self.assertIn("failed to import", out)

    def test_other_designs_are_skipped_not_failed(self):
        with tempfile.TemporaryDirectory() as d:
            self.tree(d, "export function recordEvent() {}\n")
            self.tree(d, "export function record(storage = globalThis.localStorage) {}\n", "b")
            code, out = run_contract(d)
            self.assertEqual(code, 0, out)
            self.assertIn("0 files OK", out)


if __name__ == "__main__":
    unittest.main()
