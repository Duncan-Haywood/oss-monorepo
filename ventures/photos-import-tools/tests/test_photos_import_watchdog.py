import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from photos_import_watchdog import (
    active_phase,
    build_phases,
    has_remaining_work,
    never_initialized_phases,
    run_watchdog,
    write_status,
)


class PhotosImportWatchdogTests(unittest.TestCase):
    def test_has_remaining_work_treats_failed_as_remaining(self):
        summary = {
            "pending": 0,
            "uncertain": 0,
            "importing": 0,
            "failed": 3,
            "skipped_duplicate_risk": 10,
            "imported": 5,
        }

        self.assertTrue(has_remaining_work(summary))

    def test_has_remaining_work_false_when_only_skipped_and_imported(self):
        summary = {
            "pending": 0,
            "uncertain": 0,
            "importing": 0,
            "failed": 0,
            "skipped_duplicate_risk": 10,
            "skipped_permanent": 2,
            "imported": 5,
        }

        self.assertFalse(has_remaining_work(summary))

    def test_write_status_creates_machine_readable_progress_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            status_path = Path(temp_dir) / "status.json"
            summary = {"imported": 10, "pending": 2, "failed": 1}

            write_status(status_path, summary, worker_running=True, message="running")

            status = json.loads(status_path.read_text())
            self.assertTrue(status["worker_running"])
            self.assertEqual(status["message"], "running")
            self.assertEqual(status["summary"], summary)

    def test_build_phases_includes_raw_when_enabled(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir)
            phases = build_phases(
                state_dir=state_dir,
                batch_size=10,
                timeout_seconds=180,
                include_raws=True,
                raw_batch_size=3,
                raw_timeout_seconds=600,
            )

            self.assertEqual([phase.media_type for phase in phases], ["jpeg", "raw"])
            self.assertEqual(phases[1].batch_size, 3)
            self.assertEqual(phases[1].timeout_seconds, 600)

    def test_active_phase_prefers_jpeg_before_raw(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir)
            phases = build_phases(
                state_dir=state_dir,
                batch_size=10,
                timeout_seconds=180,
                include_raws=True,
                raw_batch_size=3,
                raw_timeout_seconds=600,
            )
            with sqlite3.connect(phases[0].db_path) as connection:
                connection.execute(
                    "CREATE TABLE imports (path TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
                )
                connection.execute(
                    "INSERT INTO imports VALUES ('/tmp/pending.jpg', 'pending', 0, NULL, 'now', 'now')"
                )
                connection.commit()

            self.assertEqual(active_phase(phases).media_type, "jpeg")

    def test_active_phase_none_when_raw_included_but_never_initialized(self):
        # --include-raws with jpeg fully done and the raw manifest never
        # `init`-ed (no db file at all) must not read the same as "raw is
        # done" -- both cases produce zero remaining work from read_summary,
        # so active_phase alone can't tell them apart. That distinction is
        # never_initialized_phases's job (see below).
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir)
            phases = build_phases(
                state_dir=state_dir,
                batch_size=10,
                timeout_seconds=180,
                include_raws=True,
                raw_batch_size=3,
                raw_timeout_seconds=600,
            )
            with sqlite3.connect(phases[0].db_path) as connection:
                connection.execute(
                    "CREATE TABLE imports (path TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
                )
                connection.execute(
                    "INSERT INTO imports VALUES ('/tmp/done.jpg', 'imported', 1, NULL, 'now', 'now')"
                )
                connection.commit()

            self.assertIsNone(active_phase(phases))

    def test_never_initialized_phases_flags_raw_when_only_jpeg_db_exists(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir)
            phases = build_phases(
                state_dir=state_dir,
                batch_size=10,
                timeout_seconds=180,
                include_raws=True,
                raw_batch_size=3,
                raw_timeout_seconds=600,
            )
            phases[0].db_path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(phases[0].db_path) as connection:
                connection.execute(
                    "CREATE TABLE imports (path TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
                )
                connection.commit()

            uninitialized = never_initialized_phases(phases)

            self.assertEqual([phase.media_type for phase in uninitialized], ["raw"])

    def test_never_initialized_phases_empty_when_all_dbs_exist(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir)
            phases = build_phases(
                state_dir=state_dir,
                batch_size=10,
                timeout_seconds=180,
                include_raws=True,
                raw_batch_size=3,
                raw_timeout_seconds=600,
            )
            for phase in phases:
                phase.db_path.parent.mkdir(parents=True, exist_ok=True)
                with sqlite3.connect(phase.db_path) as connection:
                    connection.execute(
                        "CREATE TABLE imports (path TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
                    )
                    connection.commit()

            self.assertEqual(never_initialized_phases(phases), [])

    def test_run_watchdog_closes_worker_log_handle_after_spawning(self):
        # Regression: stdout=log_path.open("ab") used to hand subprocess.Popen
        # a file object that nothing ever closed. Popen dup()s the fd into the
        # child during fork, so the parent's own copy is safe to close right
        # after Popen() returns -- but the code never did, leaking one fd per
        # worker (re)start. An unattended multi-hour run that restarts the
        # worker repeatedly (on every exit or stall) would eventually hit the
        # process's open-file ulimit and crash the watchdog itself, silently
        # stalling the import with no error recorded anywhere.
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir)
            db_path = state_dir / "photos_import.sqlite3"
            with sqlite3.connect(db_path) as connection:
                connection.execute(
                    "CREATE TABLE imports (path TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
                )
                connection.execute(
                    "INSERT INTO imports VALUES ('/tmp/pending.jpg', 'pending', 0, NULL, 'now', 'now')"
                )
                connection.commit()

            captured = {}

            class FakePopen:
                def __init__(self, command, cwd=None, stdout=None, stderr=None, start_new_session=None):
                    captured["stdout_handle"] = stdout
                    self.returncode = None
                    # Simulate the STOP file appearing right after the worker
                    # is spawned, so the loop exits after exactly one restart
                    # instead of spawning workers forever.
                    (state_dir / "STOP").touch()

                def poll(self):
                    return self.returncode

            with patch("photos_import_watchdog.subprocess.Popen", FakePopen), patch(
                "photos_import_watchdog.terminate_process_group"
            ):
                exit_code = run_watchdog(
                    root=state_dir,
                    state_dir=state_dir,
                    tool_dir=state_dir,
                    poll_seconds=1,
                    stall_seconds=900,
                    timeout_seconds=180,
                    attempts=3,
                    batch_size=10,
                    include_raws=False,
                    raw_batch_size=3,
                    raw_timeout_seconds=600,
                )

            self.assertEqual(exit_code, 130)
            self.assertIn("stdout_handle", captured)
            self.assertTrue(
                captured["stdout_handle"].closed,
                "worker's stdout log file was never closed after Popen() -- fd leak on every restart",
            )


if __name__ == "__main__":
    unittest.main()
