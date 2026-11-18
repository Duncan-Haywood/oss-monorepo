import tempfile
import unittest
from pathlib import Path

import check_test_spawn_cwd as c


class FindingsTest(unittest.TestCase):
    def test_flags_relative_script_without_cwd(self):
        src = 'const out = execFileSync(process.execPath, ["cli.mjs", "--x", f], { encoding: "utf8" });\n'
        self.assertEqual(c.findings_in(src), [(1, "cli.mjs")])

    def test_the_2026_11_14_shape(self):
        # import-site-wages.test.mjs before the fix: options without cwd, script first.
        src = ('x;\nconst out = execFileSync(process.execPath, ["cli.mjs", "--import-7shifts-staff", f], '
               '{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });\n')
        self.assertEqual(c.findings_in(src), [(2, "cli.mjs")])

    def test_cwd_on_a_later_line_passes(self):
        src = ('execFileSync("node", ["cli.mjs", "--a", b], {\n'
               '  cwd: new URL(".", import.meta.url).pathname,\n  encoding: "utf8",\n});\n')
        self.assertEqual(c.findings_in(src), [])

    def test_cwd_import_meta_dirname_passes(self):
        src = 'spawnSync(process.execPath, ["./cli.mjs"], { cwd: import.meta.dirname, encoding: "utf8" });'
        self.assertEqual(c.findings_in(src), [])

    def test_flags_after_node_flags_and_in_subdir(self):
        src = 'spawn(process.execPath, ["--test-reporter=tap", "bin/run.js"]);'
        self.assertEqual(c.findings_in(src), [(1, "bin/run.js")])

    def test_absolute_or_variable_paths_pass(self):
        for src in ('execFileSync(process.execPath, [cli, "--help"]);',
                    'execFileSync(process.execPath, [join(here, "cli.mjs")]);',
                    'execFileSync(process.execPath, ["/opt/x/cli.mjs"]);',
                    'execFileSync(process.execPath, ["-e", "console.log(1)"]);'):
            self.assertEqual(c.findings_in(src), [], src)

    def test_fork_and_shell_forms(self):
        self.assertEqual(c.findings_in('fork("worker.mjs", []);'), [(1, "worker.mjs")])
        self.assertEqual(c.findings_in('execSync("node cli.mjs --help");'), [(1, "cli.mjs")])
        self.assertEqual(c.findings_in('execSync("node cli.mjs --help", { cwd: here });'), [])


class MainTest(unittest.TestCase):
    def test_exit_codes_on_a_tree(self):
        with tempfile.TemporaryDirectory() as d:
            v = Path(d) / "ventures" / "x"
            v.mkdir(parents=True)
            (v / "a.test.mjs").write_text('execFileSync(process.execPath, ["cli.mjs"], {});\n')
            (v / "not-a-test.mjs").write_text('execFileSync(process.execPath, ["cli.mjs"], {});\n')
            self.assertEqual(c.main(["--root", d]), 1)
            (v / "a.test.mjs").write_text('execFileSync(process.execPath, ["cli.mjs"], { cwd: import.meta.dirname });\n')
            self.assertEqual(c.main(["--root", d]), 0)

    def test_repository_is_clean(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
