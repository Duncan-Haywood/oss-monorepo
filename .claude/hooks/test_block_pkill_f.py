import json, subprocess, sys, unittest
from pathlib import Path

HOOK = Path(__file__).with_name("block_pkill_f.py")


def run(cmd):
    return subprocess.run([sys.executable, str(HOOK)], input=json.dumps({"tool_input": {"command": cmd}}),
                          capture_output=True, text=True).returncode


class T(unittest.TestCase):
    def test_blocks(self):
        for c in ["pkill -f node", "pgrep -f x | head", "until ! pgrep -fa run; do :; done",
                  "sleep 1 && pkill -f node", "nohup pkill -f x &",
                  "pkill -f '[n]ode'; nohup node server.js &"]:
            self.assertEqual(run(c), 2, c)

    def test_allows(self):
        for c in ["pkill -f '[n]ode'", "pkill node", "ls -f", "kill 123",
                  "echo 'do not run pgrep -f x'", 'git commit -m "hook blocks pkill -f foo"']:
            self.assertEqual(run(c), 0, c)


if __name__ == "__main__":
    unittest.main()
