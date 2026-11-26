"""Tests for migration_regen.py against a real local git repo and a fake drizzle generate."""
import contextlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import migration_regen as mr  # noqa: E402

# Stands in for `drizzle-kit generate --name X`: writes the next NNNN_X.sql, its
# snapshot and a journal entry, with SQL read from schema.txt's last line.
FAKE_GEN = r'''
import json, sys, pathlib
name = sys.argv[1]
m = pathlib.Path("migrations"); meta = m / "meta"; meta.mkdir(parents=True, exist_ok=True)
j = meta / "_journal.json"
journal = json.loads(j.read_text()) if j.exists() else {"entries": []}
n = len(journal["entries"])
tag = f"{n:04d}_{name}"
(m / f"{tag}.sql").write_text(pathlib.Path("schema.txt").read_text().splitlines()[-1] + "\n")
(meta / f"{n:04d}_snapshot.json").write_text(json.dumps({"n": n}))
journal["entries"].append({"idx": n, "tag": tag})
j.write_text(json.dumps(journal, indent=2) + "\n")
'''


def sh(repo, *args):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    return r


class MigrationRegen(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "r"
        self.app = self.repo / "apps" / "a"
        self.app.mkdir(parents=True)
        self.gen_script = Path(self.tmp.name) / "gen.py"
        self.gen_script.write_text(FAKE_GEN)
        sh(self.repo, "init", "-q", "-b", "main")
        sh(self.repo, "config", "user.email", "t@example.com")
        sh(self.repo, "config", "user.name", "t")
        (self.app / "schema.txt").write_text("CREATE TABLE a;\n")
        self.gen("init")
        self.commit("init")

    def tearDown(self):
        self.tmp.cleanup()

    def gen(self, name):
        subprocess.run([sys.executable, str(self.gen_script), name], cwd=self.app, check=True)

    def commit(self, msg):
        sh(self.repo, "add", "-A")
        sh(self.repo, "commit", "-q", "-m", msg)

    def add_table(self, table, name):
        with open(self.app / "schema.txt", "a") as f:
            f.write(f"CREATE TABLE {table};\n")
        self.gen(name)
        self.commit(name)

    def run_tool(self, *extra):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = mr.main(["apps/a", "--repo", str(self.repo), "--base", "main", "--no-fetch",
                            "--generate-cmd", f"{sys.executable} {self.gen_script} {{name}}", *extra])
        return code, out.getvalue()

    def diverge(self):
        """main gains 0001_main_t; the branch made its own 0001_mine."""
        sh(self.repo, "checkout", "-q", "-b", "work")
        self.add_table("mine", "mine")
        sh(self.repo, "checkout", "-q", "main")
        self.add_table("theirs", "main_t")
        sh(self.repo, "checkout", "-q", "work")

    def test_no_migration_is_ok(self):
        sh(self.repo, "checkout", "-q", "-b", "work")
        code, out = self.run_tool()
        self.assertEqual(code, 0, out)
        self.assertIn("adds no migration", out)

    def test_next_number_is_ok(self):
        sh(self.repo, "checkout", "-q", "-b", "work")
        self.add_table("mine", "mine")
        code, out = self.run_tool()
        self.assertEqual(code, 0, out)
        self.assertIn("0001_mine.sql", out)

    def test_clash_found(self):
        self.diverge()
        code, out = self.run_tool()
        self.assertEqual(code, 1, out)
        self.assertIn("CLASH: your 0001_mine.sql; main has 0001_main_t.sql", out)

    def test_fix_mid_merge_conflict(self):
        self.diverge()
        r = sh(self.repo, "merge", "--no-edit", "main")
        self.assertNotEqual(r.returncode, 0, "expected the journal to conflict")
        # The schema conflicts too; resolve it as an agent would, keeping both tables.
        (self.app / "schema.txt").write_text("CREATE TABLE a;\nCREATE TABLE theirs;\nCREATE TABLE mine;\n")
        sh(self.repo, "add", "apps/a/schema.txt")
        code, out = self.run_tool("--fix")
        self.assertEqual(code, 0, out)
        self.assertIn("regenerated as 0002_mine.sql", out)
        mig = self.app / "migrations"
        self.assertEqual(sorted(p.name for p in mig.glob("*.sql")),
                         ["0000_init.sql", "0001_main_t.sql", "0002_mine.sql"])
        journal = json.loads((mig / "meta" / "_journal.json").read_text())
        self.assertEqual([e["tag"] for e in journal["entries"]], ["0000_init", "0001_main_t", "0002_mine"])
        self.assertEqual(sh(self.repo, "diff", "--name-only", "--diff-filter=U").stdout, "")
        self.assertEqual(sh(self.repo, "commit", "-q", "--no-edit").returncode, 0)
        self.assertEqual(self.run_tool()[0], 0)

    def test_fix_refuses_before_merge(self):
        # generating on the unmerged branch would drop main's new table
        self.diverge()
        code, out = self.run_tool("--fix")
        self.assertEqual(code, 2, out)
        self.assertIn("Merge main first", out)
        self.assertTrue((self.app / "migrations" / "0001_mine.sql").exists(), "touched nothing")

    def test_fix_refuses_unresolved_schema(self):
        self.diverge()
        sh(self.repo, "merge", "--no-edit", "main")
        code, out = self.run_tool("--fix")
        self.assertEqual(code, 2, out)
        self.assertIn("apps/a/schema.txt", out)
        self.assertTrue((self.app / "migrations" / "0001_mine.sql").exists(), "touched nothing")

    def test_hand_edit_reported(self):
        self.diverge()
        sql = self.app / "migrations" / "0001_mine.sql"
        sql.write_text(sql.read_text() + "UPDATE mine SET x = 1;\n")
        self.commit("backfill")
        sh(self.repo, "merge", "--no-edit", "main")
        (self.app / "schema.txt").write_text("CREATE TABLE a;\nCREATE TABLE theirs;\nCREATE TABLE mine;\n")
        sh(self.repo, "add", "apps/a/schema.txt")
        code, out = self.run_tool("--fix")
        self.assertEqual(code, 1, out)
        self.assertIn("-UPDATE mine SET x = 1;", out)
        self.assertIn("add back any hand-written statements", out)


if __name__ == "__main__":
    unittest.main()
