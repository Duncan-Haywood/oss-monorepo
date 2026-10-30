import shutil
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

from shootflow.ffmpeg_media import FfmpegMediaError, find_ffmpeg_tools
from shootflow.frame_analysis import analyze_media
from shootflow.catalog import MediaAsset
from shootflow.production import build_production_plan
from shootflow.production_adapter import ProductionAdapterError, _materialize_ffmpeg_proxy_production_outputs
from shootflow.production_worker import ProductionWorkerAction
from shootflow.raw_preview import extract_preview, is_raw_path

FFMPEG = shutil.which("ffmpeg")


def _fake_jpeg(width: int, height: int, payload: bytes = b"\x12\x34\xff\x00\x56") -> bytes:
    """Structurally valid JPEG (SOF0 + SOS + stuffed entropy data + EOI), not decodable."""

    sof = b"\xff\xc0" + struct.pack(">HBHHB", 11, 8, height, width, 1) + b"\x01\x11\x00"
    sos = b"\xff\xda" + struct.pack(">H", 8) + b"\x01\x01\x00\x00\x3f\x00"
    return b"\xff\xd8" + sof + sos + payload + b"\xff\xd9"


class ExtractPreviewTests(unittest.TestCase):
    def _write(self, directory: Path, name: str, content: bytes) -> Path:
        path = directory / name
        path.write_bytes(content)
        return path

    def test_largest_jpeg_wins_over_thumbnail_and_surrounding_bytes(self) -> None:
        thumb = _fake_jpeg(160, 120)
        preview = _fake_jpeg(1620, 1080)
        blob = b"II*\x00" + b"\x00" * 50 + thumb + b"\x07" * 300 + preview + b"\xff\xd8\xff garbage tail"
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(Path(tmp), "IMG_0001.CR2", blob)
            self.assertEqual(extract_preview(path), preview)

    def test_stuffed_ff00_and_restart_markers_do_not_end_the_scan_early(self) -> None:
        preview = _fake_jpeg(800, 600, payload=b"\xff\x00\xff\xd0\xab\xff\x00\xcd")
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(Path(tmp), "a.NEF", b"junk" + preview + b"junk")
            self.assertEqual(extract_preview(path), preview)

    def test_no_jpeg_truncated_jpeg_and_tiny_thumbnails_give_none(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertIsNone(extract_preview(self._write(root, "a.dng", b"\x00" * 1000)))
            self.assertIsNone(extract_preview(self._write(root, "b.arw", _fake_jpeg(800, 600)[:-6])))
            self.assertIsNone(extract_preview(self._write(root, "c.cr3", _fake_jpeg(64, 48))))
            self.assertIsNone(extract_preview(self._write(root, "d.orf", b"")))
            self.assertIsNone(extract_preview(root / "missing.raf"))

    def test_raw_extensions(self) -> None:
        self.assertTrue(is_raw_path(Path("x/IMG_1.CR3")))
        self.assertFalse(is_raw_path(Path("x/IMG_1.jpg")))


@unittest.skipUnless(FFMPEG, "ffmpeg is required")
class RawAnalysisTests(unittest.TestCase):
    def _jpeg(self, directory: Path, name: str, graph: str) -> bytes:
        path = directory / name
        subprocess.run(
            [FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", graph,
             "-frames:v", "1", str(path)],
            check=True,
        )
        return path.read_bytes()

    def test_raw_stills_are_scored_from_the_embedded_preview(self) -> None:
        tools = find_ffmpeg_tools()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            thumb = self._jpeg(root, "t.jpg", "testsrc2=size=160x120")
            sharp = self._jpeg(root, "s.jpg", "testsrc2=size=640x360")
            blurred = self._jpeg(root, "b.jpg", "testsrc2=size=640x360,gblur=sigma=12")
            raw_sharp = root / "sharp.CR2"
            raw_sharp.write_bytes(b"II*\x00" + b"\x00" * 64 + thumb + b"\x00" * 128 + sharp + b"\x00" * 64)
            raw_blur = root / "blur.NEF"
            raw_blur.write_bytes(b"MM\x00*" + thumb + blurred)
            sharp_m = analyze_media(tools, raw_sharp, media_type="photo")
            blur_m = analyze_media(tools, raw_blur, media_type="photo")
            self.assertGreater(sharp_m.sharpness, blur_m.sharpness)
            self.assertEqual(len(sharp_m.dhash), 16)

    def test_raw_without_a_preview_raises_so_the_caller_keeps_the_stand_in(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "IMG.CR3"
            path.write_bytes(b"raw-bytes")
            with self.assertRaises(FfmpegMediaError):
                analyze_media(find_ffmpeg_tools(), path, media_type="photo")


def _proxy_action(source: str, output: str) -> ProductionWorkerAction:
    return ProductionWorkerAction(
        job_id="proxy_asset_00000",
        worker_adapter="ffmpeg-proxy-production-local",
        attempt_number=1,
        output_kind="proxy_media",
        inputs=(source,),
        outputs=(output,),
        depends_on=(),
        can_run_in_parallel=True,
    )


class RawProxyTests(unittest.TestCase):
    def test_plan_names_a_raw_proxy_for_the_jpeg_it_holds(self) -> None:
        plan = build_production_plan(
            [MediaAsset(path="originals/IMG_1.CR3", media_type="photo"),
             MediaAsset(path="originals/IMG_2.JPG", media_type="photo")],
            shoot_slug="raw-names",
        )
        proxies = [job.outputs[0] for job in plan.jobs if job.output_kind == "proxy_media"]
        self.assertEqual(proxies, ["proxies/proxy_asset_00000/IMG_1.CR3.jpg", "proxies/proxy_asset_00001/IMG_2.JPG"])

    @unittest.skipUnless(FFMPEG, "ffmpeg is required")
    def test_raw_proxy_is_a_downscaled_jpeg_of_the_embedded_preview(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "originals").mkdir()
            jpg = root / "p.jpg"
            subprocess.run(
                [FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i",
                 "testsrc2=size=2000x1000", "-frames:v", "1", str(jpg)],
                check=True,
            )
            (root / "originals" / "IMG_1.CR3").write_bytes(b"II*\x00" + b"\x00" * 32 + jpg.read_bytes())
            out = "proxies/proxy_asset_00000/IMG_1.CR3.jpg"
            done = _materialize_ffmpeg_proxy_production_outputs(
                _proxy_action("originals/IMG_1.CR3", out), root
            )
            self.assertEqual(done, (out,))
            data = (root / out).read_bytes()
            self.assertEqual(data[:2], b"\xff\xd8")
            probe = subprocess.run(
                [FFMPEG, "-hide_banner", "-i", str(root / out)], capture_output=True, text=True
            ).stderr
            self.assertIn("1024x512", probe)

    @unittest.skipUnless(FFMPEG, "ffmpeg is required")
    def test_raw_without_preview_fails_the_proxy_with_a_clear_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "originals").mkdir()
            (root / "originals" / "IMG_1.NEF").write_bytes(b"no jpeg in here")
            with self.assertRaisesRegex(ProductionAdapterError, "no embedded JPEG preview"):
                _materialize_ffmpeg_proxy_production_outputs(
                    _proxy_action("originals/IMG_1.NEF", "proxies/proxy_asset_00000/IMG_1.NEF.jpg"), root
                )


if __name__ == "__main__":
    unittest.main()
