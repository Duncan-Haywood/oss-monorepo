import json
import os
import sys
import time
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

    def test_record_does_not_persist_command_output_by_default(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "run.json"
            with self.assertRaises(SystemExit) as ctx:
                main(["record", "--tool", "backup", "--output", str(output), "--", "sh", "-c", "printf 'secret-path'"])
            self.assertEqual(ctx.exception.code, 0)
            self.assertNotIn("log_tail", json.loads(output.read_text(encoding="utf-8")))

    def test_record_can_opt_in_to_command_output(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "run.json"
            with self.assertRaises(SystemExit) as ctx:
                main([
                    "record", "--tool", "backup", "--include-log-tail",
                    "--output", str(output), "--", "sh", "-c", "printf 'diagnostic'",
                ])
            self.assertEqual(ctx.exception.code, 0)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["log_tail"], "diagnostic")


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

    def test_trend_flag_adds_shrinking_alerts_without_changing_exit_on_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            nights = [
                ("21.json", 50_000_000, "2026-08-21T03:04:00Z"),
                ("22.json", 51_200_000, "2026-08-22T03:04:00Z"),
                ("23.json", 50_400_000, "2026-08-23T03:04:00Z"),
                ("24.json", 12_000_000, "2026-08-24T03:04:00Z"),
            ]
            paths = []
            for name, size, finished_at in nights:
                path = Path(directory) / name
                path.write_text(
                    json.dumps(
                        {
                            "tool": "pg_dump|gzip",
                            "exit_code": 0,
                            "started_at": finished_at.replace("03:04:00Z", "03:00:00Z"),
                            "finished_at": finished_at,
                            "artifact": {
                                "exists": True,
                                "size_bytes": size,
                                "modified_at": finished_at.replace("03:04:00Z", "03:03:50Z"),
                            },
                            "expected": {"min_size_bytes": 1_000_000, "max_age_hours": 26},
                        }
                    ),
                    encoding="utf-8",
                )
                paths.append(str(path))
            output = Path(directory) / "trend.json"
            usage = Path(directory) / "usage.json"
            with self.assertRaises(SystemExit) as ctx:
                main(["check", *paths, "--trend", "--output", str(output), "--usage-file", str(usage)])
            self.assertEqual(ctx.exception.code, 0)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["latest"]["status"], "verified")
            self.assertTrue(report["trend"]["latest"]["shrinking_vs_previous"])
            self.assertGreaterEqual(report["trend"]["alert_count"], 1)
            self.assertEqual(
                json.loads(usage.read_text(encoding="utf-8")),
                {"report_generated": 1, "trend_viewed": 1},
            )

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

    def test_check_can_require_end_to_end_integrity(self):
        with tempfile.TemporaryDirectory() as directory:
            record_path = Path(directory) / "run.json"
            record_path.write_text(
                json.dumps({
                    "tool": "restic", "exit_code": 0,
                    "finished_at": "2026-08-24T03:00:00Z",
                    "artifact": {"exists": True, "size_bytes": 100},
                }), encoding="utf-8"
            )
            with self.assertRaises(SystemExit) as ctx:
                main(["check", str(record_path), "--require-integrity"])
            self.assertEqual(ctx.exception.code, 1)

    def test_check_require_integrity_accepts_intact_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            record_path = Path(directory) / "run.json"
            record_path.write_text(
                json.dumps({
                    "tool": "tar", "exit_code": 0,
                    "finished_at": "2026-08-24T03:00:00Z",
                    "artifact": {"exists": True, "size_bytes": 100,
                                  "integrity": {"result": "intact", "format": "tar"}},
                }), encoding="utf-8"
            )
            with self.assertRaises(SystemExit) as ctx:
                main(["check", str(record_path), "--require-integrity"])
            self.assertEqual(ctx.exception.code, 0)


if __name__ == "__main__":
    unittest.main()


import gzip  # noqa: E402
import io  # noqa: E402
import tarfile  # noqa: E402


