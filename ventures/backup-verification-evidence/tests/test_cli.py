import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from backup_evidence.cli import main


class RecordCommandTests(unittest.TestCase):
    def test_record_observes_real_exit_code_and_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "backup.tar"
            artifact.write_bytes(b"x" * 2048)
            output = Path(directory) / "run.json"
            with self.assertRaises(SystemExit) as ctx:
                main(
                    [
                        "record",
                        "--tool",
                        "tar",
                        "--artifact",
                        str(artifact),
                        "--min-size-bytes",
                        "1000",
                        "--output",
                        str(output),
                        "--",
                        "true",
                    ]
                )
            self.assertEqual(ctx.exception.code, 0)
            record = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(record["exit_code"], 0)
            self.assertTrue(record["artifact"]["exists"])
            self.assertEqual(record["artifact"]["size_bytes"], 2048)

    def test_record_captures_a_nonzero_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "run.json"
            with self.assertRaises(SystemExit) as ctx:
                main(["record", "--tool", "restic", "--output", str(output), "--", "false"])
            self.assertEqual(ctx.exception.code, 1)
            record = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(record["exit_code"], 1)


class CheckCommandTests(unittest.TestCase):
    def test_check_exits_nonzero_when_latest_run_is_not_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            record_path = Path(directory) / "run.json"
            record_path.write_text(
                json.dumps({"tool": "restic", "exit_code": 1, "finished_at": "2026-08-24T03:00:00Z"}),
                encoding="utf-8",
            )
            with self.assertRaises(SystemExit) as ctx:
                main(["check", str(record_path)])
            self.assertEqual(ctx.exception.code, 1)

    def test_check_exits_zero_when_latest_run_is_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            record_path = Path(directory) / "run.json"
            record_path.write_text(
                json.dumps(
                    {
                        "tool": "restic",
                        "exit_code": 0,
                        "finished_at": "2026-08-24T03:00:00Z",
                        "artifact": {"exists": True, "size_bytes": 100},
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaises(SystemExit) as ctx:
                main(["check", str(record_path)])
            self.assertEqual(ctx.exception.code, 0)


if __name__ == "__main__":
    unittest.main()
