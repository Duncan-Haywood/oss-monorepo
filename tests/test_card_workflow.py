import tempfile
import unittest
from pathlib import Path
from unittest import mock

from shootflow.card_workflow import CardDumpWorkflowError, run_card_dump_workflow
from shootflow.storage import ImportRouteRecommendation, RankedStorageCandidate, StorageCandidate
from shootflow.storage_discovery import VolumeDiscoveryHint


class CardDumpWorkflowTests(unittest.TestCase):
    def test_workflow_passes_volume_hints_to_initial_and_capacity_discovery(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            volumes = workspace / "Volumes"
            camera_card = volumes / "Camera"
            external_ssd = volumes / "External"
            media_file = camera_card / "DCIM" / "100CANON" / "A001.MOV"
            media_file.parent.mkdir(parents=True)
            external_ssd.mkdir(parents=True)
            media_file.write_bytes(b"video-bytes")
            hints = {
                camera_card: VolumeDiscoveryHint(display_name="EOS_R5_CARD", is_removable=True),
                external_ssd: VolumeDiscoveryHint(display_name="Samsung_T7", is_removable=True),
            }
            route = self._ready_route(camera_card, external_ssd)

            with mock.patch("shootflow.card_workflow.discover_import_route", return_value=route) as discovery:
                run_card_dump_workflow(
                    [volumes],
                    shoot_date="2026-05-09",
                    shoot_slug="hint-calls",
                    headroom_bytes=0,
                    volume_hints=hints,
                )

        self.assertEqual(discovery.call_count, 2)
        self.assertEqual(discovery.call_args_list[0].args, ([volumes],))
        self.assertEqual(discovery.call_args_list[0].kwargs, {"volume_hints": hints})
        self.assertEqual(discovery.call_args_list[1].args, ([volumes],))
        self.assertEqual(
            discovery.call_args_list[1].kwargs,
            {
                "expected_import_bytes": 11,
                "headroom_bytes": 0,
                "volume_hints": hints,
            },
        )

    def test_workflow_uses_volume_hints_for_route_ranking_and_capacity_gate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            volumes = workspace / "Volumes"
            internal_disk = volumes / "Macintosh HD"
            external_ssd = volumes / "Untitled"
            camera_card = volumes / "Camera"
            media_file = camera_card / "DCIM" / "100CANON" / "A001.MOV"
            media_file.parent.mkdir(parents=True)
            internal_disk.mkdir(parents=True)
            external_ssd.mkdir(parents=True)
            media_file.write_bytes(b"video-bytes")

            with mock.patch(
                "shootflow.storage_discovery._read_filesystem_stats",
                return_value=(900 * 1024**3, 2 * 1024**4),
            ):
                report = run_card_dump_workflow(
                    [volumes],
                    shoot_date="2026-05-09",
                    shoot_slug="native-hint-demo",
                    headroom_bytes=0,
                    volume_hints={
                        internal_disk: VolumeDiscoveryHint(is_removable=False),
                        external_ssd: VolumeDiscoveryHint(
                            display_name="Samsung_T7",
                            is_removable=True,
                            is_read_only=False,
                        ),
                        camera_card: VolumeDiscoveryHint(
                            display_name="EOS_R5_CARD",
                            is_removable=True,
                        ),
                    },
                )

        self.assertEqual(report.status, "ready_for_review")
        self.assertFalse(report.ingest_executed)
        self.assertEqual(report.route.source.candidate.name, "EOS_R5_CARD")
        self.assertEqual(report.route.destination.candidate.name, "Samsung_T7")
        self.assertEqual(report.destination_root, external_ssd)
        self.assertEqual(report.source_estimate.media_file_count, 1)
        self.assertEqual(report.source_estimate.estimated_bytes, 11)
        self.assertEqual(report.preview_plan.shoot_folder, external_ssd / "2026-05-09_native-hint-demo")
        self.assertIn("capacity gate active", " ".join(report.route.safety_notes))

    def test_workflow_validates_volume_hints_before_preview(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            volumes = Path(tmp) / "Volumes"
            card = volumes / "Camera"
            (card / "DCIM").mkdir(parents=True)

            with self.assertRaisesRegex(CardDumpWorkflowError, "volume_hints"):
                run_card_dump_workflow(
                    [volumes],
                    shoot_date="2026-05-09",
                    shoot_slug="bad-hints",
                    volume_hints={str(card): VolumeDiscoveryHint()},  # type: ignore[dict-item]
                )

    def _ready_route(self, source_path: Path, destination_path: Path) -> ImportRouteRecommendation:
        source = RankedStorageCandidate(
            candidate=StorageCandidate(
                name="EOS_R5_CARD",
                path=source_path,
                free_bytes=64 * 1024**3,
                total_bytes=128 * 1024**3,
                is_removable=True,
                is_read_only=False,
            ),
            role="source",
            safety="review",
            confidence=90,
            reasons=("DCIM", "removable"),
        )
        destination = RankedStorageCandidate(
            candidate=StorageCandidate(
                name="Samsung_T7",
                path=destination_path,
                free_bytes=900 * 1024**3,
                total_bytes=2 * 1024**4,
                is_removable=True,
                is_read_only=False,
            ),
            role="destination",
            safety="automatic",
            confidence=75,
            reasons=("writable", "large free space"),
        )
        return ImportRouteRecommendation(
            source=source,
            destination=destination,
            status="ready_for_review",
            ready=True,
            review_required=True,
            safety_notes=("review source and destination before importing",),
        )


if __name__ == "__main__":
    unittest.main()
