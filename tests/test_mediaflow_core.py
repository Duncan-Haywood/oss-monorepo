import unittest

from mediaflow import (
    DestinationPolicy,
    MediaAsset,
    SocialGoal,
    plan_ingest,
    plan_social_outputs,
)


class IngestPlanningTests(unittest.TestCase):
    def test_ingest_plan_copies_to_primary_and_backup_before_allowing_delete(self):
        assets = [
            MediaAsset(
                source_path="/Volumes/CANON/DCIM/100EOSR5/IMG_0001.CR3",
                capture_id="IMG_0001",
                kind="raw_photo",
                bytes_size=42_000_000,
                checksum="sha256-raw-1",
                captured_at="2026-05-05T20:14:00Z",
            )
        ]
        policy = DestinationPolicy(
            project_slug="spring-lookbook",
            primary_root="/Volumes/WorkSSD/Shoots",
            backup_root="/Volumes/ArchiveSSD/Shoots",
            delete_source_after_verified_backup=True,
        )

        plan = plan_ingest(assets, policy)

        self.assertEqual(
            [step.action for step in plan.steps],
            ["copy_primary", "verify_primary", "copy_backup", "verify_backup", "delete_source"],
        )
        self.assertTrue(plan.can_delete_source)
        self.assertIn(
            "/Volumes/WorkSSD/Shoots/2026/05/spring-lookbook/raw_photo/IMG_0001.CR3",
            plan.steps[0].destination_path,
        )
        self.assertIn(
            "/Volumes/ArchiveSSD/Shoots/2026/05/spring-lookbook/raw_photo/IMG_0001.CR3",
            plan.steps[2].destination_path,
        )

    def test_ingest_plan_never_deletes_when_backup_is_missing_or_disabled(self):
        assets = [
            MediaAsset(
                source_path="/Volumes/SD/DCIM/A001_C001_0506AB.MOV",
                capture_id="A001_C001_0506AB",
                kind="log_video",
                bytes_size=5_200_000_000,
                checksum="sha256-video-1",
                captured_at="2026-05-06T14:03:00Z",
            )
        ]
        policy = DestinationPolicy(
            project_slug="brand-film",
            primary_root="/Volumes/RaidSSD/Shoots",
            backup_root=None,
            delete_source_after_verified_backup=True,
        )

        plan = plan_ingest(assets, policy)

        self.assertEqual([step.action for step in plan.steps], ["copy_primary", "verify_primary"])
        self.assertFalse(plan.can_delete_source)
        self.assertEqual(
            plan.safety_notes,
            ["Source deletion disabled because no backup destination was provided."],
        )

    def test_ingest_plan_deduplicates_by_checksum_and_records_skips(self):
        duplicate_assets = [
            MediaAsset(
                source_path="/Volumes/CARD1/DCIM/IMG_1001.JPG",
                capture_id="IMG_1001",
                kind="jpeg_photo",
                bytes_size=8_000_000,
                checksum="same-checksum",
                captured_at="2026-05-01T10:00:00Z",
            ),
            MediaAsset(
                source_path="/Volumes/CARD2/DCIM/IMG_1001.JPG",
                capture_id="IMG_1001-copy",
                kind="jpeg_photo",
                bytes_size=8_000_000,
                checksum="same-checksum",
                captured_at="2026-05-01T10:00:00Z",
            ),
        ]

        plan = plan_ingest(
            duplicate_assets,
            DestinationPolicy(
                project_slug="wedding-preview",
                primary_root="/Volumes/WorkSSD/Shoots",
                backup_root="/Volumes/BackupSSD/Shoots",
            ),
        )

        copy_steps = [step for step in plan.steps if step.action == "copy_primary"]
        self.assertEqual(len(copy_steps), 1)
        self.assertEqual(plan.skipped_duplicates, ["/Volumes/CARD2/DCIM/IMG_1001.JPG"])


class SocialPlanningTests(unittest.TestCase):
    def test_social_plan_batches_expensive_color_work_before_output_variants(self):
        assets = [
            MediaAsset(
                source_path=f"/shoot/clip_{index:03d}.MOV",
                capture_id=f"clip_{index:03d}",
                kind="log_video",
                bytes_size=2_000_000_000,
                checksum=f"video-{index}",
                captured_at="2026-05-06T15:00:00Z",
            )
            for index in range(6)
        ]

        plan = plan_social_outputs(
            assets,
            SocialGoal(reels=2, carousels=1, photo_posts=4, max_parallel_color_jobs=3),
        )

        self.assertEqual([len(batch.asset_ids) for batch in plan.color_batches], [3, 3])
        self.assertEqual(
            [deliverable.kind for deliverable in plan.deliverables],
            ["reel", "reel", "carousel", "photo_post"],
        )
        self.assertEqual(plan.deliverables[0].target_aspect_ratio, "9:16")
        self.assertEqual(plan.deliverables[2].target_aspect_ratio, "4:5")

    def test_social_plan_limits_carousel_frames_to_instagram_maximum(self):
        assets = [
            MediaAsset(
                source_path=f"/shoot/photo_{index:03d}.JPG",
                capture_id=f"photo_{index:03d}",
                kind="jpeg_photo",
                bytes_size=12_000_000,
                checksum=f"photo-{index}",
                captured_at="2026-05-06T15:00:00Z",
            )
            for index in range(18)
        ]

        plan = plan_social_outputs(
            assets,
            SocialGoal(reels=0, carousels=1, photo_posts=0, max_parallel_color_jobs=8),
        )

        self.assertEqual(len(plan.deliverables), 1)
        self.assertEqual(plan.deliverables[0].asset_ids, [f"photo_{index:03d}" for index in range(10)])


if __name__ == "__main__":
    unittest.main()
