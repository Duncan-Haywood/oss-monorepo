import json, subprocess, sys, tempfile, unittest
from pathlib import Path

HOOK = Path(__file__).with_name("check_posts_before_push.py")


def run(cmd):
    return subprocess.run([sys.executable, str(HOOK)], input=json.dumps({"tool_input": {"command": cmd}}),
                          capture_output=True, text=True).returncode


class Hook(unittest.TestCase):
    def test_ignores_non_push(self):
        self.assertEqual(run("git status"), 0)
        self.assertEqual(run("echo 'git push later'"), 0)

    def test_push_runs_without_crashing(self):
        self.assertIn(run("git push -u origin x"), (0, 2))

    def test_bad_input_is_ignored(self):
        r = subprocess.run([sys.executable, str(HOOK)], input="not json", capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()
