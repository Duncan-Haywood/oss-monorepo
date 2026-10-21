import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from shootflow.analysis import group_near_duplicates
from shootflow.ffmpeg_media import find_ffmpeg_tools
from shootflow.frame_analysis import (
    FRAME_HEIGHT,
    FRAME_WIDTH,
    analyze_media,
    dhash_hex,
    framing_from_frame,
    hamming_distance,
    metrics_from_frames,
)
from shootflow.story import AssetAnalysis

FFMPEG = shutil.which("ffmpeg")
SIZE = FRAME_WIDTH * FRAME_HEIGHT


def _checker(low: int, high: int, cell: int = 8) -> bytes:
    return bytes(
        high if ((x // cell) + (y // cell)) % 2 else low
        for y in range(FRAME_HEIGHT)
        for x in range(FRAME_WIDTH)
    )


def _gradient() -> bytes:
    return bytes(int(x * 255 / (FRAME_WIDTH - 1)) for _ in range(FRAME_HEIGHT) for x in range(FRAME_WIDTH))


def _patch(cx: int, cy: int, half: int = 20) -> bytes:
    """Flat grey frame with one checkered patch centred on (cx, cy) pixels."""

    return bytes(
        200 if (abs(x - cx) < half and abs(y - cy) < half and ((x // 4) + (y // 4)) % 2) else 100
        for y in range(FRAME_HEIGHT)
        for x in range(FRAME_WIDTH)
    )


class FramingTests(unittest.TestCase):
    def test_flat_frame_is_neutral(self) -> None:
        self.assertEqual(framing_from_frame(bytes([120]) * SIZE), (0.5, 0.5, 0.5))

    def test_subject_on_a_thirds_point_beats_one_in_the_corner(self) -> None:
        thirds, x, y = framing_from_frame(_patch(FRAME_WIDTH // 3, FRAME_HEIGHT // 3))
        corner, _, _ = framing_from_frame(_patch(24, 24))
        self.assertAlmostEqual(x, 1 / 3, delta=0.05)
        self.assertAlmostEqual(y, 1 / 3, delta=0.05)
        self.assertGreater(thirds, 0.8)
        self.assertGreater(thirds, corner + 0.3)

    def test_isolated_subject_beats_even_texture_at_the_centre(self) -> None:
        isolated, _, _ = framing_from_frame(_patch(FRAME_WIDTH // 2, FRAME_HEIGHT // 2))
        texture, _, _ = framing_from_frame(_checker(40, 200))
        self.assertGreater(isolated, texture)

    def test_metrics_carry_framing_into_story_score(self) -> None:
        good = metrics_from_frames([_patch(FRAME_WIDTH // 3, FRAME_HEIGHT // 3)])
        bad = metrics_from_frames([_patch(24, 24)])
        self.assertGreater(good.framing, bad.framing)
        self.assertGreater(good.story_score, bad.story_score)


class MetricsFromFramesTests(unittest.TestCase):
    def test_flat_frame_is_unsharp_and_sharp_frame_scores_higher(self) -> None:
        flat = metrics_from_frames([bytes([120]) * SIZE])
        sharp = metrics_from_frames([_checker(40, 200)])
        self.assertEqual(flat.sharpness, 0.0)
        self.assertGreater(sharp.sharpness, 0.9)
        self.assertGreater(sharp.technical_score, flat.technical_score)

    def test_exposure_penalises_dark_and_blown_frames(self) -> None:
        good = metrics_from_frames([_gradient()])
        dark = metrics_from_frames([bytes([3]) * SIZE])
        blown = metrics_from_frames([bytes([252]) * SIZE])
        self.assertGreater(good.exposure, 0.6)
        self.assertEqual(dark.exposure, 0.0)
        self.assertEqual(blown.exposure, 0.0)
        self.assertEqual(dark.clipped_shadows, 1.0)
        self.assertEqual(blown.clipped_highlights, 1.0)

    def test_motion_is_zero_for_one_frame_and_grows_with_change(self) -> None:
        still = metrics_from_frames([bytes([100]) * SIZE] * 3)
        moving = metrics_from_frames([bytes([20]) * SIZE, bytes([120]) * SIZE, bytes([20]) * SIZE])
        self.assertEqual(metrics_from_frames([bytes([100]) * SIZE]).motion, 0.0)
        self.assertEqual(still.motion, 0.0)
        self.assertEqual(moving.motion, 1.0)

    def test_scores_stay_in_unit_range(self) -> None:
        for frame in (bytes(SIZE), bytes([255]) * SIZE, _checker(0, 255), _gradient()):
            m = metrics_from_frames([frame])
            for score in (m.technical_score, m.aesthetic_score, m.story_score, m.sharpness, m.exposure):
                self.assertTrue(0.0 <= score <= 1.0)

    def test_dhash_separates_different_layouts_and_ignores_brightness(self) -> None:
        gradient = _gradient()
        brighter = bytes(min(255, v + 20) for v in gradient)
        reversed_gradient = bytes(255 - v for v in gradient)
        self.assertEqual(hamming_distance(dhash_hex(gradient), dhash_hex(brighter)), 0)
        self.assertGreater(hamming_distance(dhash_hex(gradient), dhash_hex(reversed_gradient)), 40)


class NearDuplicateGroupingTests(unittest.TestCase):
    def _asset(self, name: str, phash: str | None, media: str = "photo") -> AssetAnalysis:
        return AssetAnalysis(
            asset_path=f"graded/{name}",
            media_type=media,  # type: ignore[arg-type]
            scene_label=f"frame_{name}",
            aesthetic_score=0.5,
            story_score=0.5,
            technical_score=0.5,
            motion_score=0.0,
            perceptual_hash=phash,
        )

    def test_close_hashes_share_the_first_assets_label_transitively(self) -> None:
        a = self._asset("a.jpg", "0000000000000000")
        b = self._asset("b.jpg", "00000000000000ff")  # 8 bits from a
        c = self._asset("c.jpg", "000000000000ffff")  # 8 bits from b, 16 from a
        far = self._asset("z.jpg", "ffffffffffffffff")
        grouped = {item.asset_path: item.scene_label for item in group_near_duplicates([c, far, b, a])}
        self.assertEqual(grouped["graded/b.jpg"], "frame_a.jpg")
        self.assertEqual(grouped["graded/c.jpg"], "frame_a.jpg")
        self.assertEqual(grouped["graded/z.jpg"], "frame_z.jpg")

    def test_assets_without_hashes_and_videos_are_untouched(self) -> None:
        plain = self._asset("a.jpg", None)
        video = self._asset("b.mp4", "0000000000000000", media="video")
        other = self._asset("c.jpg", "0000000000000000")
        grouped = group_near_duplicates([plain, video, other])
        self.assertEqual([item.scene_label for item in grouped], ["frame_a.jpg", "frame_b.mp4", "frame_c.jpg"])


@unittest.skipUnless(FFMPEG, "ffmpeg is required")
class AnalyzeMediaTests(unittest.TestCase):
    def _make(self, directory: Path, name: str, *args: str) -> Path:
        path = directory / name
        subprocess.run(
            [FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin", *args, str(path)],
            check=True,
        )
        return path

    def test_real_photo_blur_and_exposure_and_video_duration(self) -> None:
        tools = find_ffmpeg_tools()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sharp = self._make(root, "sharp.png", "-f", "lavfi", "-i", "testsrc2=size=640x360", "-frames:v", "1")
            blurred = self._make(
                root, "blur.png", "-f", "lavfi", "-i", "testsrc2=size=640x360,gblur=sigma=12", "-frames:v", "1"
            )
            dark = self._make(
                root, "dark.png", "-f", "lavfi", "-i", "testsrc2=size=640x360,eq=brightness=-0.9", "-frames:v", "1"
            )
            clip = self._make(
                root, "clip.mp4", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10", "-t", "3",
                "-pix_fmt", "yuv420p",
            )
            sharp_m = analyze_media(tools, sharp, media_type="photo")
            self.assertGreater(sharp_m.sharpness, analyze_media(tools, blurred, media_type="photo").sharpness)
            self.assertLess(analyze_media(tools, dark, media_type="photo").exposure, sharp_m.exposure)
            clip_m = analyze_media(tools, clip, media_type="video")
            self.assertAlmostEqual(clip_m.duration_seconds or 0.0, 3.0, delta=0.2)
            self.assertGreater(clip_m.frames_sampled, 1)
            self.assertGreater(clip_m.motion, 0.0)
            # The blurred copy is the same shot, so it lands within the grouping radius.
            self.assertLessEqual(
                hamming_distance(sharp_m.dhash, analyze_media(tools, blurred, media_type="photo").dhash), 8
            )


if __name__ == "__main__":
    unittest.main()
