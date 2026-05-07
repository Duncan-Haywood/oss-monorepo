import json
import math
import tempfile
import unittest
from pathlib import Path

from shootflow.analysis import AnalysisLoaderError, load_asset_analyses
from shootflow.deliverables import MediaAsset
from shootflow.production import build_production_plan
from shootflow.story import build_storyline_plan


class AnalysisLoaderTests(unittest.TestCase):
    def test_loads_plan_analysis_files_as_graded_story_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            plan = build_production_plan(
                [
                    MediaAsset(path="/shoot/originals/IMG_0001.JPG", media_type="photo"),
                    MediaAsset(path="/shoot/originals/A001.MOV", media_type="video"),
                ],
                shoot_slug="launch-shoot",
            )
            _write_analysis(
                workspace,
                0,
                source_asset_path="/shoot/originals/IMG_0001.JPG",
                media_type="photo",
                scene_label="details",
                aesthetic_score=0.91,
                story_score=0.84,
                technical_score=0.88,
                motion_score=0.0,
                tags=["rings", "flatlay"],
            )
            _write_analysis(
                workspace,
                1,
                source_asset_path="/shoot/originals/A001.MOV",
                media_type="video",
                scene_label="ceremony",
                aesthetic_score=0.93,
                story_score=0.9,
                technical_score=0.86,
                motion_score=0.78,
                duration_seconds=21.5,
                tags=["vows"],
            )

            analyses = load_asset_analyses(plan, workspace)
            story_plan = build_storyline_plan(analyses)

            self.assertEqual(
                [analysis.asset_path for analysis in analyses],
                [
                    "graded/grade_asset_00000/IMG_0001.JPG",
                    "graded/grade_asset_00001/A001.MOV",
                ],
            )
            self.assertEqual(analyses[0].tags, ("rings", "flatlay"))
            self.assertEqual(story_plan.reel.asset_paths, ("graded/grade_asset_00001/A001.MOV",))
            self.assertEqual(story_plan.carousel.asset_paths, ("graded/grade_asset_00000/IMG_0001.JPG",))

    def test_rejects_analysis_that_does_not_match_the_planned_asset(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            plan = build_production_plan(
                [MediaAsset(path="/shoot/originals/IMG_0001.JPG", media_type="photo")],
                shoot_slug="launch-shoot",
            )
            _write_analysis(
                workspace,
                0,
                source_asset_path="/shoot/originals/OTHER.JPG",
                media_type="photo",
                scene_label="details",
            )

            with self.assertRaisesRegex(AnalysisLoaderError, "does not match planned asset"):
                load_asset_analyses(plan, workspace)

    def test_rejects_invalid_analysis_schema_and_values(self) -> None:
        invalid_cases = [
            ("empty-scene", {"scene_label": ""}, "scene label"),
            ("unsupported-media", {"media_type": "audio"}, "media type"),
            ("nan-score", {"aesthetic_score": math.nan}, "aesthetic_score"),
            ("negative-duration", {"duration_seconds": -1.0}, "duration"),
            ("bad-tags", {"tags": ["details", 7]}, "tags"),
        ]
        for _case_name, overrides, error_match in invalid_cases:
            with self.subTest(_case_name), tempfile.TemporaryDirectory() as tmp:
                workspace = Path(tmp)
                plan = build_production_plan(
                    [MediaAsset(path="/shoot/originals/A001.MOV", media_type="video")],
                    shoot_slug="launch-shoot",
                )
                _write_analysis(
                    workspace,
                    0,
                    source_asset_path="/shoot/originals/A001.MOV",
                    media_type="video",
                    scene_label="ceremony",
                    duration_seconds=10.0,
                    **overrides,
                )

                with self.assertRaisesRegex(AnalysisLoaderError, error_match):
                    load_asset_analyses(plan, workspace)

    def test_rejects_symlinked_analysis_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            outside = workspace / "outside.json"
            outside.write_text("{}", encoding="utf-8")
            analysis_dir = workspace / "analysis"
            analysis_dir.mkdir()
            (analysis_dir / "00000.json").symlink_to(outside)
            plan = build_production_plan(
                [MediaAsset(path="/shoot/originals/IMG_0001.JPG", media_type="photo")],
                shoot_slug="launch-shoot",
            )

            with self.assertRaisesRegex(AnalysisLoaderError, "symlink"):
                load_asset_analyses(plan, workspace)

    def test_loads_ten_thousand_analysis_records_without_dropping_story_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            assets = [
                MediaAsset(path=f"/shoot/originals/IMG_{index:05d}.JPG", media_type="photo")
                for index in range(10_000)
            ]
            plan = build_production_plan(assets, shoot_slug="archive-shoot")
            for index, asset in enumerate(assets):
                _write_analysis(
                    workspace,
                    index,
                    source_asset_path=asset.path,
                    media_type="photo",
                    scene_label=f"scene-{index % 50}",
                    aesthetic_score=(index % 100) / 100,
                    story_score=0.72,
                    technical_score=0.81,
                    motion_score=0.0,
                )

            analyses = load_asset_analyses(plan, workspace)
            story_plan = build_storyline_plan(analyses)

            self.assertEqual(len(analyses), 10_000)
            self.assertEqual(len(story_plan.photo_set.asset_paths), 10_000)
            self.assertEqual(len(story_plan.carousel.asset_paths), 10)


def _write_analysis(
    workspace: Path,
    index: int,
    *,
    source_asset_path: str,
    media_type: str,
    scene_label: str,
    aesthetic_score: float = 0.8,
    story_score: float = 0.8,
    technical_score: float = 0.8,
    motion_score: float = 0.0,
    duration_seconds: float | None = None,
    tags: list[object] | None = None,
) -> None:
    analysis_dir = workspace / "analysis"
    analysis_dir.mkdir(exist_ok=True)
    payload: dict[str, object] = {
        "source_asset_path": source_asset_path,
        "media_type": media_type,
        "scene_label": scene_label,
        "aesthetic_score": aesthetic_score,
        "story_score": story_score,
        "technical_score": technical_score,
        "motion_score": motion_score,
        "tags": [] if tags is None else tags,
    }
    if duration_seconds is not None:
        payload["duration_seconds"] = duration_seconds
    (analysis_dir / f"{index:05d}.json").write_text(json.dumps(payload), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
