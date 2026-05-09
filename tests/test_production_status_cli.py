import io
import json
import tempfile
import unittest
from pathlib import Path

from shootflow.cli import main


class ShootFlowProductionStatusCliTests(unittest.TestCase):
    def test_init_production_status_command_creates_manifest_without_downstream_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            clip = card / "DCIM" / "A001.MOV"
            photo = card / "DCIM" / "IMG_0001.CR3"
            clip.parent.mkdir(parents=True)
            clip.write_bytes(b"video-bytes")
            photo.write_bytes(b"photo-bytes")
            ingest_stdout = io.StringIO()
            ingest_exit_code = main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-09",
                    "--shoot-slug",
                    "production-status",
                    "--confirm",
                ],
                stdout=ingest_stdout,
            )
            shoot_folder = destination / "2026-05-09_production-status"
            manifest_path = shoot_folder / "ingest_manifest.json"
            stdout = io.StringIO()

            exit_code = main(
                [
                    "init-production-status",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=stdout,
            )

            payload = json.loads(stdout.getvalue())
            self.assertEqual(ingest_exit_code, 0)
            self.assertEqual(exit_code, 0)
            self.assertTrue(payload["created"])
            self.assertEqual(payload["status_path"], str(shoot_folder / "production_status.json"))
            self.assertEqual(payload["shoot_slug"], "production-status")
            self.assertEqual(payload["job_count"], 12)
            self.assertEqual(payload["pending_job_count"], 12)
            self.assertEqual(payload["running_job_count"], 0)
            self.assertEqual(payload["succeeded_job_count"], 0)
            self.assertEqual(payload["failed_job_count"], 0)
            self.assertEqual(payload["retryable_job_count"], 0)
            self.assertRegex(payload["production_plan_fingerprint"], r"^[0-9a-f]{64}$")
            self.assertTrue((shoot_folder / "production_status.json").exists())
            self.assertFalse((shoot_folder / "analysis").exists())
            self.assertFalse((shoot_folder / "graded").exists())
            self.assertFalse((shoot_folder / "deliverables").exists())

    def test_init_production_status_command_rejects_deleted_source_manifest_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            photo = card / "IMG_0001.JPG"
            photo.parent.mkdir(parents=True)
            photo.write_bytes(b"photo-bytes")
            ingest_stdout = io.StringIO()
            main(
                [
                    "execute-ingest",
                    "--source",
                    str(card),
                    "--destination",
                    str(destination),
                    "--shoot-date",
                    "2026-05-09",
                    "--shoot-slug",
                    "production-status-reject",
                    "--confirm",
                ],
                stdout=ingest_stdout,
            )
            shoot_folder = destination / "2026-05-09_production-status-reject"
            manifest_path = shoot_folder / "ingest_manifest.json"
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest_data["source_deleted"] = True
            manifest_path.write_text(json.dumps(manifest_data), encoding="utf-8")
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = main(
                [
                    "init-production-status",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=stdout,
                stderr=stderr,
            )

            self.assertEqual(exit_code, 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("source media was deleted", stderr.getvalue())
            self.assertFalse((shoot_folder / "production_status.json").exists())


if __name__ == "__main__":
    unittest.main()
