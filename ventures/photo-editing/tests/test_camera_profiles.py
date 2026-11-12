"""A camera profile chosen per CR2 from a folder, in ``shootflow develop`` and the pipeline's grade stage.

The rules (``shootflow.camera_profiles``): a file named for the camera wins,
then the one profile tagged for it, then Adobe Standard among several, else a
refusal naming the candidates. The pipeline tests take a synthetic CR2 (from
``test_cr2``) with an embedded preview through ingest, proxy, analysis and
grade, and check the graded master is the same pixels ``shootflow develop``
writes from the same profile.
"""

from __future__ import annotations

import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import raw_develop as rd
from shootflow.camera_profiles import CAMERA_PROFILES_DIR, camera_of, choose_profile
from shootflow.cli import main
from shootflow.local_pipeline import run_local_pipeline
from test_cr2 import BOTTOM, LEFT, RIGHT, TOP, make_cr2
from test_dng_profile_tables import make_dcp

CAMERA = "Canon EOS 5D Mark II"
FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")


def profile_bytes(camera: str | None = CAMERA, name: str | None = None, scale: float = 1.0) -> bytes:
    """A DCP whose matrix is XYZ->linear sRGB times ``scale`` (so profiles can be told apart by output)."""

    m = rd._inverse3(rd._XYZ_TO_SRGB_D65)
    flat = tuple(m[r][c] * scale for r in range(3) for c in range(3))
    entries = [(50721, 10, flat), (50778, 3, (21,))]
    if camera is not None:
        entries.append((50708, 2, tuple(camera.encode() + b"\0")))
    if name is not None:
        entries.append((50936, 2, tuple(name.encode() + b"\0")))
    return make_dcp(sorted(entries))


class ChooseTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def write(self, name, blob):
        (self.dir / name).write_bytes(blob)

    def test_one_tagged_profile(self):
        self.write("whatever.dcp", profile_bytes())
        self.write("other.dcp", profile_bytes("Canon EOS 7D"))
        choice = choose_profile(self.dir, CAMERA)
        self.assertEqual((choice.path.name, choice.rule), ("whatever.dcp", "profile tag"))

    def test_file_named_for_the_camera_wins(self):
        self.write("a.dcp", profile_bytes())
        self.write("canon eos  5d mark ii.DCP", profile_bytes("Canon EOS Rebel T3i"))  # renamed regional profile
        choice = choose_profile(self.dir, CAMERA)
        self.assertEqual((choice.path.name, choice.rule), ("canon eos  5d mark ii.DCP", "file name"))

    def test_adobe_standard_among_several(self):
        self.write("x1.dcp", profile_bytes(name="Camera Faithful"))
        self.write("x2.dcp", profile_bytes(name="Adobe Standard"))
        self.write(f"{CAMERA} Camera Landscape.dcp", profile_bytes(name="Camera Landscape"))
        choice = choose_profile(self.dir, CAMERA)
        self.assertEqual((choice.path.name, choice.rule), ("x2.dcp", "Adobe Standard"))

    def test_several_without_a_default_are_refused(self):
        self.write("x1.dcp", profile_bytes(name="Camera Faithful"))
        self.write("x2.dcp", profile_bytes(name="Camera Neutral"))
        with self.assertRaisesRegex(rd.DevelopError, r"2 profiles .* \(x1.dcp, x2.dcp\); keep one"):
            choose_profile(self.dir, CAMERA)

    def test_none_for_the_camera_names_what_is_there(self):
        self.write("seven.dcp", profile_bytes("Canon EOS 7D"))
        self.write("notes.dcp", b"not a profile")
        self.write("readme.txt", b"hello")
        (self.dir / "linked.dcp").symlink_to(self.dir.parent / "nowhere.dcp")
        with self.assertRaisesRegex(rd.DevelopError, r"no camera profile for 'Canon EOS 5D Mark II'.*Canon EOS 7D\)"):
            choose_profile(self.dir, CAMERA)

    def test_symlinked_profile_is_ignored(self):
        real = self.dir.parent / f"{self.dir.name}-real.dcp"
        real.write_bytes(profile_bytes())
        self.addCleanup(real.unlink)
        (self.dir / f"{CAMERA}.dcp").symlink_to(real)
        with self.assertRaisesRegex(rd.DevelopError, "no camera profile"):
            choose_profile(self.dir, CAMERA)

    def test_missing_folder(self):
        with self.assertRaisesRegex(rd.DevelopError, "no camera profile"):
            choose_profile(self.dir / "absent", CAMERA)

    def test_camera_of_a_cr2(self):
        src = self.dir / "IMG_0001.CR2"
        src.write_bytes(make_cr2()[0])
        self.assertEqual(camera_of(src), CAMERA)
        nef = self.dir / "IMG_0002.NEF"
        nef.write_bytes(b"II*\0" + b"\0" * 32)
        with self.assertRaisesRegex(rd.DevelopError, "CR2 files only"):
            camera_of(nef)


