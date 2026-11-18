import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import check_cli_entry as cce

FRAGILE = [
    "if (import.meta.url === `file://${process.argv[1]}`) main();",
    "const isMain = import.meta.url === `file://${process.argv[1]}`;",
    "if (import.meta.url === `file://${process.argv[1] ?? \"\"}`) {}",
    "if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {}",
    "if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {}",
    "if (process.argv[1] && import.meta.url === new URL(process.argv[1], \"file://\").href) {}",
    "if (`file://${process.argv[1]}` === import.meta.url) {}",
]
ROBUST = [
    "if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();",
    "if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === "
    "(await import('node:url')).pathToFileURL(process.argv[1]).href) {}",
    "if (process.argv[1] === fileURLToPath(import.meta.url)) {}",
    "execFileSync('git', ['clone', `file://${dir}`, clone]);",
]


class TestCheckCliEntry(unittest.TestCase):
    def tree(self, files):
        root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root)
        for rel, text in files.items():
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8")
        return root

    def test_every_fragile_form_is_flagged(self):
        for i, line in enumerate(FRAGILE):
            with self.subTest(line=line):
                root = self.tree({f"ventures/v{i}/cli.mjs": f"// x\n{line}\n"})
                bad = cce.findings(root)
                self.assertEqual(len(bad), 1, bad)
                self.assertIn(f"ventures/v{i}/cli.mjs:2:", bad[0])

    def test_robust_forms_pass(self):
        root = self.tree({f"ventures/v{i}/cli.mjs": line + "\n" for i, line in enumerate(ROBUST)}
                         | {"ventures/v9/x.mjs": "const u = import.meta.url;\n"})
        self.assertEqual(cce.findings(root), [])

    def test_node_modules_is_skipped(self):
        root = self.tree({"ventures/v/node_modules/dep/cli.mjs": FRAGILE[0]})
        self.assertEqual(cce.findings(root), [])

    def test_main_exit_code(self):
        self.assertEqual(cce.main(["--root", str(self.tree({"ventures/v/a.mjs": ROBUST[0]}))]), 0)
        self.assertEqual(cce.main(["--root", str(self.tree({"ventures/v/a.mjs": FRAGILE[0]}))]), 1)

    @unittest.skipUnless(shutil.which("node"), "needs node")
    def test_the_fragile_guard_really_is_false_from_a_folder_with_a_space(self):
        """The defect the check exists for, shown with node itself."""
        root = self.tree({
            "My Projects/fragile.mjs": FRAGILE[0].replace("main()", "console.log('ran')") + "\n",
            "My Projects/robust.mjs": 'import { pathToFileURL } from "node:url";\n'
                                      + ROBUST[0].replace("main()", "console.log('ran')") + "\n",
        })
        run = lambda f: subprocess.run(["node", str(root / "My Projects" / f)],
                                       capture_output=True, text=True).stdout.strip()
        self.assertEqual(run("fragile.mjs"), "")
        self.assertEqual(run("robust.mjs"), "ran")

    def test_repository_is_clean(self):
        self.assertEqual(cce.findings(cce.ROOT), [])


if __name__ == "__main__":
    unittest.main()
