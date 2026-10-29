import io
import json
import os
import plistlib
import shutil
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from shootflow import ffmpeg_media
from shootflow.cli import main
from shootflow.ffmpeg_media import (
    FfmpegMediaError,
    FfmpegTools,
    encode_new_output,
    encode_new_outputs,
    find_ffmpeg_tools,
    grade_command,
    media_kind_for_path,
    reel_command,
)
from shootflow.ingest import execute_copy_plan, plan_import
from shootflow.local_pipeline import launchd_plist_bytes, run_local_pipeline

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
SOFTWARE_TOOLS = FfmpegTools(ffmpeg="ffmpeg", h264_encoder="libx264", prores_encoder="prores_ks")
HARDWARE_TOOLS = FfmpegTools(
    ffmpeg="ffmpeg",
    h264_encoder="h264_videotoolbox",
    prores_encoder="prores_videotoolbox",
)


class FfmpegCommandTests(unittest.TestCase):
    def test_media_kind_accepts_ffmpeg_formats_and_refuses_raw(self) -> None:
        self.assertEqual(media_kind_for_path("graded/x/IMG_0001.JPG"), "photo")
        self.assertEqual(media_kind_for_path("graded/x/A001.MOV"), "video")
        with self.assertRaisesRegex(FfmpegMediaError, "RAW developer"):
            media_kind_for_path("originals/IMG_0001.CR3")

    def test_commands_never_overwrite_and_pass_inputs_as_file_urls(self) -> None:
        command = grade_command(
            SOFTWARE_TOOLS,
            Path("/shoot/-i evil.MOV"),
            Path("/shoot/graded/.A001.tmp.MOV"),
            lut_path="color/shoot_look.cube",
        )
        self.assertIn("-n", command)
        self.assertIn("-nostdin", command)
        self.assertNotIn("-y", command)
        self.assertIn("file:/shoot/-i evil.MOV", command)
        self.assertIn("lut3d=file=color/shoot_look.cube", command)
        self.assertEqual(command[command.index("-c:v") + 1], "prores_ks")

    def test_grade_rejects_lut_paths_that_could_inject_filter_arguments(self) -> None:
        with self.assertRaisesRegex(FfmpegMediaError, "plain workspace-relative"):
            grade_command(
                SOFTWARE_TOOLS,
                Path("/shoot/A001.MOV"),
                Path("/shoot/graded/A001.MOV"),
                lut_path="color/a.cube,drawtext=text=x",
            )

    def test_hardware_encoders_use_bitrate_targets(self) -> None:
        reel = reel_command(HARDWARE_TOOLS, (Path("/shoot/a.MOV"),), Path("/shoot/reel.mp4"))
        self.assertEqual(reel[reel.index("-c:v") + 1], "h264_videotoolbox")
        self.assertEqual(reel[reel.index("-b:v") + 1], "12M")
        master = grade_command(HARDWARE_TOOLS, Path("/s/A.MOV"), Path("/s/g/A.MOV"), lut_path=None)
        self.assertEqual(master[master.index("-c:v") + 1], "prores_videotoolbox")

    def test_reel_shortens_each_clip_to_stay_within_instagram_limit(self) -> None:
        sources = tuple(Path(f"/shoot/clip_{index:02d}.MOV") for index in range(45))
        command = reel_command(SOFTWARE_TOOLS, sources, Path("/shoot/reel.mp4"))
        graph = command[command.index("-filter_complex") + 1]
        self.assertIn("trim=duration=2.000", graph)
        self.assertIn("concat=n=45:v=1:a=0", graph)
        self.assertIn("-an", command)

    def test_encoder_override_must_name_an_available_encoder(self) -> None:
        ffmpeg_media._available_encoders.cache_clear()
        with (
            patch.object(ffmpeg_media, "_available_encoders", return_value=frozenset({"libx264", "prores_ks"})),
            patch.object(ffmpeg_media.shutil, "which", return_value="/usr/bin/ffmpeg"),
            patch.dict(os.environ, {"SHOOTFLOW_H264_ENCODER": "h264_nvenc"}),
            self.assertRaisesRegex(FfmpegMediaError, "h264_nvenc"),
        ):
            find_ffmpeg_tools()

    def test_software_encoders_are_chosen_off_mac(self) -> None:
        encoders = frozenset({"libx264", "prores_ks", "h264_videotoolbox", "prores_videotoolbox"})
        with (
            patch.object(ffmpeg_media, "_available_encoders", return_value=encoders),
            patch.object(ffmpeg_media.shutil, "which", return_value="/usr/bin/ffmpeg"),
            patch.object(ffmpeg_media.sys, "platform", "linux"),
            patch.dict(os.environ, {}, clear=False),
        ):
            os.environ.pop("SHOOTFLOW_H264_ENCODER", None)
            os.environ.pop("SHOOTFLOW_PRORES_ENCODER", None)
            os.environ.pop("SHOOTFLOW_FFMPEG", None)
            tools = find_ffmpeg_tools()
        self.assertEqual((tools.h264_encoder, tools.prores_encoder), ("libx264", "prores_ks"))

    def test_launchd_plist_runs_pipeline_nightly_under_caffeinate(self) -> None:
        content = launchd_plist_bytes(
            ingest_manifests=("/Volumes/SSD/2026-10-18_wedding/ingest_manifest.json",),
            hour=1,
            minute=30,
            max_concurrency=3,
            log_path="/Users/me/Library/Logs/shootflow.log",
            source_root="/Users/me/shootflow/src",
            python="/usr/bin/python3",
        )
        payload = plistlib.loads(content)
        self.assertEqual(payload["StartCalendarInterval"], {"Hour": 1, "Minute": 30})
        self.assertEqual(payload["ProgramArguments"][:3], ["/usr/bin/caffeinate", "-i", "/usr/bin/python3"])
        self.assertIn("run-local-pipeline", payload["ProgramArguments"])
        self.assertIn(
            "/Volumes/SSD/2026-10-18_wedding/ingest_manifest.json",
            payload["ProgramArguments"],
        )
        self.assertEqual(payload["EnvironmentVariables"]["PYTHONPATH"], "/Users/me/shootflow/src")


