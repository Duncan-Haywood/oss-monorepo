import tempfile
import unittest
from pathlib import Path

from shootflow.assembly import AssemblyPlanError, build_assembly_plan
from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.story import ContentSequence, StorylinePlan, write_storyline_artifact


class AssemblyPlanningTests(unittest.TestCase):
    def test_builds_render_tasks_from_storyline_selected_graded_assets(self) -> None:
        assets = [
            MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0),
            MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo"),
            MediaAsset(path="card/DCIM/IMG_0002.JPG", media_type="photo"),
        ]
        production_plan = build_production_plan(assets, shoot_slug="editorial-launch")
        reel_asset = "graded/grade_asset_00000/A001.MOV"
        first_photo = "graded/grade_asset_00001/IMG_0001.CR3"
        second_photo = "graded/grade_asset_00002/IMG_0002.JPG"

        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(reel_asset,),
                total_duration_seconds=24.0,
                rationale="Hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(first_photo,),
                total_duration_seconds=None,
                rationale="Tight carousel.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(first_photo, second_photo),
                total_duration_seconds=None,
                rationale="Full ranked set.",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_workspace_files(workspace, (reel_asset, first_photo, second_photo))
            write_storyline_artifact(
                storyline,
                workspace,
                allowed_asset_paths={reel_asset, first_photo, second_photo},
            )

            assembly_plan = build_assembly_plan(production_plan, workspace)

        self.assertEqual(assembly_plan.shoot_slug, "editorial-launch")
        self.assertEqual([task.task_id for task in assembly_plan.render_tasks], [
            "render_instagram_reel",
            "render_instagram_carousel",
            "export_instagram_photo_set",
        ])
        reel_task, carousel_task, photo_set_task = assembly_plan.render_tasks
        self.assertEqual(reel_task.inputs, ("analysis/instagram_storylines.json", reel_asset))
        self.assertEqual(reel_task.outputs, ("deliverables/instagram_reel.mp4",))
        self.assertEqual(carousel_task.inputs, ("analysis/instagram_storylines.json", first_photo))
        self.assertEqual(carousel_task.outputs, ("deliverables/instagram_carousel/slide_00001.jpg",))
        self.assertEqual(photo_set_task.inputs, ("analysis/instagram_storylines.json", first_photo, second_photo))
        self.assertEqual(
            photo_set_task.outputs,
            (
                "deliverables/instagram_photo_set/photo_00001.jpg",
                "deliverables/instagram_photo_set/photo_00002.jpg",
            ),
        )

    def test_rejects_storyline_assets_that_are_missing_from_workspace(self) -> None:
        assets = [MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0)]
        production_plan = build_production_plan(assets, shoot_slug="missing-graded")
        reel_asset = "graded/grade_asset_00000/A001.MOV"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(reel_asset,),
                total_duration_seconds=24.0,
                rationale="Hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            write_storyline_artifact(storyline, workspace, allowed_asset_paths={reel_asset})

            with self.assertRaisesRegex(AssemblyPlanError, "Missing graded asset"):
                build_assembly_plan(production_plan, workspace)

    def test_rejects_sequence_assets_with_wrong_media_type(self) -> None:
        assets = [
            MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0),
            MediaAsset(path="card/DCIM/IMG_0001.CR3", media_type="photo"),
        ]
        production_plan = build_production_plan(assets, shoot_slug="wrong-sequence-type")
        video_asset = "graded/grade_asset_00000/A001.MOV"
        photo_asset = "graded/grade_asset_00001/IMG_0001.CR3"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(video_asset,),
                total_duration_seconds=24.0,
                rationale="Hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(video_asset,),
                total_duration_seconds=None,
                rationale="Bad model selection.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(photo_asset,),
                total_duration_seconds=None,
                rationale="Trusted photo.",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            self._touch_workspace_files(workspace, (video_asset, photo_asset))
            write_storyline_artifact(
                storyline,
                workspace,
                allowed_asset_paths={video_asset, photo_asset},
            )

            with self.assertRaisesRegex(AssemblyPlanError, "carousel requires photo"):
                build_assembly_plan(production_plan, workspace)

    def test_rejects_symlinked_selected_graded_assets(self) -> None:
        assets = [MediaAsset(path="card/DCIM/A001.MOV", media_type="video", duration_seconds=24.0)]
        production_plan = build_production_plan(assets, shoot_slug="symlink-graded")
        reel_asset = "graded/grade_asset_00000/A001.MOV"
        storyline = StorylinePlan(
            reel=ContentSequence(
                output_kind="instagram_reel",
                aspect_ratio="9:16",
                asset_paths=(reel_asset,),
                total_duration_seconds=24.0,
                rationale="Hero reel.",
            ),
            carousel=ContentSequence(
                output_kind="instagram_carousel",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
            photo_set=ContentSequence(
                output_kind="instagram_photo_set",
                aspect_ratio="4:5",
                asset_paths=(),
                total_duration_seconds=None,
                rationale="No photos.",
            ),
        )

        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside_tmp:
            workspace = Path(tmp)
            target = Path(outside_tmp) / "A001.MOV"
            target.write_bytes(b"outside media")
            asset_path = workspace / reel_asset
            asset_path.parent.mkdir(parents=True)
            asset_path.symlink_to(target)
            write_storyline_artifact(storyline, workspace, allowed_asset_paths={reel_asset})

            with self.assertRaisesRegex(AssemblyPlanError, "symlink"):
                build_assembly_plan(production_plan, workspace)

    def _touch_workspace_files(self, workspace: Path, relative_paths: tuple[str, ...]) -> None:
        for relative_path in relative_paths:
            path = workspace / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"graded media")


if __name__ == "__main__":
    unittest.main()
