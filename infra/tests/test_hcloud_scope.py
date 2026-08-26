#!/usr/bin/env python3
"""assert_hcloud_read_only.sh classifies probe HTTP codes. No live API."""

from __future__ import annotations

import os
import stat
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "assert_hcloud_read_only.sh"


def _fake_curl(bin_dir: Path, http_code: str, body: str = "{}") -> None:
    curl = bin_dir / "curl"
    curl.write_text(
        "#!/usr/bin/env python3\n"
        "import sys\n"
        f"BODY = {body!r}\n"
        f"CODE = {http_code!r}\n"
        "out = None\n"
        "args = sys.argv[1:]\n"
        "i = 0\n"
        "while i < len(args):\n"
        "    if args[i] == '-o' and i + 1 < len(args):\n"
        "        out = args[i + 1]\n"
        "        i += 2\n"
        "        continue\n"
        "    i += 1\n"
        "if out:\n"
        "    open(out, 'w').write(BODY)\n"
        "sys.stdout.write(CODE)\n"
    )
    curl.chmod(curl.stat().st_mode | stat.S_IEXEC)


def _run(bin_dir: Path, env_token: str | None = "t") -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    if env_token is None:
        env.pop("HCLOUD_TOKEN", None)
    else:
        env["HCLOUD_TOKEN"] = env_token
    return subprocess.run(
        [str(SCRIPT)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )


class AssertHcloudReadOnlyTest(unittest.TestCase):
    def test_script_never_sends_a_createable_payload(self):
        text = SCRIPT.read_text()
        self.assertIn("-d '{}'", text)
        self.assertNotIn("server_type", text)
        self.assertNotIn("cpx", text)

    def test_403_is_read_only(self):
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            bin_dir = Path(raw)
            _fake_curl(bin_dir, "403")
            result = _run(bin_dir)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Read-only", result.stdout)

    def test_422_is_treated_as_write(self):
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            bin_dir = Path(raw)
            _fake_curl(bin_dir, "422", '{"error":"invalid"}')
            result = _run(bin_dir)
        self.assertEqual(result.returncode, 2)
        self.assertIn("write-capable", result.stderr)

    def test_401_is_a_bad_token(self):
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            bin_dir = Path(raw)
            _fake_curl(bin_dir, "401")
            result = _run(bin_dir)
        self.assertEqual(result.returncode, 1)
        self.assertIn("rejected", result.stderr)

    def test_missing_token_fails(self):
        import tempfile

        with tempfile.TemporaryDirectory() as raw:
            result = _run(Path(raw), env_token=None)
        self.assertEqual(result.returncode, 1)
        self.assertIn("unset", result.stderr)


if __name__ == "__main__":
    unittest.main()
