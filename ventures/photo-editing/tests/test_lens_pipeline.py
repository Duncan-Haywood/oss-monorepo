"""Lens correction in the pipeline's grade stage, from the workspace's ``color/lens-profiles/``.

With lensfun XML files in that folder, every DNG and CR2 the grade stage develops is corrected
as ``shootflow develop --lens-db`` would correct it, and a ``<master>.lens.json`` note beside
the master says which lens was used or why none was. The pipeline tests take a synthetic CR2
(``test_cr2``) with lens name, focal length and f-number tags through ingest, proxy, analysis
and grade, and compare the master with ``shootflow develop`` on the same file, profile and
database. The database is a small XML with made-up numbers (no lensfun data is vendored).
"""

from __future__ import annotations

import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from shootflow import production_adapter as pa
from shootflow.camera_profiles import CAMERA_PROFILES_DIR
from shootflow.cli import main
from shootflow.lens_profiles import LENS_PROFILES_DIR
from shootflow.local_pipeline import run_local_pipeline
from shootflow.raw_develop import DevelopError
from test_camera_profiles import CAMERA, FFMPEG, FFPROBE, _rgb48, profile_bytes
from test_cr2 import make_cr2

LENS = "Canon EF 50mm f/1.2L USM"
XML = f"""<lensdatabase version="2">
  <mount><name>Canon EF</name></mount>
  <camera><maker>Canon</maker><model>{CAMERA}</model><mount>Canon EF</mount><cropfactor>1.0</cropfactor></camera>
  <lens>
    <maker>Canon</maker><model>{LENS}</model><mount>Canon EF</mount><cropfactor>1.0</cropfactor>
    <calibration>
      <distortion model="ptlens" focal="50" a="0.012" b="-0.04" c="0.02"/>
      <vignetting model="pa" focal="50" aperture="1.2" distance="1000" k1="-0.6" k2="0.2" k3="-0.05"/>
    </calibration>
  </lens>
</lensdatabase>
"""


def write_db(folder: Path, xml: str = XML) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "canon.xml").write_text(xml)


class WorkspaceLensDbTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root)
        pa._LENS_DB_CACHE.clear()

    def test_no_folder_or_no_xml_means_no_database(self):
        self.assertIsNone(pa._workspace_lens_db(self.root))
        (self.root / LENS_PROFILES_DIR).mkdir(parents=True)
        (self.root / LENS_PROFILES_DIR / "README.txt").write_text("put lensfun xml here")
        self.assertIsNone(pa._workspace_lens_db(self.root))

    def test_read_once_and_again_when_a_file_changes(self):
        write_db(self.root / LENS_PROFILES_DIR)
        first = pa._workspace_lens_db(self.root)
        self.assertEqual([lens.name for lens in first.lenses], [LENS])
        self.assertIs(pa._workspace_lens_db(self.root), first)
        path = self.root / LENS_PROFILES_DIR / "canon.xml"
        path.write_text(XML.replace("50mm f/1.2L", "85mm f/1.2L"))
        st = path.stat()
        os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))
        again = pa._workspace_lens_db(self.root)
        self.assertIsNot(again, first)
        self.assertEqual([lens.name for lens in again.lenses], ["Canon EF 85mm f/1.2L USM"])

    def test_symlinked_folder_refused_and_symlinked_file_skipped(self):
        elsewhere = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, elsewhere)
        write_db(elsewhere)
        (self.root / "color").mkdir()
        (self.root / LENS_PROFILES_DIR).symlink_to(elsewhere, target_is_directory=True)
        with self.assertRaisesRegex(DevelopError, "symlink"):
            pa._workspace_lens_db(self.root)
        (self.root / LENS_PROFILES_DIR).unlink()
        (self.root / LENS_PROFILES_DIR).mkdir()
        (self.root / LENS_PROFILES_DIR / "canon.xml").symlink_to(elsewhere / "canon.xml")
        self.assertIsNone(pa._workspace_lens_db(self.root))

    def test_unreadable_xml_names_the_folder(self):
        write_db(self.root / LENS_PROFILES_DIR, "<lensdatabase>")
        with self.assertRaisesRegex(DevelopError, "color/lens-profiles: canon.xml: not readable XML"):
            pa._workspace_lens_db(self.root)


