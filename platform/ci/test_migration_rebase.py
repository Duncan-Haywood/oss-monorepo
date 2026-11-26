import contextlib, io, json, os, subprocess, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from migration_rebase import main, norm

# A stand-in for `drizzle-kit generate --name X`: writes the next-numbered SQL (the
# tables listed in schema.txt that no earlier migration creates), a snapshot and a
# journal entry, as drizzle-kit does.
FAKE = r'''
import json, os, re, sys
name = sys.argv[sys.argv.index("--name") + 1]
mig = "migrations"
have = "".join(open(os.path.join(mig, f)).read() for f in os.listdir(mig) if f.endswith(".sql"))
want = [t for t in open("schema.txt").read().split() if f"`{t}`" not in have]
if not want:
    print("No schema changes"); sys.exit(0)
j = json.load(open(os.path.join(mig, "meta", "_journal.json")))
n = len(j["entries"])
tag = f"{n:04d}_{name}"
open(os.path.join(mig, tag + ".sql"), "w").write("".join(f"CREATE TABLE `{t}` (id text);\n" for t in want))
open(os.path.join(mig, "meta", f"{n:04d}_snapshot.json"), "w").write(json.dumps({"id": tag}))
j["entries"].append({"idx": n, "tag": tag})
json.dump(j, open(os.path.join(mig, "meta", "_journal.json"), "w"), indent=2)
'''


def sh(cwd, *cmd):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return r


class MigrationRebase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        self.app = os.path.join(self.repo, "apps", "x")
        os.makedirs(os.path.join(self.app, "migrations", "meta"))
        self.fake = os.path.join(self.repo, "fake_gen.py")
        open(self.fake, "w").write(FAKE)
        for c in (["init", "-q", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"]):
            sh(self.repo, "git", *c)
        json.dump({"entries": []}, open(os.path.join(self.app, "migrations", "meta", "_journal.json"), "w"))
        self.schema("base")
        self.gen("init")
        self.commit("base")

    def tearDown(self):
        self.tmp.cleanup()

    def schema(self, *tables):
        open(os.path.join(self.app, "schema.txt"), "w").write("\n".join(tables) + "\n")

    def gen(self, name):
        sh(self.app, sys.executable, self.fake, "--name", name)

    def commit(self, msg):
        sh(self.repo, "git", "add", "-A")
        sh(self.repo, "git", "commit", "-qm", msg)

    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main([self.app, "--base", "main", "--generate", f"{sys.executable} {self.fake}", *args])
        return code, out.getvalue() + err.getvalue()

    def parallel(self):
        """main gains 0001_a; branch feat (from before it) made 0001_b."""
        sh(self.repo, "git", "checkout", "-q", "-b", "feat")
        self.schema("base", "b")
        self.gen("b")
        self.commit("b")
        sh(self.repo, "git", "checkout", "-q", "main")
        self.schema("base", "a")
        self.gen("a")
        self.commit("a")
        sh(self.repo, "git", "checkout", "-q", "feat")

    def migs(self):
        return sorted(f for f in os.listdir(os.path.join(self.app, "migrations")) if f.endswith(".sql"))

    def test_no_new_migration(self):
        code, out = self.run_main()
        self.assertEqual(code, 0)
        self.assertIn("adds no migration", out)

    def test_numbered_after_main_is_ok(self):
        self.schema("base", "c")
        self.gen("c")
        code, out = self.run_main()
        self.assertEqual(code, 0)
        self.assertIn("ok, 0001_c.sql", out)

    def test_collision_is_reported(self):
        self.parallel()
        code, out = self.run_main()
        self.assertEqual(code, 1)
        self.assertIn("collision: 0001_b.sql", out)

    def test_fix_refuses_before_merge(self):
        # generating before main is merged would drop main's tables
        self.parallel()
        code, out = self.run_main("--fix")
        self.assertEqual(code, 2)
        self.assertIn("merge main first", out)
        self.assertEqual(self.migs(), ["0000_init.sql", "0001_b.sql"])

    def test_fix_refuses_other_conflicts(self):
        self.parallel()
        sh(self.repo, "git", "merge", "main")  # schema.txt and the journal conflict
        code, out = self.run_main("--fix")
        self.assertEqual(code, 2)
        self.assertIn("schema.txt", out)

    def test_fix_mid_merge_renumbers(self):
        self.parallel()
        sh(self.repo, "git", "merge", "main")
        self.schema("base", "a", "b")  # the run resolves its schema conflict by hand
        sh(self.repo, "git", "add", "apps/x/schema.txt")
        code, out = self.run_main("--fix")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.migs(), ["0000_init.sql", "0001_a.sql", "0002_b.sql"])
        self.assertIn("same SQL as before", out)
        j = json.load(open(os.path.join(self.app, "migrations", "meta", "_journal.json")))
        self.assertEqual([e["tag"] for e in j["entries"]], ["0000_init", "0001_a", "0002_b"])
        backups = os.path.join(self.repo, ".git", "migration-rebase")
        self.assertTrue(any("0001_b.sql" in fs for _, _, fs in os.walk(backups)))

    def test_fix_after_merge_commit(self):
        self.parallel()
        sh(self.repo, "git", "merge", "main")
        self.schema("base", "a", "b")
        sh(self.repo, "git", "checkout", "main", "--", "apps/x/migrations/meta")  # a run that took main's meta
        self.commit("merge")
        code, out = self.run_main("--fix", "--name", "bee")
        self.assertEqual(code, 0, out)
        self.assertIn("0002_bee.sql", self.migs())

    def test_hand_written_migration_is_flagged(self):
        self.parallel()
        with open(os.path.join(self.app, "migrations", "0001_b.sql"), "a") as f:
            f.write("UPDATE b SET id = 'x';\n")
        self.commit("hand edit")
        sh(self.repo, "git", "merge", "main")
        self.schema("base", "a", "b")
        sh(self.repo, "git", "add", "apps/x/schema.txt")
        code, out = self.run_main("--fix")
        self.assertEqual(code, 0, out)
        self.assertIn("SQL differs", out)

    def test_norm_ignores_breakpoints_and_space(self):
        self.assertEqual(norm("A;\n--> statement-breakpoint\nB;"), norm("A; B;"))


if __name__ == "__main__":
    unittest.main()
