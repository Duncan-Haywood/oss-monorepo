import math
import random
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
    noise_sigma_from_frame,
    tilt_from_frame,
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


def _horizon(degrees: float) -> bytes:
    """Dark ground under a bright sky; the boundary leans ``degrees`` (right side lower)."""

    slope = math.tan(math.radians(degrees))
    # A soft edge (a 10 px ramp), as a lens renders it; a hard staircase has no angle to read.
    norm = math.sqrt(1.0 + slope * slope)
    return bytes(
        round(125 - 75 * max(-1.0, min(1.0, (y - FRAME_HEIGHT / 2 - (x - FRAME_WIDTH / 2) * slope) / norm / 5.0)))
        for y in range(FRAME_HEIGHT)
        for x in range(FRAME_WIDTH)
    )


class TiltTests(unittest.TestCase):
    def test_level_horizon_has_no_tilt(self) -> None:
        tilt, confidence = tilt_from_frame(_horizon(0))
        self.assertAlmostEqual(tilt, 0.0, delta=0.3)
        self.assertGreater(confidence, 0.8)

    def test_leaning_horizon_is_measured_with_its_sign(self) -> None:
        for degrees in (-4.0, 3.0, 6.0):
            tilt, _ = tilt_from_frame(_horizon(degrees))
            self.assertAlmostEqual(tilt, degrees, delta=1.0, msg=f"{degrees}")

    def test_flat_frame_and_diagonals_are_not_penalised(self) -> None:
        self.assertEqual(tilt_from_frame(bytes([120]) * SIZE), (0.0, 0.0))
        diagonal = bytes(200 if (x + y) % 40 < 20 else 50 for y in range(FRAME_HEIGHT) for x in range(FRAME_WIDTH))
        _, confidence = tilt_from_frame(diagonal)
        self.assertLess(confidence, 0.1)

    def test_crooked_horizon_loses_story_score(self) -> None:
        level = metrics_from_frames([_horizon(0)])
        crooked = metrics_from_frames([_horizon(5)])
        self.assertEqual(level.level, 1.0)
        self.assertLess(crooked.level, 0.2)
        self.assertLess(crooked.story_score, level.story_score)


def _noisy(base: bytes, sigma: float, seed: int = 7) -> bytes:
    rng = random.Random(seed)
    return bytes(max(0, min(255, round(v + rng.gauss(0.0, sigma)))) for v in base)


class NoiseTests(unittest.TestCase):
    def test_clean_frames_read_zero_and_gradients_are_not_grain(self) -> None:
        self.assertEqual(noise_sigma_from_frame(bytes([120]) * SIZE), 0.0)
        self.assertLess(noise_sigma_from_frame(_gradient()), 0.5)
        self.assertLess(noise_sigma_from_frame(_checker(40, 200)), 0.5)

    def test_added_grain_is_recovered_within_a_fifth(self) -> None:
        for sigma in (4.0, 8.0, 12.0):
            measured = noise_sigma_from_frame(_noisy(bytes([128]) * SIZE, sigma))
            self.assertAlmostEqual(measured, sigma, delta=0.2 * sigma, msg=f"{sigma}")

    def test_grain_does_not_pass_for_sharpness(self) -> None:
        flat = metrics_from_frames([bytes([128]) * SIZE])
        grainy = metrics_from_frames([_noisy(bytes([128]) * SIZE, 10.0)])
        self.assertLess(grainy.sharpness, 0.5)  # raw Laplacian variance would score about 0.97
        self.assertGreater(grainy.noise, 0.5)
        self.assertLess(flat.noise, 0.01)

    def test_grain_on_a_sharp_frame_costs_technical_score(self) -> None:
        clean = metrics_from_frames([_checker(40, 200)])
        grainy = metrics_from_frames([_noisy(_checker(40, 200), 12.0)])
        self.assertEqual(clean.noise, 0.0)
        self.assertGreater(grainy.noise, 0.8)
        self.assertLess(grainy.technical_score, clean.technical_score)


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