@unittest.skipUnless(FFMPEG and FFPROBE, "ffmpeg and ffprobe are required for media tests")
class PipelineLensTests(unittest.TestCase):
    def shoot(self, tmp: Path, *, xml: str | None = XML, lens_name: str = "EF50mm f/1.2L USM"):
        from test_ffmpeg_pipeline import _ingested_shoot, _make_photo

        pa._LENS_DB_CACHE.clear()
        preview = tmp / "preview.jpg"
        _make_photo(preview, color="green")
        cr2 = make_cr2(lens_name=lens_name, focal=50, fnumber=1.2)[0] + preview.read_bytes()
        manifest = _ingested_shoot(tmp / "shoot", extra_files={"IMG_0003.CR2": cr2})
        workspace = manifest.parent
        (workspace / CAMERA_PROFILES_DIR).mkdir(parents=True)
        (workspace / CAMERA_PROFILES_DIR / f"{CAMERA} Adobe Standard.dcp").write_bytes(profile_bytes())
        if xml is not None:
            write_db(workspace / LENS_PROFILES_DIR, xml)
        src = tmp / "IMG_0003.CR2"
        src.write_bytes(cr2)
        (tmp / "p.dcp").write_bytes(profile_bytes())
        return manifest, src

    def develop(self, tmp: Path, src: Path, out: str, *extra: str) -> Path:
        code = main(["develop", str(src), "--out", str(tmp / out), "--dcp", str(tmp / "p.dcp"), *extra],
                    stdout=io.StringIO(), stderr=io.StringIO())
        self.assertEqual(code, 0)
        return tmp / out / "IMG_0003.tif"

    def test_cr2_master_is_lens_corrected_with_a_note(self):
        from test_ffmpeg_pipeline import _hidden_temp_files, _ticking_clock

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            manifest, src = self.shoot(tmp)
            workspace = manifest.parent

            result = run_local_pipeline(manifest, max_concurrency=3, clock=_ticking_clock())

            self.assertTrue(result.rendered, result)
            master = next((workspace / "graded").glob("*/IMG_0003.CR2.tif"))
            corrected = self.develop(tmp, src, "lens", "--lens-db", str(workspace / LENS_PROFILES_DIR))
            plain = self.develop(tmp, src, "plain")
            self.assertEqual(_rgb48(master), _rgb48(corrected))
            self.assertNotEqual(_rgb48(master), _rgb48(plain))
            note = json.loads(Path(str(master) + ".lens.json").read_text())
            self.assertEqual(note["kind"], "lens_correction")
            self.assertTrue(note["corrected"])
            self.assertEqual(note["lens"], LENS)
            self.assertEqual(note["graded_output"], str(master.relative_to(workspace)))
            self.assertTrue(any("vignetting from lensfun at 50 mm f/1.2" in n for n in note["notes"]), note)
            # the JPEGs and videos are not raws: no notes beside them
            self.assertEqual(sorted(p.name for p in (workspace / "graded").rglob("*.lens.json")), ["IMG_0003.CR2.tif.lens.json"])
            self.assertEqual(_hidden_temp_files(workspace), [])

    def test_lens_not_in_the_database_is_graded_uncorrected_and_says_why(self):
        from test_ffmpeg_pipeline import _ticking_clock

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            manifest, src = self.shoot(tmp, lens_name="EF135mm f/2L USM")
            workspace = manifest.parent

            result = run_local_pipeline(manifest, clock=_ticking_clock())

            self.assertTrue(result.rendered, result)
            master = next((workspace / "graded").glob("*/IMG_0003.CR2.tif"))
            self.assertEqual(_rgb48(master), _rgb48(self.develop(tmp, src, "plain")))
            note = json.loads(Path(str(master) + ".lens.json").read_text())
            self.assertFalse(note["corrected"])
            self.assertIsNone(note["lens"])
            self.assertTrue(any("no lens in the database matches 'EF135mm f/2L USM'" in n for n in note["notes"]), note)

    def test_without_the_folder_nothing_changes(self):
        from test_ffmpeg_pipeline import _ticking_clock

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            manifest, src = self.shoot(tmp, xml=None)
            workspace = manifest.parent

            result = run_local_pipeline(manifest, clock=_ticking_clock())

            self.assertTrue(result.rendered, result)
            master = next((workspace / "graded").glob("*/IMG_0003.CR2.tif"))
            self.assertEqual(_rgb48(master), _rgb48(self.develop(tmp, src, "plain")))
            self.assertEqual(list((workspace / "graded").rglob("*.lens.json")), [])

    def test_unreadable_database_stops_the_grade_for_review(self):
        from test_ffmpeg_pipeline import _ticking_clock

        with tempfile.TemporaryDirectory() as tmp:
            manifest, _ = self.shoot(Path(tmp), xml="<lensdatabase>")

            result = run_local_pipeline(manifest, clock=_ticking_clock())

            self.assertFalse(result.rendered)
            status = json.loads((manifest.parent / "production_status.json").read_text())
            messages = [job["error_message"] for job in status["job_statuses"] if job.get("error_message")]
            self.assertTrue(any("color/lens-profiles: canon.xml: not readable XML" in m for m in messages), messages)


if __name__ == "__main__":
    unittest.main()