@unittest.skipUnless(FFMPEG and FFPROBE, "ffmpeg and ffprobe are required for media tests")
class FfmpegMediaTests(unittest.TestCase):
    def test_existing_output_is_never_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _make_photo(root / "in.JPG", color="red")
            existing = root / "deliverables" / "out.jpg"
            existing.parent.mkdir(parents=True)
            existing.write_bytes(b"already posted")
            with self.assertRaisesRegex(FfmpegMediaError, "Refusing to overwrite"):
                encode_new_output(
                    root,
                    "deliverables/out.jpg",
                    build_command=lambda temp: ffmpeg_media.feed_image_command(
                        find_ffmpeg_tools(), root / "in.JPG", temp
                    ),
                )
            self.assertEqual(existing.read_bytes(), b"already posted")
            self.assertEqual(_hidden_temp_files(root), [])

    def test_failed_encode_part_way_through_commits_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _make_photo(root / "in.JPG", color="red")
            tools = find_ffmpeg_tools()
            with self.assertRaises(FfmpegMediaError):
                encode_new_outputs(
                    root,
                    (
                        (
                            "deliverables/a.jpg",
                            lambda temp: ffmpeg_media.feed_image_command(tools, root / "in.JPG", temp),
                        ),
                        (
                            "deliverables/b.jpg",
                            lambda temp: ffmpeg_media.feed_image_command(tools, root / "missing.JPG", temp),
                        ),
                    ),
                )
            self.assertFalse((root / "deliverables" / "a.jpg").exists())
            self.assertEqual(_hidden_temp_files(root), [])