def _tar_gz(path, truncate_tar=False):
    """Write a tar.gz, optionally with the tar cut short inside a valid gzip.

    `truncate_tar=True` reproduces the `tar ... | gzip > out.gz` failure: the
    gzip layer is complete and checksums cleanly, and only the tar inside is
    short. Nothing but walking the archive catches it.
    """
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        for index in range(3):
            payload = b"data\n" * 5000
            info = tarfile.TarInfo(f"m{index}.txt")
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
    raw = buffer.getvalue()
    if truncate_tar:
        raw = raw[: len(raw) // 2]
    path.write_bytes(gzip.compress(raw))
    return path


class VerifyCommandTests(unittest.TestCase):
    """`verify` is the no-setup entry point: point it at a file, get an answer."""

    def _run(self, argv):
        with self.assertRaises(SystemExit) as ctx:
            main(argv)
        return ctx.exception.code

    def test_intact_archive_exits_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "nightly.tar.gz")
            self.assertEqual(self._run(["verify", str(artifact)]), 0)

    def test_corrupt_archive_exits_one(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "nightly.tar.gz", truncate_tar=True)
            self.assertEqual(self._run(["verify", str(artifact)]), 1)

    def test_uncheckable_artifact_exits_two_not_one(self):
        # Distinct from the corrupt exit code so an alerting rule can page
        # differently for "this backup is broken" and "I could not tell".
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "notes.txt"
            artifact.write_bytes(b"not an archive\n")
            self.assertEqual(self._run(["verify", str(artifact)]), 2)

    def test_one_corrupt_artifact_dominates_a_batch(self):
        with tempfile.TemporaryDirectory() as directory:
            good = _tar_gz(Path(directory) / "mon.tar.gz")
            bad = _tar_gz(Path(directory) / "tue.tar.gz", truncate_tar=True)
            self.assertEqual(self._run(["verify", str(good), str(bad)]), 1)

    def test_json_output_is_machine_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "nightly.tar.gz")
            buffer = io.StringIO()
            stdout, sys.stdout = sys.stdout, buffer
            try:
                self._run(["verify", "--format", "json", str(artifact)])
            finally:
                sys.stdout = stdout
            payload = json.loads(buffer.getvalue())
            self.assertEqual(payload["artifacts"][0]["result"], "intact")
            self.assertEqual(payload["artifacts"][0]["format"], "tar.gz")
            self.assertEqual(payload["artifacts"][0]["path"], str(artifact))

    def test_usage_file_counts_the_event(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "nightly.tar.gz")
            usage = Path(directory) / "usage.json"
            self._run(["verify", str(artifact), "--usage-file", str(usage)])
            self.assertEqual(json.loads(usage.read_text())["artifact_verified"], 1)

    def test_json_evidence_can_be_written_to_a_local_handoff_file(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "nightly.tar.gz")
            output = Path(directory) / "evidence.json"
            self.assertEqual(
                self._run(["verify", "--format", "json", "--output", str(output), str(artifact)]),
                0,
            )
            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(payload["artifacts"][0]["result"], "intact")
            self.assertEqual(payload["artifacts"][0]["path"], str(artifact))
            self.assertNotIn("log_tail", payload)

    def test_fresh_intact_archive_passes_age_check(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "nightly.tar.gz")
            self.assertEqual(self._run(["verify", "--max-age-hours", "1", str(artifact)]), 0)

    def test_old_intact_archive_is_stale_and_exits_two(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "nightly.tar.gz")
            old = time.time() - 48 * 3600
            os.utime(artifact, (old, old))
            buffer = io.StringIO()
            stdout, sys.stdout = sys.stdout, buffer
            try:
                self.assertEqual(self._run(["verify", "--format", "json", "--max-age-hours", "24", str(artifact)]), 2)
            finally:
                sys.stdout = stdout
            result = json.loads(buffer.getvalue())["artifacts"][0]
            self.assertEqual(result["result"], "stale")
            self.assertEqual(result["freshness"]["result"], "stale")

    def test_corrupt_artifact_keeps_corrupt_exit_priority_when_stale(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "nightly.tar.gz", truncate_tar=True)
            old = time.time() - 48 * 3600
            os.utime(artifact, (old, old))
            self.assertEqual(self._run(["verify", "--max-age-hours", "24", str(artifact)]), 1)

    def test_missing_artifact_is_unchecked_with_age_check(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing.tar.gz"
            buffer = io.StringIO()
            stdout, sys.stdout = sys.stdout, buffer
            try:
                self.assertEqual(self._run(["verify", "--format", "json", "--max-age-hours", "24", str(missing)]), 2)
            finally:
                sys.stdout = stdout
            result = json.loads(buffer.getvalue())["artifacts"][0]
            self.assertEqual(result["result"], "unchecked")
            self.assertEqual(result["freshness"]["result"], "unchecked")


class RecordIntegrityTests(unittest.TestCase):
    def test_verify_integrity_flag_records_the_finding(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "backup.tar.gz", truncate_tar=True)
            output = Path(directory) / "run.json"
            with self.assertRaises(SystemExit):
                main(
                    [
                        "record", "--tool", "tar", "--artifact", str(artifact),
                        "--min-size-bytes", "100", "--verify-integrity",
                        "--output", str(output), "--", "true",
                    ]
                )
            record = json.loads(output.read_text())
            self.assertEqual(record["artifact"]["integrity"]["result"], "corrupt")

    def test_end_to_end_a_clean_exit_over_a_broken_archive_reports_failed(self):
        """The whole point, exercised through the real CLI.

        `true` exits 0, the artifact comfortably clears the size floor, and it
        was written seconds ago -- this run was `verified` before integrity
        checking existed.
        """
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "backup.tar.gz", truncate_tar=True)
            output = Path(directory) / "run.json"
            with self.assertRaises(SystemExit):
                main(
                    [
                        "record", "--tool", "pg_dump|gzip", "--artifact", str(artifact),
                        "--min-size-bytes", "100", "--max-age-hours", "26",
                        "--verify-integrity", "--output", str(output), "--", "true",
                    ]
                )
            report_path = Path(directory) / "report.json"
            with self.assertRaises(SystemExit) as ctx:
                main(["check", str(output), "--output", str(report_path)])
            self.assertEqual(ctx.exception.code, 1)
            report = json.loads(report_path.read_text())
            self.assertEqual(report["latest"]["status"], "failed")
            self.assertIn("not intact", report["latest"]["reasons"][0])

    def test_without_the_flag_the_same_broken_archive_reports_verified(self):
        # Documents the behaviour the flag changes, and pins the default: the
        # integrity read is opt-in, so existing cron jobs keep their old cost.
        with tempfile.TemporaryDirectory() as directory:
            artifact = _tar_gz(Path(directory) / "backup.tar.gz", truncate_tar=True)
            output = Path(directory) / "run.json"
            with self.assertRaises(SystemExit):
                main(
                    [
                        "record", "--tool", "tar", "--artifact", str(artifact),
                        "--min-size-bytes", "100", "--output", str(output), "--", "true",
                    ]
                )
            self.assertNotIn("integrity", json.loads(output.read_text())["artifact"])
