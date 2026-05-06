import unittest
from pathlib import Path

from shootflow.storage import DriveRole, StorageCandidate, rank_storage_candidates


class StorageCandidateTests(unittest.TestCase):
    def test_prefers_removable_camera_card_as_ingest_source(self) -> None:
        candidates = [
            StorageCandidate(
                mount_path=Path("/Volumes/ArchiveSSD"),
                name="ArchiveSSD",
                free_bytes=4_000_000_000_000,
                is_removable=True,
                is_writable=True,
                media_markers=frozenset(),
            ),
            StorageCandidate(
                mount_path=Path("/Volumes/EOS_DIGITAL"),
                name="EOS_DIGITAL",
                free_bytes=32_000_000_000,
                is_removable=True,
                is_writable=True,
                media_markers=frozenset({"DCIM", "PRIVATE"}),
            ),
        ]

        assessments = rank_storage_candidates(candidates)

        self.assertEqual(assessments[0].candidate.name, "EOS_DIGITAL")
        self.assertEqual(assessments[0].recommended_role, DriveRole.INGEST_SOURCE)
        self.assertIn("camera media markers", assessments[0].reasons)

    def test_prefers_large_writable_non_card_drive_as_destination(self) -> None:
        candidates = [
            StorageCandidate(
                mount_path=Path("/Volumes/EOS_DIGITAL"),
                name="EOS_DIGITAL",
                free_bytes=32_000_000_000,
                is_removable=True,
                is_writable=True,
                media_markers=frozenset({"DCIM"}),
            ),
            StorageCandidate(
                mount_path=Path("/Volumes/WorkingSSD"),
                name="WorkingSSD",
                free_bytes=8_000_000_000_000,
                is_removable=True,
                is_writable=True,
                media_markers=frozenset(),
            ),
        ]

        assessments = rank_storage_candidates(candidates, desired_role=DriveRole.WORKING_DESTINATION)

        self.assertEqual(assessments[0].candidate.name, "WorkingSSD")
        self.assertEqual(assessments[0].recommended_role, DriveRole.WORKING_DESTINATION)
        self.assertIn("large free space", assessments[0].reasons)

    def test_flags_read_only_drive_as_review_only(self) -> None:
        assessments = rank_storage_candidates(
            [
                StorageCandidate(
                    mount_path=Path("/Volumes/LockedCard"),
                    name="LockedCard",
                    free_bytes=16_000_000_000,
                    is_removable=True,
                    is_writable=False,
                    media_markers=frozenset({"DCIM"}),
                )
            ]
        )

        self.assertEqual(assessments[0].recommended_role, DriveRole.REVIEW_ONLY)
        self.assertIn("read-only", assessments[0].warnings)


if __name__ == "__main__":
    unittest.main()
