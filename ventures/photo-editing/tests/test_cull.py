import io
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from shootflow.cli import main
from shootflow.cull import thumbnail_data_uris
from shootflow.cull import CullError, cull_folder, read_picks, score_against_picks, write_report, write_sidecars
from shootflow.frame_analysis import FrameMetrics
from shootflow.faces import FaceReport


def _metrics(dhash: str, sharpness: float = 0.8, exposure: float = 0.8) -> FrameMetrics:
    return FrameMetrics(
        sharpness=sharpness, exposure=exposure, contrast=0.5, motion=0.0, framing=0.5,
        subject_x=0.5, subject_y=0.5, mean_luma=128.0, clipped_shadows=0.0, clipped_highlights=0.0,
        dhash=dhash, tilt_degrees=0.0, tilt_confidence=0.0, noise_sigma=1.0, frames_sampled=1,
        duration_seconds=None,
    )


class CullTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for name in ("a1.jpg", "a2.jpg", "a3.jpg", "b1.jpg", "c1.jpg", "notes.txt"):
            (self.root / name).write_bytes(b"x")
        table = {
            "a1.jpg": (_metrics("0" * 16, sharpness=0.5), None),
            "a2.jpg": (_metrics("0" * 15 + "1", sharpness=0.9), None),
            "a3.jpg": (_metrics("0" * 15 + "3", sharpness=0.9), FaceReport(1, 1, 0.1)),
            "b1.jpg": (_metrics("f" * 16, sharpness=0.05), None),
            "c1.jpg": (_metrics("0f" * 8), None),
        }
        self.analyzer = lambda path: table[path.name]

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_picks_sharpest_keeper_and_flags_rejects(self) -> None:
        result = cull_folder(self.root, analyzer=self.analyzer)
        roles = {i.path: i.role for i in result.items}
        self.assertEqual(roles["a2.jpg"], "keeper")
        self.assertEqual(roles["a1.jpg"], "alternate")
        self.assertEqual(roles["a3.jpg"], "reject")  # closed eyes
        self.assertEqual(roles["b1.jpg"], "reject")  # blurry
        self.assertEqual(roles["c1.jpg"], "keeper")
        self.assertEqual(result.group_count, 3)
        self.assertEqual(next(i for i in result.items if i.path == "b1.jpg").reasons, ("blurry",))

    def test_sidecars_never_overwrite_and_photos_untouched(self) -> None:
        (self.root / "a1.xmp").write_text("mine")
        result = write_sidecars(cull_folder(self.root, analyzer=self.analyzer))
        self.assertEqual((self.root / "a1.xmp").read_text(), "mine")
        self.assertIn("a1.xmp", result.sidecars_skipped)
        self.assertIn('xmp:Rating="4"', (self.root / "a2.xmp").read_text())
        self.assertIn('xmp:Rating="-1"', (self.root / "b1.xmp").read_text())
        self.assertEqual((self.root / "a2.jpg").read_bytes(), b"x")

    def test_report_files_and_empty_folder(self) -> None:
        result = cull_folder(self.root, analyzer=self.analyzer)
        out = self.root / "out"
        json_path, html_path = write_report(result, out)
        self.assertEqual(json.loads(json_path.read_text())["summary"]["keepers"], 2)
        self.assertIn("Cull report", html_path.read_text())
        with tempfile.TemporaryDirectory() as empty, self.assertRaises(CullError):
            cull_folder(empty, analyzer=self.analyzer)

    def test_scores_against_photographer_picks(self) -> None:
        result = cull_folder(self.root, analyzer=self.analyzer)
        # a2 is the keeper; the photographer also wanted a3 (rejected: closed eyes) and b1 (blurry),
        # named by stem, with different case, and one name that is not in the folder.
        score = score_against_picks(result, ["A2.JPG", "a3", "./b1.jpg", "missing.jpg"])
        self.assertEqual((score.picks, score.matched), (4, 3))
        self.assertEqual(score.unmatched, ("missing.jpg",))
        self.assertEqual(score.groups_with_a_pick, 2)
        self.assertEqual(score.keeper_hits, 1)  # group of a2 yes; b1's group keeper is none (all rejects)
        self.assertEqual(score.picks_rejected, ("a3.jpg", "b1.jpg"))
        self.assertAlmostEqual(score.false_reject_rate or 0, 2 / 3)
        self.assertEqual(dict(score.reject_reasons), {"blurry": 1, "closed eyes": 1})

    def test_picks_file_and_report(self) -> None:
        picks = self.root / "picks.txt"
        picks.write_text("# keepers\n\na2.jpg\nc1.jpg\n", encoding="utf-8")
        result = cull_folder(self.root, analyzer=self.analyzer)
        score = score_against_picks(result, read_picks(picks))
        self.assertEqual(score.keeper_hit_rate, 1.0)
        self.assertEqual(score.false_reject_rate, 0.0)
        json_path, html_path = write_report(result, self.root / "out", score)
        self.assertEqual(json.loads(json_path.read_text())["against_your_picks"]["keeper_hits"], 2)
        self.assertIn("Against your picks", html_path.read_text())

    def test_ambiguous_names_do_not_match(self) -> None:
        (self.root / "sub").mkdir()
        (self.root / "sub" / "a2.jpg").write_bytes(b"x")
        table = {"a2.jpg": (_metrics("0" * 16), None)}
        result = cull_folder(self.root, recursive=True, analyzer=lambda p: table.get(p.name, self.analyzer(p)))
        self.assertEqual(score_against_picks(result, ["a2.jpg"]).matched, 1)  # top-level path wins
        self.assertEqual(score_against_picks(result, ["a2"]).matched, 0)  # stem is ambiguous

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
    def test_cli_on_real_jpegs(self) -> None:
        shoot = self.root / "shoot"
        shoot.mkdir()
        for name, filt in (("sharp.jpg", "testsrc=size=320x180"), ("blur.jpg", "testsrc=size=320x180,boxblur=12")):
            subprocess.run(
                ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", filt, "-frames:v", "1",
                 str(shoot / name)],
                check=True,
            )
        out = io.StringIO()
        code = main(["cull", str(shoot), "--out", str(self.root / "rep")], stdout=out)
        self.assertEqual(code, 0)
        report = json.loads((self.root / "rep" / "cull_report.json").read_text())
        self.assertEqual(report["summary"]["photos"], 2)
        self.assertEqual(report["summary"]["unreadable"], 0)


