import tempfile
import unittest
from pathlib import Path

from check_storage_guard import (bare_storage_args, check_tree, default_param_reads, inline_reads, main, run_contract,
                                 script_sources,
                                 unguarded_reads,
                                 unguarded_typeof, unshaped_parses)


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
    # 2026-11-14: the red-team escape, and the persistence no suite reloaded to see.
    "blocked storage read as an opt-out": (
        "    // A blocked or full store must never be read as consent.\n    return false;",
        "    // A blocked or full store must never be read as consent.\n    return true;",
    ),
    "opt-out forgotten on the next page load": (
        'try { localStorage.setItem(OPT_OUT, "1"); } catch { /* storage is optional */ }', '',
    ),
}


# The second design (usageAllowed/recordEvent/toggleUsage). Two of its copies'
# own suites let these `||`-to-`&&` mutants through in red-team campaigns on
# 2026-11-11 (dog-walking-route-pricing, vending-machine-route-margin).
EVENT_GOOD = (Path(__file__).resolve().parents[2] / "ventures" / "vending-machine-route-margin" / "usage.mjs").read_text()
SHAPE = "if (!counts || typeof counts !== 'object' || Array.isArray(counts)) counts = {};"
EVENT_MUTANTS = {
    "null or a number kept": (SHAPE, SHAPE.replace("!counts ||", "!counts &&")),
    "an array kept": (SHAPE, SHAPE.replace("'object' ||", "'object' &&")),
    "Do Not Track ignored": ("navigator.doNotTrack === '1' || ", ""),
    "opt-out ignored": ("return ls.getItem(OPT_OUT) !== 'true';", "return true;"),
    "blocked storage throws": ("  } catch {\n    return null;\n  }", "  } finally {}"),
    "opt-out forgotten on the next page load": ("ls.setItem(OPT_OUT, enabled ? 'false' : 'true');", ""),
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

    def test_a_correct_event_counter_passes(self):
        with tempfile.TemporaryDirectory() as d:
            self.tree(d, EVENT_GOOD)
            code, out = run_contract(d)
            self.assertEqual(code, 0, out)
            self.assertIn("1 files OK", out)

    def test_each_event_counter_mutant_fails(self):
        for label, (old, new) in EVENT_MUTANTS.items():
            self.assertIn(old, EVENT_GOOD, label)
            with self.subTest(label), tempfile.TemporaryDirectory() as d:
                self.tree(d, EVENT_GOOD.replace(old, new))
                code, out = run_contract(d)
                self.assertEqual(code, 1, out)

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


class BareStorageArgs(unittest.TestCase):
    """Red team 2026-11-14: 292 pages passed the bare global to usage.mjs."""

    PAGE = "import { recordUsage, readOptOut as ro } from './usage.mjs';\n{}\n"

    def test_flags_each_spelling_of_the_global(self):
        for arg in ("localStorage", "window.localStorage", "globalThis.localStorage", " localStorage"):
            with self.subTest(arg=arg):
                self.assertEqual(bare_storage_args(self.PAGE.replace("{}", f"recordUsage({arg}, false, 'x');")), [2])

    def test_flags_an_aliased_import(self):
        self.assertEqual(bare_storage_args(self.PAGE.replace("{}", "ro(localStorage);")), [2])

    def test_the_guarded_helper_and_other_modules_pass(self):
        self.assertEqual(bare_storage_args(self.PAGE.replace("{}", "recordUsage(usageStorage(), false, 'x');")), [])
        self.assertEqual(bare_storage_args(self.PAGE.replace("{}", "saveScenario(localStorage, s);")), [])
        self.assertEqual(bare_storage_args("recordUsage(localStorage);\n"), [], "no usage.mjs import, not ours")

    def test_comments_do_not_count(self):
        self.assertEqual(bare_storage_args(self.PAGE.replace("{}", "// recordUsage(localStorage) was the bug")), [])

    def test_a_default_parameter_reading_the_global_is_flagged(self):
        self.assertEqual(unguarded_reads("export function recordUsage(storage = globalThis.localStorage) {\n}\n"), [1])

    def test_tree_reports_pages_and_skips_tests_and_node_modules(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "a"
            (v / "node_modules").mkdir(parents=True)
            (v / "usage.mjs").write_text("export function usageStorage() { try { return globalThis.localStorage; } catch { return null; } }\n")
            bad = self.PAGE.replace("{}", "recordUsage(localStorage);")
            (v / "page.test.mjs").write_text(bad)
            (v / "node_modules" / "x.mjs").write_text(bad)
            self.assertEqual(check_tree(d), [])
            (v / "index.html").write_text(bad)
            self.assertEqual(len(check_tree(d)), 1)


class UnguardedTypeof(unittest.TestCase):
    """Red team 2026-11-14: 21 page scripts died at the top on a bare `typeof localStorage`."""

    SNIPPET = ("(() => {\n"
               "  if (typeof document === 'undefined' || typeof localStorage === 'undefined') return;\n"
               "  try { localStorage.getItem('k'); } catch {}\n"
               "})();\n")
    FIXED = SNIPPET.replace(
        "if (typeof document === 'undefined' || typeof localStorage === 'undefined') return;",
        "if (typeof document === 'undefined') return;\n  try { if (typeof localStorage === 'undefined') return; } catch { return; }")

    def test_flags_the_snippet_and_each_spelling(self):
        self.assertEqual(unguarded_typeof(self.SNIPPET), [2])
        for g in ("window.", "globalThis.", "self."):
            self.assertEqual(unguarded_typeof(f"if (typeof {g}localStorage !== 'undefined') x();\n"), [1], g)

    def test_the_wrapped_probe_passes(self):
        self.assertEqual(unguarded_typeof(self.FIXED), [])

    def test_other_bare_reads_are_not_this_check(self):
        self.assertEqual(unguarded_typeof("localStorage.getItem('k');\n"), [])

    def test_html_scripts_are_read_one_by_one_and_json_is_skipped(self):
        html = ("<p>Don't worry, it's typeof localStorage in prose</p>\n"
                '<script type="application/ld+json">{"a": "typeof localStorage"}</script>\n'
                "<script>\n" + self.SNIPPET + "</script>\n")
        found = [(start + n - 1) for start, code in script_sources(Path("x.html"), html) for n in unguarded_typeof(code)]
        self.assertEqual(found, [5])

    def test_tree_reports_html_and_modules_and_skips_tests(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "a"
            v.mkdir()
            (v / "app.test.mjs").write_text(self.SNIPPET)
            self.assertEqual(check_tree(d), [])
            (v / "app.js").write_text(self.SNIPPET)
            (v / "index.html").write_text("<script>\n" + self.SNIPPET + "</script>\n")
            got = sorted(p.split(d)[1] for p in check_tree(d))
            self.assertEqual(got, ["/a/app.js:2: `typeof localStorage` outside try throws when site data is blocked",
                                   "/a/index.html:3: `typeof localStorage` outside try throws when site data is blocked"])
            (v / "app.js").write_text(self.FIXED)
            (v / "index.html").write_text("<script>\n" + self.FIXED + "</script>\n")
            self.assertEqual(check_tree(d), [])


class DefaultParamReads(unittest.TestCase):
    """Red team 2026-11-14: 18 page-module functions defaulted to the bare global."""

    def test_flags_each_shape(self):
        for src in ("export function load(storage = globalThis.localStorage) {\n}\n",
                    "function save(v, s = window.localStorage, now = new Date()) {\n}\n",
                    "const read = (s = localStorage) => s.getItem('k');\n"):
            with self.subTest(src=src):
                self.assertEqual(default_param_reads(src), [1])

    def test_guarded_defaults_and_plain_reads_pass(self):
        src = ("function load(storage = browserStorage()) {}\n"
               "function f(s = globalThis.localStorage ?? null) {}\n"
               "// function g(s = localStorage) {}\n"
               "f(localStorage);\n")
        self.assertEqual(default_param_reads(src), [])

    def test_tree_reports_a_page_module(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "a"
            v.mkdir()
            (v / "store.mjs").write_text("\nexport function load(storage = globalThis.localStorage) {\n  try { return storage.getItem('k'); } catch { return null; }\n}\n")
            got = [p.split(d)[1] for p in check_tree(d)]
            self.assertEqual(got, ["/a/store.mjs:2: default parameter reads `localStorage` outside try"])


class InlineReads(unittest.TestCase):
    """Red team 2026-11-14: inline page scripts are held at zero bare reads."""

    SAFE = "const safe = fn => { try { return fn(); } catch { return null; } };\n"

    def test_a_handler_read_is_flagged(self):
        self.assertEqual(inline_reads("b.onclick = () => { localStorage.removeItem('k'); };\n"), [1])

    def test_a_read_in_try_passes(self):
        self.assertEqual(inline_reads("b.onclick = () => { try { localStorage.removeItem('k'); } catch {} };\n"), [])

    def test_safe_passes_only_when_safe_is_a_try_wrapper(self):
        use = "safe(() => localStorage.removeItem('k'));\n"
        self.assertEqual(inline_reads(self.SAFE + use), [])
        self.assertEqual(inline_reads("const safe = (fn) => { try { fn(); } catch {} };\n" + use), [])
        self.assertEqual(inline_reads(use), [1], "no definition: safe proves nothing")
        self.assertEqual(inline_reads("const safe = fn => fn();\n" + use), [2], "a safe that does not try")

    def test_a_bare_read_beside_a_safe_one_is_flagged(self):
        self.assertEqual(inline_reads(self.SAFE + "safe(() => localStorage.getItem('a')); localStorage.getItem('b');\n"), [2])

    def test_tree_reports_an_html_handler_read_once(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "a"
            v.mkdir()
            (v / "index.html").write_text("<p>it's</p>\n<script>\nb.onclick = () => { localStorage.clear(); };\n</script>\n")
            self.assertEqual([p.split(d)[1] for p in check_tree(d)],
                             ["/a/index.html:3: inline script reads `localStorage` outside try"])
