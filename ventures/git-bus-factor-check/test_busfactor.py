import json
import os
import subprocess
import sys
import tempfile
import unittest

import busfactor as bf

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = open(os.path.join(HERE, "fixture.txt"), encoding="utf-8").read()


class Parse(unittest.TestCase):
    def test_rename_notations_resolve_to_the_new_path(self):
        self.assertEqual(bf.clean_path("api/{old => new}/users.py"), "api/new/users.py")
        self.assertEqual(bf.clean_path("{ => src}/a.py"), "src/a.py")
        self.assertEqual(bf.clean_path("a.py => b/c.py"), "b/c.py")

    def test_binary_files_count_as_one_line(self):
        commits = bf.parse_log("@@|A|a@x.io|100\n-\t-\tlogo.png\n")
        self.assertEqual(commits[0]["files"], [("logo.png", 1)])

    def test_author_name_may_contain_a_pipe(self):
        c = bf.parse_log("@@|Ann | Bo|ab@x.io|100\n1\t1\tf\n")[0]
        self.assertEqual((c["name"], c["email"]), ("Ann | Bo", "ab@x.io"))

    def test_garbage_headers_are_skipped_not_fatal(self):
        self.assertEqual(bf.parse_log("@@|only|two\n1\t1\tf\n"), [])
        self.assertEqual(bf.parse_log("@@|n|e@x|notanumber\n"), [])


class Analyze(unittest.TestCase):
    def setUp(self):
        self.r = bf.analyze(bf.parse_log(FIXTURE))

    def test_bots_and_lockfiles_do_not_count(self):
        self.assertEqual(self.r["contributors"], 3)
        self.assertFalse([d for d in self.r["directories"] if d["dir"] == "web/package-lock.json"])
        self.assertAlmostEqual(sum(d["weightShare"] for d in self.r["directories"]) <= 1.0001, True)

    def test_departed_sole_owner_is_orphaned(self):
        api = next(d for d in self.r["directories"] if d["dir"] == "api")
        self.assertEqual(api["status"], "orphaned")
        self.assertEqual(api["owner"], "Ana Ruiz")
        self.assertFalse(api["ownerActive"])
        self.assertEqual(self.r["orphaned"], 1)

    def test_orphaned_sorts_first_and_active_shared_dir_is_not_flagged(self):
        self.assertEqual(self.r["directories"][0]["dir"], "api")
        web = next(d for d in self.r["directories"] if d["dir"] == "web")
        self.assertEqual(web["status"], "shared")
        self.assertEqual(web["backup"], "Cy Lund")

    def test_directories_with_too_little_history_are_dropped(self):
        names = [d["dir"] for d in self.r["directories"]]
        self.assertNotIn("infra", names)
        self.assertNotIn("api/new", names)

    def test_single_active_owner_is_single_owner_with_backup_hint(self):
        log = "".join(f"@@|Zed|z@x.io|{1700000000 + i * 1000}\n10\t1\tsvc/a.py\n" for i in range(4))
        r = bf.analyze(bf.parse_log(log))
        self.assertEqual(r["directories"][0]["status"], "single-owner")
        self.assertIsNone(r["directories"][0]["backup"])
        self.assertEqual(r["repoBusFactor"], 1)

    def test_recency_decay_hands_ownership_to_the_recent_author(self):
        old = "".join(f"@@|Old|o@x.io|{1600000000 + i}\n100\t0\tlib/x.py\n" for i in range(3))
        new = "".join(f"@@|New|n@x.io|{1730000000 + i}\n30\t0\tlib/x.py\n" for i in range(3))
        r = bf.analyze(bf.parse_log(old + new))
        self.assertEqual(r["directories"][0]["owner"], "New")

    def test_one_giant_commit_is_capped(self):
        log = "@@|Big|b@x.io|100\n99999\t0\tg/a\n" + "".join(
            f"@@|Sm|s@x.io|{101 + i}\n400\t0\tg/b\n" for i in range(3))
        d = bf.analyze(bf.parse_log(log), min_commits=1)["directories"][0]
        self.assertEqual(d["owner"], "Sm")  # uncapped, the 99999-line commit would own it

    def test_empty_log_reports_an_error(self):
        self.assertIn("error", bf.analyze([]))
        self.assertIn("error", bf.analyze(bf.parse_log("@@|d[bot]|d@x|1\n1\t1\tf\n")))


class Cli(unittest.TestCase):
    def run_cli(self, *args, stdin=None):
        return subprocess.run([sys.executable, os.path.join(HERE, "busfactor.py"), *args],
                              input=stdin, capture_output=True, text=True)

    def test_log_from_stdin_text_and_exit_codes(self):
        p = self.run_cli("--log", "-", stdin=FIXTURE)
        self.assertEqual(p.returncode, 0)
        self.assertIn("ORPHANED", p.stdout)
        self.assertIn("No warranty", p.stdout)
        self.assertEqual(self.run_cli("--log", "-", "--fail-on-orphaned", stdin=FIXTURE).returncode, 2)

    def test_json_output_parses(self):
        p = self.run_cli("--log", "-", "--format", "json", stdin=FIXTURE)
        self.assertEqual(json.loads(p.stdout)["orphaned"], 1)

    def test_runs_git_in_a_real_repo(self):
        with tempfile.TemporaryDirectory() as d:
            env = {**os.environ, "GIT_AUTHOR_NAME": "T", "GIT_AUTHOR_EMAIL": "t@x.io",
                   "GIT_COMMITTER_NAME": "T", "GIT_COMMITTER_EMAIL": "t@x.io"}
            run = lambda *a: subprocess.run(["git", "-C", d, *a], check=True, capture_output=True, env=env)
            run("init", "-q")
            os.makedirs(os.path.join(d, "src"))
            for i in range(3):
                with open(os.path.join(d, "src", "f.py"), "a") as f:
                    f.write(f"x{i}\n")
                run("add", ".")
                run("commit", "-qm", f"c{i}")
            p = self.run_cli(d, "--format", "json")
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertEqual(json.loads(p.stdout)["directories"][0]["dir"], "src")

    def test_not_a_repo_fails_cleanly(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self.run_cli(d).returncode, 1)


if __name__ == "__main__":
    unittest.main()
