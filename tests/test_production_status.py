from dataclasses import replace
import json
import tempfile
import threading
import unittest
from pathlib import Path

from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.production_status import (
    PRODUCTION_STATUS_MANIFEST_PATH,
    OutputChecksum,
    ProductionJobStatus,
    ProductionStatusError,
    ProductionStatusManifest,
    build_initial_production_status_manifest,
    initialize_production_status_manifest,
    load_production_status_manifest,
    production_plan_fingerprint,
    validate_production_status_manifest,
    write_production_status_manifest,
)


class ProductionStatusManifestTests(unittest.TestCase):
    def test_round_trips_initial_pending_statuses_for_trusted_production_plan(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            manifest = build_initial_production_status_manifest(trusted_plan)

            manifest_path = write_production_status_manifest(
                manifest,
                workspace,
                trusted_plan=trusted_plan,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(manifest_path, workspace / PRODUCTION_STATUS_MANIFEST_PATH)
        self.assertEqual(loaded_manifest, manifest)
        self.assertEqual(
            [status.job_id for status in manifest.job_statuses[:4]],
            [
                "proxy_asset_00000",
                "proxy_asset_00001",
                "analyze_asset_00000",
                "analyze_asset_00001",
            ],
        )
        self.assertTrue(all(status.state == "pending" for status in manifest.job_statuses))
        self.assertEqual(
            set(raw_manifest),
            {"schema_version", "shoot_slug", "production_plan_fingerprint", "job_statuses"},
        )
        self.assertEqual(
            set(raw_manifest["job_statuses"][0]),
            {
                "attempts",
                "error_message",
                "output_checksums",
                "state",
                "job_id",
                "updated_at",
                "worker_adapter",
            },
        )

    def test_initializes_missing_production_status_manifest_from_trusted_plan(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)

            result = initialize_production_status_manifest(workspace, trusted_plan=trusted_plan)
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertTrue(result.created)
        self.assertEqual(result.manifest_path, workspace / PRODUCTION_STATUS_MANIFEST_PATH)
        self.assertEqual(result.manifest, loaded_manifest)
        self.assertTrue(all(status.state == "pending" for status in result.manifest.job_statuses))

    def test_initializing_existing_status_manifest_preserves_progress(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = build_initial_production_status_manifest(trusted_plan)
        proxy_job = trusted_plan.job_by_id("proxy_asset_00000")
        existing_manifest = replace(
            initial_manifest,
            job_statuses=(
                ProductionJobStatus(
                    job_id="proxy_asset_00000",
                    state="succeeded",
                    worker_adapter="proxy-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(
                            path=proxy_job.outputs[0],
                            sha256="a" * 64,
                        ),
                    ),
                    updated_at="2026-05-09T09:10:00Z",
                ),
            )
            + initial_manifest.job_statuses[1:],
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_production_status_manifest(existing_manifest, workspace, trusted_plan=trusted_plan)

            result = initialize_production_status_manifest(workspace, trusted_plan=trusted_plan)
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertFalse(result.created)
        self.assertEqual(result.manifest, existing_manifest)
        self.assertEqual(loaded_manifest, existing_manifest)

    def test_initializing_existing_stale_status_manifest_rejects_without_reset(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_plan = build_production_plan(
            [
                MediaAsset(path="card/DCIM/STALE.MOV", media_type="video", duration_seconds=4.0),
                MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo"),
            ],
            shoot_slug="status-contract",
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            stale_manifest = build_initial_production_status_manifest(stale_plan)
            write_production_status_manifest(stale_manifest, workspace, trusted_plan=stale_plan)

            with self.assertRaisesRegex(ProductionStatusError, "production plan fingerprint"):
                initialize_production_status_manifest(workspace, trusted_plan=trusted_plan)
            loaded_stale_manifest = load_production_status_manifest(workspace, trusted_plan=stale_plan)

        self.assertEqual(loaded_stale_manifest, stale_manifest)

    def test_concurrent_initialization_creates_once_without_resetting_progress(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            barrier = threading.Barrier(2)
            results = []
            errors = []

            def initialize() -> None:
                try:
                    barrier.wait()
                    results.append(
                        initialize_production_status_manifest(workspace, trusted_plan=trusted_plan)
                    )
                except Exception as exc:  # pragma: no cover - re-raised by assertion below
                    errors.append(exc)

            threads = [threading.Thread(target=initialize) for _index in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(errors, [])
        self.assertEqual(len(results), 2)
        self.assertEqual(sorted(result.created for result in results), [False, True])
        self.assertTrue(all(result.manifest == loaded_manifest for result in results))
        self.assertTrue(all(status.state == "pending" for status in loaded_manifest.job_statuses))

    def test_rejects_succeeded_job_whose_dependencies_are_not_succeeded(self) -> None:
        trusted_plan = self._trusted_plan()
        initial_manifest = build_initial_production_status_manifest(trusted_plan)
        analysis_job = trusted_plan.job_by_id("analyze_asset_00000")
        invalid_manifest = replace(
            initial_manifest,
            job_statuses=initial_manifest.job_statuses[:2]
            + (
                ProductionJobStatus(
                    job_id="analyze_asset_00000",
                    state="succeeded",
                    worker_adapter="vlm-local",
                    attempts=1,
                    output_checksums=(
                        OutputChecksum(
                            path=analysis_job.outputs[0],
                            sha256="b" * 64,
                        ),
                    ),
                    updated_at="2026-05-09T09:11:00Z",
                ),
            )
            + initial_manifest.job_statuses[3:],
        )

        with self.assertRaisesRegex(ProductionStatusError, "dependencies are not succeeded"):
            validate_production_status_manifest(invalid_manifest, trusted_plan=trusted_plan)

    def test_rejects_status_manifest_with_unknown_fields_or_delete_instructions(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            manifest_path = write_production_status_manifest(
                build_initial_production_status_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            raw_manifest["delete_originals"] = True
            manifest_path.write_text(json.dumps(raw_manifest), encoding="utf-8")

            with self.assertRaisesRegex(ProductionStatusError, "Unexpected production status manifest"):
                load_production_status_manifest(workspace, trusted_plan=trusted_plan)

    def test_rejects_stale_temporary_manifest_without_overwriting(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            stale_temp = workspace / "production_status.json.tmp"
            stale_temp.write_text("stale", encoding="utf-8")

            with self.assertRaisesRegex(ProductionStatusError, "stale temporary production status manifest"):
                initialize_production_status_manifest(workspace, trusted_plan=trusted_plan)

            self.assertEqual(stale_temp.read_text(encoding="utf-8"), "stale")
            self.assertFalse((workspace / PRODUCTION_STATUS_MANIFEST_PATH).exists())

    def test_rejects_symlinked_manifest_without_following_it(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            outside = workspace / "outside.json"
            outside.write_text("{}", encoding="utf-8")
            (workspace / PRODUCTION_STATUS_MANIFEST_PATH).symlink_to(outside)

            with self.assertRaisesRegex(ProductionStatusError, "production status manifest symlink"):
                initialize_production_status_manifest(workspace, trusted_plan=trusted_plan)

            self.assertEqual(outside.read_text(encoding="utf-8"), "{}")

    def test_production_plan_fingerprint_changes_when_job_outputs_change(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_plan = build_production_plan(
            [
                MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=10.0),
                MediaAsset(path="card/DCIM/IMG_9999.CR3", media_type="photo"),
            ],
            shoot_slug="status-contract",
        )

        self.assertNotEqual(
            production_plan_fingerprint(trusted_plan),
            production_plan_fingerprint(stale_plan),
        )

    def _trusted_plan(self):
        return build_production_plan(
            [
                MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=10.0),
                MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo"),
            ],
            shoot_slug="status-contract",
        )


if __name__ == "__main__":
    unittest.main()