class CliTests(unittest.TestCase):
    def test_develop_with_a_profile_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            profiles = tmp / "profiles"
            profiles.mkdir()
            (profiles / "five.dcp").write_bytes(profile_bytes())
            (profiles / "seven.dcp").write_bytes(profile_bytes("Canon EOS 7D", scale=0.5))
            src = tmp / "IMG_0001.CR2"
            src.write_bytes(make_cr2()[0])
            single = tmp / "single.dcp"
            single.write_bytes(profile_bytes())
            out, err = io.StringIO(), io.StringIO()
            code = main(["develop", str(src), "--out", str(tmp / "a"), "--dcp", str(profiles), "--half"], stdout=out, stderr=err)
            self.assertEqual(code, 0, err.getvalue())
            result = json.loads(out.getvalue())["developed"][0]
            self.assertEqual(Path(result["camera_profile"]).name, "five.dcp")
            self.assertEqual(result["camera_profile_rule"], "profile tag")
            code = main(["develop", str(src), "--out", str(tmp / "b"), "--dcp", str(single), "--half"], stdout=io.StringIO(), stderr=err)
            self.assertEqual(code, 0, err.getvalue())
            # The folder's pick gives the same master as passing that profile alone.
            self.assertEqual((tmp / "a" / "IMG_0001.tif").read_bytes(), (tmp / "b" / "IMG_0001.tif").read_bytes())

    def test_folder_with_no_profile_for_the_camera(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "profiles").mkdir()
            src = tmp / "IMG_0001.CR2"
            src.write_bytes(make_cr2()[0])
            err = io.StringIO()
            code = main(["develop", str(src), "--out", str(tmp / "a"), "--dcp", str(tmp / "profiles")], stdout=io.StringIO(), stderr=err)
            self.assertNotEqual(code, 0)
            self.assertIn("no camera profile for 'Canon EOS 5D Mark II'", err.getvalue())


def _rgb48(path: Path) -> bytes:
    return subprocess.run(
        [FFMPEG or "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(path),
         "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb48le", "-"],
        check=True,
        capture_output=True,
    ).stdout


@unittest.skipUnless(FFMPEG and FFPROBE, "ffmpeg and ffprobe are required for media tests")
class PipelineTests(unittest.TestCase):
    def shoot(self, tmp: Path, profile: bytes | None):
        from test_ffmpeg_pipeline import _ingested_shoot, _make_photo

        preview = tmp / "preview.jpg"
        _make_photo(preview, color="green")
        cr2 = make_cr2()[0] + preview.read_bytes()  # the camera's embedded JPEG, after the sensor stream
        manifest = _ingested_shoot(tmp / "shoot", extra_files={"IMG_0003.CR2": cr2})
        if profile is not None:
            folder = manifest.parent / CAMERA_PROFILES_DIR
            folder.mkdir(parents=True)
            (folder / f"{CAMERA} Adobe Standard.dcp").write_bytes(profile)
        return manifest, cr2

    def test_cr2_is_developed_into_a_16_bit_graded_master_with_its_camera_profile(self):
        from test_ffmpeg_pipeline import _hidden_temp_files, _probe, _ticking_clock

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            manifest, cr2 = self.shoot(tmp, profile_bytes())
            workspace = manifest.parent

            result = run_local_pipeline(manifest, max_concurrency=3, clock=_ticking_clock())

            self.assertTrue(result.rendered, result)
            self.assertEqual(result.needs_review_ids, ())
            master_path = next((workspace / "graded").glob("*/IMG_0003.CR2.tif"))
            master = _probe(master_path)
            self.assertEqual((master["width"], master["height"]), (RIGHT - LEFT, BOTTOM - TOP))
            self.assertEqual(master["pix_fmt"], "rgb48le")
            # Same pixels as `shootflow develop --dcp` on the same file and profile.
            src = tmp / "IMG_0003.CR2"
            src.write_bytes(cr2)
            profile = tmp / "p.dcp"
            profile.write_bytes(profile_bytes())
            code = main(["develop", str(src), "--out", str(tmp / "dev"), "--dcp", str(profile)], stdout=io.StringIO(), stderr=io.StringIO())
            self.assertEqual(code, 0)
            self.assertEqual(_rgb48(master_path), _rgb48(tmp / "dev" / "IMG_0003.tif"))
            self.assertEqual(_hidden_temp_files(workspace), [])

    def test_cr2_without_a_profile_stops_at_grade_naming_the_folder(self):
        from test_ffmpeg_pipeline import _ticking_clock

        with tempfile.TemporaryDirectory() as tmp:
            manifest, _ = self.shoot(Path(tmp), None)

            result = run_local_pipeline(manifest, clock=_ticking_clock())

            self.assertFalse(result.rendered)
            self.assertTrue(any(job_id.startswith("grade_asset_") for job_id in result.needs_review_ids), result)
            status = json.loads((manifest.parent / "production_status.json").read_text())
            messages = [job["error_message"] for job in status["job_statuses"] if job.get("error_message")]
            self.assertTrue(any("no camera profile for 'Canon EOS 5D Mark II'" in m and "camera-profiles" in m for m in messages), messages)


if __name__ == "__main__":
    unittest.main()