class ThumbnailTests(CullTests):
    def test_contact_sheet_embeds_thumbnails_and_survives_a_failure(self) -> None:
        from shootflow.ffmpeg_media import FfmpegMediaError

        result = cull_folder(self.root, analyzer=self.analyzer)

        def maker(path: Path) -> bytes:
            if path.name == "c1.jpg":
                raise FfmpegMediaError("no")
            return b"\xff\xd8jpeg"

        uris = thumbnail_data_uris(result, maker=maker)
        self.assertNotIn("c1.jpg", uris)
        self.assertTrue(uris["a2.jpg"].startswith("data:image/jpeg;base64,"))
        _, html_path = write_report(result, self.root / "out", thumbs=uris)
        page = html_path.read_text(encoding="utf-8")
        self.assertIn('<figure class="keeper">', page)
        self.assertIn("(no preview)", page)
        self.assertIn("Contact sheet", page)

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
    def test_real_ffmpeg_thumbnail(self) -> None:
        src = self.root / "real.jpg"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x480", "-frames:v", "1", str(src)],
            check=True,
        )
        from shootflow.cull import make_thumbnail
        from shootflow.ffmpeg_media import find_ffmpeg_tools

        data = make_thumbnail(find_ffmpeg_tools(), src)
        self.assertEqual(data[:2], b"\xff\xd8")
        self.assertLess(len(data), 40000)


if __name__ == "__main__":
    unittest.main()
