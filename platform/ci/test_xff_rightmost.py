"""Rate limits must not key on the left-hand X-Forwarded-For entry.

A client writes whatever it likes into X-Forwarded-For; a reverse proxy (Fly,
Render, Caddy, nginx) appends the address it saw. So `split(",")[0]` is a value
the caller chose, and a rate limit keyed on it gives every request a fresh
bucket. On 2026-11-19 (red-team run on ventures/support-agent) 16 servers did
this, among them support-agent's /api/ask, which can spend the deployer's own
model key, and the sign-up, form and handoff limits of the *-keeper servers.
They now take the right-hand entry, the hop the proxy appended. This test fails
the next server that copies the old line.
"""
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
# A line that reads X-Forwarded-For and then takes element 0 of a comma split.
LEFTMOST = re.compile(r"""x[-_]forwarded[-_]for.*split\(\s*["'],\s*["']\s*\)\s*\[\s*0\s*\]""", re.I)


def leftmost_hits(files):
    hits = []
    for rel in files:
        p = ROOT / rel
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if LEFTMOST.search(line):
                hits.append(f"{rel}:{n}")
    return hits


class XffRightmost(unittest.TestCase):
    def test_pattern_flags_the_old_line_and_passes_the_fix(self):
        old = 'const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || "?";'
        new = 'const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",").pop().trim()) || "?";'
        py = "ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip()"
        self.assertTrue(LEFTMOST.search(old))
        self.assertTrue(LEFTMOST.search(py))
        self.assertFalse(LEFTMOST.search(new))

    def test_no_server_keys_on_the_client_written_entry(self):
        files = subprocess.run(["git", "ls-files", "--", "ventures", "platform", "research"], cwd=ROOT,
                               capture_output=True, text=True, check=True).stdout.splitlines()
        code = [f for f in files if f.endswith((".mjs", ".js", ".ts", ".py", ".cjs"))
                and ".test." not in f and not pathlib.PurePosixPath(f).name.startswith("test_")
                and "node_modules" not in f]
        self.assertEqual(leftmost_hits(code), [],
                         'take the right-hand X-Forwarded-For entry (split(",").pop()), the hop your proxy appended')


if __name__ == "__main__":
    unittest.main()