@unittest.skipUnless(FFMPEG and FFPROBE, "ffmpeg and ffprobe are required for media tests")
class LocalPipelineTests(unittest.TestCase):
    def test_unattended_run_grades_with_lut_and_renders_instagram_media(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest = _ingested_shoot(Path(tmp))
            workspace = manifest.parent
            (workspace / "color").mkdir()
            _write_invert_lut(workspace / "color" / "shoot_look.cube")

            result = run_local_pipeline(manifest, max_concurrency=3, clock=_ticking_clock())

            self.assertTrue(result.rendered, result)
            self.assertEqual(result.needs_review_ids, ())
            analyses = [json.loads(path.read_text()) for path in sorted((workspace / "analysis").glob("0*.json"))]
            self.assertTrue(analyses)
            for analysis in analyses:
                self.assertEqual(analysis["analysis_method"], "frame_metrics", analysis["source_asset_path"])
                self.assertRegex(analysis["perceptual_hash"], r"^[0-9a-f]{16}$")
            video = next(a for a in analyses if a["media_type"] == "video")
            self.assertGreater(video["duration_seconds"], 0.0)
            reel = _probe(workspace / "deliverables" / "instagram_reel.mp4")
            self.assertEqual((reel["codec_name"], reel["width"], reel["height"]), ("h264", 1080, 1920))
            slides = sorted((workspace / "deliverables" / "instagram_carousel").glob("slide_*.jpg"))
            self.assertGreaterEqual(len(slides), 1)
            slide = _probe(slides[0])
            self.assertEqual((slide["width"], slide["height"]), (1080, 1350))
            master = _probe(next((workspace / "graded").glob("*/A001.MOV")))
            self.assertEqual(master["codec_name"], "prores")
            proxy = _probe(next((workspace / "proxies").glob("*/A001.MOV")))
            self.assertLessEqual(max(proxy["width"], proxy["height"]), 960)

            red = _center_rgb(workspace / "originals" / "DCIM" / "IMG_0001.JPG")
            graded = _center_rgb(next((workspace / "graded").glob("*/IMG_0001.JPG")))
            self.assertGreater(red[0], 200)
            self.assertLess(graded[0], 60, "the inverting LUT should turn red into cyan")
            self.assertGreater(graded[1], 190)
            self.assertEqual(_hidden_temp_files(workspace), [])

            before = (workspace / "deliverables" / "instagram_reel.mp4").read_bytes()
            rerun = run_local_pipeline(manifest, max_concurrency=3, clock=_ticking_clock(hours=1))
            self.assertTrue(rerun.rendered)
            self.assertEqual(rerun.needs_review_ids, ())
            self.assertEqual((workspace / "deliverables" / "instagram_reel.mp4").read_bytes(), before)

    def test_raw_files_stop_before_render_and_are_listed_for_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest = _ingested_shoot(Path(tmp), extra_files={"IMG_0003.CR3": b"not decodable by ffmpeg"})

            result = run_local_pipeline(manifest, clock=_ticking_clock())

            self.assertFalse(result.rendered)
            self.assertTrue(any(job_id.startswith("proxy_asset_") for job_id in result.needs_review_ids))
            self.assertIsNotNone(result.stopped_before_render_reason)
            self.assertFalse((manifest.parent / "deliverables" / "instagram_reel.mp4").exists())
            status = json.loads((manifest.parent / "production_status.json").read_text())
            messages = [job["error_message"] for job in status["job_statuses"] if job["state"] == "retryable"]
            self.assertTrue(any("no embedded JPEG preview" in message for message in messages))

    def test_cli_exit_code_reports_review_needed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest = _ingested_shoot(Path(tmp), extra_files={"IMG_0003.CR3": b"raw"})
            stdout = io.StringIO()
            stderr = io.StringIO()
            code = main(
                ["run-local-pipeline", "--ingest-manifest", str(manifest)],
                stdout=stdout,
                stderr=stderr,
            )
            self.assertEqual(code, 2, stderr.getvalue())
            summary = json.loads(stdout.getvalue())
            self.assertFalse(summary["rendered"])
            self.assertTrue(summary["needs_review_ids"])


def _ingested_shoot(base: Path, *, extra_files: dict[str, bytes] | None = None) -> Path:
    card = base / "card" / "DCIM"
    card.mkdir(parents=True)
    _run(
        "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=0.5",
        "-f", "lavfi", "-i", "sine=duration=0.5",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
        str(card / "A001.MOV"),
    )
    _run(
        "-f", "lavfi", "-i", "testsrc2=size=180x320:rate=24:duration=0.5",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        str(card / "A002.MP4"),
    )
    _make_photo(card / "IMG_0001.JPG", color="red")
    _make_photo(card / "IMG_0002.JPG", color="blue")
    for name, content in (extra_files or {}).items():
        (card / name).write_bytes(content)
    plan = plan_import(base / "card", base / "ssd", shoot_date="2026-10-18", shoot_slug="pipeline-test")
    return execute_copy_plan(plan).manifest_path


def _make_photo(path: Path, *, color: str) -> None:
    _run("-f", "lavfi", "-i", f"color=c={color}:size=240x160", "-frames:v", "1", str(path))


def _write_invert_lut(path: Path) -> None:
    lines = ["LUT_3D_SIZE 2"]
    for blue in (0, 1):
        for green in (0, 1):
            for red in (0, 1):
                lines.append(f"{1 - red}.0 {1 - green}.0 {1 - blue}.0")
    path.write_text("\n".join(lines) + "\n")


def _run(*args: str) -> None:
    subprocess.run(
        [FFMPEG or "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *args],
        check=True,
    )


def _probe(path: Path) -> dict[str, object]:
    completed = subprocess.run(
        [FFPROBE or "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams", "-of", "json", str(path)],
        check=True,
        capture_output=True,
    )
    return json.loads(completed.stdout)["streams"][0]


def _center_rgb(path: Path) -> tuple[int, int, int]:
    completed = subprocess.run(
        [
            FFMPEG or "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(path),
            "-vf", "crop=2:2,scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        check=True,
        capture_output=True,
    )
    red, green, blue = completed.stdout[:3]
    return red, green, blue


def _hidden_temp_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob(".*") if ".tmp" in path.name)


def _ticking_clock(hours: int = 0):
    moment = datetime(2026, 10, 19, 1, 30, tzinfo=timezone.utc) + timedelta(hours=hours)

    def clock() -> datetime:
        nonlocal moment
        moment += timedelta(seconds=1)
        return moment

    return clock


if __name__ == "__main__":
    unittest.main()
