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

    def test_record_sums_a_directory_artifacts_real_content_size(self):
        # Regression: restic/borg produce a repository directory, not a single
        # file. Path.stat().st_size on a directory is inode metadata (a few
        # KB), not the backup's actual size -- it used to make a real,
        # successful repo backup report as undersized.
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / "restic-repo"
            (repo / "data").mkdir(parents=True)
            (repo / "data" / "pack1").write_bytes(b"x" * 600_000)
            (repo / "data" / "pack2").write_bytes(b"y" * 500_000)
            output = Path(directory) / "run.json"
            with self.assertRaises(SystemExit) as ctx:
                main(
                    [
                        "record",
                        "--tool",
                        "restic",
                        "--artifact",
                        str(repo),
                        "--min-size-bytes",
                        "1000000",
                        "--output",
                        str(output),
                        "--",
                        "true",
                    ]
                )
            self.assertEqual(ctx.exception.code, 0)
            record = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(record["artifact"]["size_bytes"], 1_100_000)

    def test_record_captures_a_nonzero_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "run.json"
            with self.assertRaises(SystemExit) as ctx:
                main(["record", "--tool", "restic", "--output", str(output), "--", "false"])
            self.assertEqual(ctx.exception.code, 1)
            record = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(record["exit_code"], 1)


class CheckCommandTests(unittest.TestCase):
    def test_usage_file_flag_works_after_the_subcommand_as_documented(self):
        # Regression: --usage-file was only registered on the top-level
        # parser, so putting it after `check` (as the README shows) raised
        # an unrecognized-argument error.
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
            usage_file = Path(directory) / "usage.json"
            with self.assertRaises(SystemExit) as ctx:
                main(["check", str(record_path), "--usage-file", str(usage_file)])
            self.assertEqual(ctx.exception.code, 0)
            self.assertEqual(json.loads(usage_file.read_text(encoding="utf-8")), {"report_generated": 1})

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
