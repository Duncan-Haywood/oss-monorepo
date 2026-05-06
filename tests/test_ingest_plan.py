import unittest
from pathlib import Path

from media_automation.ingest import (
    IngestOptions,
    MediaKind,
    plan_ingest,
)


class IngestPlanTests(unittest.TestCase):
    def test_plans_copy_operations_without_deleting_sources(self) -> None:
        source = {
            Path("/Volumes/CARD/DCIM/100EOS5D/IMG_0001.CR3"): b"raw-bytes",
            Path("/Volumes/CARD/DCIM/100EOS5D/IMG_0001.JPG"): b"jpg-bytes",
            Path("/Volumes/CARD/DCIM/100EOS5D/VID_0002.MOV"): b"mov-bytes",
        }

        plan = plan_ingest(
            source_files=source,
            existing_destinations=set(),
            options=IngestOptions(
                shoot_name="Desert Editorial",
                destination_root=Path("/Media/Archive"),
            ),
        )

        self.assertEqual(len(plan.operations), 3)
        self.assertFalse(plan.requires_source_deletion)
        self.assertTrue(all(operation.action == "copy" for operation in plan.operations))
        self.assertEqual(
            [operation.destination for operation in plan.operations],
            [
                Path("/Media/Archive/2026-05-06-desert-editorial/raw/IMG_0001.CR3"),
                Path("/Media/Archive/2026-05-06-desert-editorial/jpeg/IMG_0001.JPG"),
                Path("/Media/Archive/2026-05-06-desert-editorial/video/VID_0002.MOV"),
            ],
        )
        self.assertEqual(plan.summary.by_kind[MediaKind.RAW], 1)
        self.assertEqual(plan.summary.by_kind[MediaKind.JPEG], 1)
        self.assertEqual(plan.summary.by_kind[MediaKind.VIDEO], 1)

    def test_collision_destinations_are_versioned_instead_of_overwritten(self) -> None:
        source = {
            Path("/Volumes/CARD/DCIM/IMG_0001.JPG"): b"new-jpg",
        }

        plan = plan_ingest(
            source_files=source,
            existing_destinations={
                Path("/Media/Archive/2026-05-06-wedding-teaser/jpeg/IMG_0001.JPG"),
                Path("/Media/Archive/2026-05-06-wedding-teaser/jpeg/IMG_0001-1.JPG"),
            },
            options=IngestOptions(
                shoot_name="Wedding Teaser",
                destination_root=Path("/Media/Archive"),
            ),
        )

        self.assertEqual(
            plan.operations[0].destination,
            Path("/Media/Archive/2026-05-06-wedding-teaser/jpeg/IMG_0001-2.JPG"),
        )
        self.assertIn("IMG_0001.JPG", plan.warnings[0])

    def test_move_mode_is_a_verified_copy_then_quarantine_not_delete(self) -> None:
        source = {
            Path("/Volumes/CARD/DCIM/IMG_0001.CR3"): b"raw-bytes",
        }

        plan = plan_ingest(
            source_files=source,
            existing_destinations=set(),
            options=IngestOptions(
                shoot_name="Studio Lookbook",
                destination_root=Path("/Media/Archive"),
                transfer_mode="move_after_verify",
            ),
        )

        self.assertEqual([operation.action for operation in plan.operations], ["copy", "quarantine"])
        self.assertEqual(plan.operations[1].source, Path("/Volumes/CARD/DCIM/IMG_0001.CR3"))
        self.assertEqual(
            plan.operations[1].destination,
            Path("/Volumes/CARD/.media-automation-quarantine/IMG_0001.CR3"),
        )
        self.assertFalse(plan.requires_source_deletion)

    def test_ignores_non_media_and_records_manifest_checksums(self) -> None:
        source = {
            Path("/Volumes/CARD/DCIM/IMG_0001.CR3"): b"raw-bytes",
            Path("/Volumes/CARD/DCIM/notes.txt"): b"not media",
            Path("/Volumes/CARD/DCIM/.DS_Store"): b"metadata",
        }

        plan = plan_ingest(
            source_files=source,
            existing_destinations=set(),
            options=IngestOptions(
                shoot_name="Product Macro",
                destination_root=Path("/Media/Archive"),
            ),
        )

        self.assertEqual(len(plan.operations), 1)
        self.assertEqual(len(plan.manifest.items), 1)
        self.assertEqual(plan.manifest.items[0].sha256, "48c2a3cc55bca79baff97910b96c74b906fc5d893a1bc5ccd14d629d3f3ef715")
        self.assertTrue(any("notes.txt" in ignored for ignored in plan.ignored))


if __name__ == "__main__":
    unittest.main()
