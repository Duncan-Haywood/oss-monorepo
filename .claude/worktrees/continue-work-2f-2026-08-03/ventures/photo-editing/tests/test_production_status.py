from dataclasses import replace
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path

from shootflow.catalog import load_ingest_manifest, production_assets_from_manifest
from shootflow.cli import main
from shootflow.deliverables import MediaAsset
from shootflow.ingest import execute_copy_plan, plan_import
from shootflow.production import build_production_plan
from shootflow.production_status import (
    PRODUCTION_STATUS_MANIFEST_PATH,
    OutputChecksum,
    ProductionJobStatus,
    ProductionStatusPreconditionError,
    ProductionStatusError,
    ProductionStatusManifest,
    build_initial_production_status_manifest,
    compare_and_write_production_job_status,
    initialize_production_status_manifest,
    load_production_status_manifest,
    production_plan_fingerprint,
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
            [status.job_id for status in manifest.job_statuses[:3]],
            ["proxy_asset_00000", "proxy_asset_00001", "analyze_asset_00000"],
        )
        self.assertTrue(all(status.state == "pending" for status in manifest.job_statuses))
        self.assertEqual(
            list(raw_manifest),
            ["job_statuses", "production_plan_fingerprint", "schema_version", "shoot_slug"],
        )
        self.assertEqual(
            list(raw_manifest["job_statuses"][0]),
            [
                "attempts",
                "error_message",
                "job_id",
                "output_checksums",
                "state",
                "updated_at",
                "worker_adapter",
            ],
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
        self.assertEqual(
            [status.state for status in result.manifest.job_statuses],
            ["pending"] * len(trusted_plan.jobs),
        )

    def test_initializing_existing_production_status_manifest_preserves_progress(self) -> None:
        trusted_plan = self._trusted_plan()
        proxy_status = self._succeeded_status(
            trusted_plan.job_by_id("proxy_asset_00000"),
            worker_adapter="proxy-local",
            updated_at="2026-05-09T09:00:00Z",
        )
        analysis_status = ProductionJobStatus(
            job_id="analyze_asset_00000",
            state="running",
            worker_adapter="vlm-local",
            attempts=1,
            updated_at="2026-05-09T09:01:00Z",
        )
        existing_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=self._statuses_with(
                trusted_plan,
                {
                    proxy_status.job_id: proxy_status,
                    analysis_status.job_id: analysis_status,
                },
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_production_status_manifest(existing_manifest, workspace, trusted_plan=trusted_plan)

            result = initialize_production_status_manifest(workspace, trusted_plan=trusted_plan)
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertFalse(result.created)
        self.assertEqual(result.manifest, existing_manifest)
        self.assertEqual(loaded_manifest, existing_manifest)
        self.assertEqual(result.manifest.job_statuses[0].state, "succeeded")
        self.assertEqual(result.manifest.job_statuses[2].state, "running")

    def test_initializing_existing_stale_status_manifest_rejects_without_reset(self) -> None:
        trusted_plan = self._trusted_plan()
        stale_plan = replace(
            trusted_plan,
            jobs=(
                replace(
                    trusted_plan.jobs[0],
                    outputs=("proxies/proxy_asset_00000/STALE.MOV",),
                ),
            )
            + trusted_plan.jobs[1:],
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

    def test_rejects_status_with_unsatisfied_dependencies(self) -> None:
        trusted_plan = self._trusted_plan()
        analysis_status = ProductionJobStatus(
            job_id="analyze_asset_00000",
            state="running",
            worker_adapter="vlm-local",
            attempts=1,
            updated_at="2026-05-09T09:01:00Z",
        )
        manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=self._statuses_with(trusted_plan, {analysis_status.job_id: analysis_status}),
        )

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ProductionStatusError, "dependency is not succeeded"):
                write_production_status_manifest(manifest, Path(tmp), trusted_plan=trusted_plan)

    def test_rejects_status_manifest_with_unknown_fields_or_delete_instructions(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_production_status_manifest(
                build_initial_production_status_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )
            manifest_path = workspace / PRODUCTION_STATUS_MANIFEST_PATH
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            raw_manifest["job_statuses"][0]["delete_after_job"] = True
            manifest_path.write_text(json.dumps(raw_manifest), encoding="utf-8")

            with self.assertRaisesRegex(ProductionStatusError, "Unexpected production status field"):
                load_production_status_manifest(workspace, trusted_plan=trusted_plan)

    def test_rejects_stale_temporary_production_status_manifest(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_production_status_manifest(
                build_initial_production_status_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )
            stale_temp_path = workspace / "production_status.json.tmp"
            stale_temp_path.write_text("{}", encoding="utf-8")

            with self.assertRaisesRegex(ProductionStatusError, "stale temporary production status manifest"):
                write_production_status_manifest(
                    build_initial_production_status_manifest(trusted_plan),
                    workspace,
                    trusted_plan=trusted_plan,
                )

    def test_rejects_symlinked_production_status_manifest_without_reset(self) -> None:
        trusted_plan = self._trusted_plan()

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            outside_manifest = workspace / "outside_status.json"
            outside_manifest.write_text("{}", encoding="utf-8")
            (workspace / PRODUCTION_STATUS_MANIFEST_PATH).symlink_to(outside_manifest)

            with self.assertRaisesRegex(ProductionStatusError, "production status manifest symlink"):
                initialize_production_status_manifest(workspace, trusted_plan=trusted_plan)
            self.assertEqual(outside_manifest.read_text(encoding="utf-8"), "{}")

    def test_rejects_output_checksums_for_unsafe_or_undeclared_paths(self) -> None:
        trusted_plan = self._trusted_plan()
        proxy_job = trusted_plan.job_by_id("proxy_asset_00000")
        unsafe_manifest = ProductionStatusManifest(
            shoot_slug=trusted_plan.shoot_slug,
            production_plan_fingerprint=production_plan_fingerprint(trusted_plan),
            job_statuses=self._statuses_with(
                trusted_plan,
                {
                    proxy_job.job_id: ProductionJobStatus(
                        job_id=proxy_job.job_id,
                        state="succeeded",
                        worker_adapter="proxy-local",
                        attempts=1,
                        output_checksums=(OutputChecksum(path="../escape.mov", sha256="a" * 64),),
                        updated_at="2026-05-09T09:00:00Z",
                    )
                },
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ProductionStatusError, "Unsafe production output checksum path"):
                write_production_status_manifest(unsafe_manifest, Path(tmp), trusted_plan=trusted_plan)

    def test_compare_and_write_updates_exactly_one_job_status(self) -> None:
        trusted_plan = self._trusted_plan()
        running_status = ProductionJobStatus(
            job_id="proxy_asset_00000",
            state="running",
            worker_adapter="proxy-local",
            attempts=1,
            updated_at="2026-05-09T15:31:00Z",
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_production_status_manifest(
                build_initial_production_status_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )

            updated_manifest = compare_and_write_production_job_status(
                workspace,
                trusted_plan=trusted_plan,
                updated_status=running_status,
                expected_state="pending",
                expected_attempts=0,
            )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(updated_manifest, loaded_manifest)
        self.assertEqual(updated_manifest.job_statuses[0], running_status)
        self.assertTrue(all(status.state == "pending" for status in updated_manifest.job_statuses[1:]))

    def test_compare_and_write_rejects_stale_expected_status(self) -> None:
        trusted_plan = self._trusted_plan()
        running_status = ProductionJobStatus(
            job_id="proxy_asset_00000",
            state="running",
            worker_adapter="proxy-local",
            attempts=1,
            updated_at="2026-05-09T15:31:00Z",
        )
        retryable_status = ProductionJobStatus(
            job_id="proxy_asset_00000",
            state="retryable",
            worker_adapter="proxy-local",
            attempts=1,
            error_message="proxy worker interrupted; no source media was deleted",
            updated_at="2026-05-09T15:32:00Z",
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_production_status_manifest(
                build_initial_production_status_manifest(trusted_plan),
                workspace,
                trusted_plan=trusted_plan,
            )
            compare_and_write_production_job_status(
                workspace,
                trusted_plan=trusted_plan,
                updated_status=running_status,
                expected_state="pending",
                expected_attempts=0,
            )

            with self.assertRaisesRegex(ProductionStatusPreconditionError, "precondition failed"):
                compare_and_write_production_job_status(
                    workspace,
                    trusted_plan=trusted_plan,
                    updated_status=retryable_status,
                    expected_state="pending",
                    expected_attempts=0,
                )
            loaded_manifest = load_production_status_manifest(workspace, trusted_plan=trusted_plan)

        self.assertEqual(loaded_manifest.job_statuses[0], running_status)

    @staticmethod
    def _trusted_plan():
        return build_production_plan(
            [
                MediaAsset(path="originals/A001.MOV", media_type="video", duration_seconds=12.0),
                MediaAsset(path="originals/IMG_0001.CR3", media_type="photo"),
            ],
            shoot_slug="production-status",
        )

    @staticmethod
    def _statuses_with(trusted_plan, overrides):
        return tuple(
            overrides.get(job.job_id, ProductionJobStatus(job_id=job.job_id, state="pending"))
            for job in trusted_plan.jobs
        )

    @staticmethod
    def _succeeded_status(job, *, worker_adapter: str, updated_at: str) -> ProductionJobStatus:
        return ProductionJobStatus(
            job_id=job.job_id,
            state="succeeded",
            worker_adapter=worker_adapter,
            attempts=1,
            output_checksums=tuple(
                OutputChecksum(path=output_path, sha256="a" * 64)
                for output_path in job.outputs
            ),
            updated_at=updated_at,
        )


class ProductionStatusCliTests(unittest.TestCase):
    def test_init_production_status_command_creates_manifest_from_ingest_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            photo = card / "DCIM" / "IMG_0001.JPG"
            video = card / "PRIVATE" / "A001.MOV"
            photo.parent.mkdir(parents=True)
            video.parent.mkdir(parents=True)
            photo.write_bytes(b"photo-bytes")
            video.write_bytes(b"video-bytes")
            copy_plan = plan_import(
                card,
                destination,
                shoot_date="2026-05-09",
                shoot_slug="status-cli",
            )
            execute_copy_plan(copy_plan)
            manifest_path = destination / "2026-05-09_status-cli" / "ingest_manifest.json"
            stdout = io.StringIO()

            exit_code = main(
                [
                    "init-production-status",
                    "--ingest-manifest",
                    str(manifest_path),
                ],
                stdout=stdout,
            )
            catalog = load_ingest_manifest(manifest_path)
            trusted_plan = build_production_plan(
                production_assets_from_manifest(catalog),
                shoot_slug=catalog.shoot_slug,
            )
            loaded_manifest = load_production_status_manifest(
                manifest_path.parent,
                trusted_plan=trusted_plan,
            )

        printed_summary = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertTrue(printed_summary["created"])
        self.assertEqual(printed_summary["shoot_slug"], "status-cli")
        self.assertEqual(printed_summary["job_count"], len(trusted_plan.jobs))
        self.assertEqual(printed_summary["pending_job_count"], len(trusted_plan.jobs))
        self.assertEqual(loaded_manifest.job_statuses[0].state, "pending")
        self.assertFalse((manifest_path.parent / "analysis").exists())
        self.assertFalse((manifest_path.parent / "graded").exists())
        self.assertFalse((manifest_path.parent / "deliverables").exists())

    def test_init_production_status_command_rejects_deleted_source_manifest_without_reset(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            card = root / "card"
            destination = root / "library"
            photo = card / "IMG_0001.JPG"
            photo.parent.mkdir(parents=True)
            photo.write_bytes(b"photo-bytes")
            copy_plan = plan_import(
                card,
                destination,
                shoot_date="2026-05-09",
                shoot_slug="deleted-source",
            )
            execute_copy_plan(copy_plan)
            manifest_path = destination / "2026-05-09_deleted-source" / "ingest_manifest.json"
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
        self.assertFalse((manifest_path.parent / PRODUCTION_STATUS_MANIFEST_PATH).exists())


if __name__ == "__main__":
    unittest.main()
