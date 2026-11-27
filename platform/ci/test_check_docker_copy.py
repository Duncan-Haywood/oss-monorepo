"""Tests for check_docker_copy.py: the image's file list against the entry's imports."""
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_docker_copy as c  # noqa: E402


class DockerCopyTest(unittest.TestCase):
    def setUp(self):
        # Under the repo root, since check() reports paths relative to it.
        self.dir = Path(tempfile.mkdtemp(dir=c.ROOT / "platform" / "ci"))
        self.addCleanup(shutil.rmtree, self.dir)

    def write(self, name, text):
        p = self.dir / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        return p

    def test_missing_import_is_a_hit(self):
        self.write("server.mjs", 'import { a } from "./a.mjs";\nimport { b } from "./b.mjs";\n')
        self.write("a.mjs", "export const a = 1;\n")
        self.write("b.mjs", "export const b = 1;\n")
        df = self.write("Dockerfile", 'FROM node:22-alpine\nWORKDIR /app\nCOPY a.mjs server.mjs ./\nCMD ["node", "server.mjs"]\n')
        problems = c.check(df)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("./b.mjs", problems[0])

    def test_transitive_and_subfolder_imports(self):
        self.write("server.mjs", 'import "./lib/x.mjs";\n')
        self.write("lib/x.mjs", 'const w = new URL("../worker.mjs", import.meta.url);\nawait import("./y.mjs");\n')
        self.write("lib/y.mjs", "")
        self.write("worker.mjs", "")
        df = self.write("Dockerfile", 'FROM node:22\nWORKDIR /app\nCOPY server.mjs ./\nCOPY lib ./lib\nCMD ["node", "server.mjs"]\n')
        problems = c.check(df)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("../worker.mjs", problems[0])

    def test_clean_image_glob_and_from_stage_and_marker(self):
        self.write("server.mjs", 'import "./a.mjs";\nimport "./vendor/v.mjs";\n'
                                 'const d = new URL("./eval/", import.meta.url); // docker-copy: ok\n'
                                 '// import "./commented.mjs";\nimport x from "pkg";\n')
        self.write("a.mjs", "")
        df = self.write("Dockerfile", "FROM node:22 AS build\nRUN true\nFROM node:22\nWORKDIR /app\n"
                                      "COPY *.mjs ./\nCOPY --from=build /out/vendor ./vendor\n"
                                      "CMD node server.mjs\n")
        self.assertEqual(c.check(df), [])

    def test_directory_reference_needs_a_file_under_it(self):
        # pro/serve.mjs in apps/einvoice-preflight reads new URL("../fonts/", ...): satisfied
        # once the image copies the fonts folder, a hit while it does not.
        self.write("pro/serve.mjs", 'const FONTS = new URL("../fonts/", import.meta.url);\n')
        self.write("fonts/A.ttf", "x")
        base = 'FROM node:22\nWORKDIR /app\nCOPY pro ./pro\n'
        missing = self.write("Dockerfile", base + 'CMD ["node", "pro/serve.mjs"]\n')
        self.assertEqual(len(c.check(missing)), 1)
        ok = self.write("Dockerfile", base + 'COPY fonts ./fonts\nCMD ["node", "pro/serve.mjs"]\n')
        self.assertEqual(c.check(ok), [])

    def test_entry_not_copied_and_non_node_image_skipped(self):
        df = self.write("Dockerfile", 'FROM node:22\nWORKDIR /app\nCOPY \\\n  LICENSE ./\nCMD ["node", "server.mjs"]\n')
        self.write("LICENSE", "MIT\n")
        self.assertIn("entry server.mjs", c.check(df)[0])
        nginx = self.write("nginx/Dockerfile", "FROM nginx:1.27-alpine\nCOPY index.html /usr/share/nginx/html/\n")
        self.assertEqual(c.check(nginx), [])

    def test_repo_is_clean(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
