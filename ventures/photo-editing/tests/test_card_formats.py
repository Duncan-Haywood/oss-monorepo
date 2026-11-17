"""Every raw format a card holds is copied, and what is not copied is listed (2026-11-16).

Before this, the card copy took only the ten raw formats the developer reads, so a Leica
D-LUX's .RWL, a Coolpix's .NRW, a 10D's .CRW or a Sigma's .X3F stayed on the card unseen,
lost when it was formatted. ``eval/leica-rwl-and-card-formats-2026-11-16.md`` has the
real-file checks (two Leica RWLs read sensel for sensel as LibRaw reads them).
"""

import io
import json
import tempfile
import unittest
from pathlib import Path

from shootflow import catalog, ingest, raw_preview
from shootflow import raw_develop as rd
from shootflow.cli import main
from shootflow.cull import scan_photos

from test_rw2 import make_rw2
from test_arw import make_profile


class CardFormatTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.card = self.root / "card"

    def _put(self, relative: str, data: bytes = b"x") -> Path:
        path = self.card / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def test_raw_lists_agree(self):
        # Cull, catalog and the copy must agree on what a raw is, or a format is copied and then ignored.
        self.assertEqual(raw_preview.RAW_EXTENSIONS, ingest.RAW_PHOTO_EXTENSIONS)
        self.assertLessEqual(ingest.RAW_PHOTO_EXTENSIONS, catalog._PHOTO_EXTENSIONS)
        self.assertLessEqual(ingest.RAW_PHOTO_EXTENSIONS, ingest.MEDIA_EXTENSIONS)
        for suffix in (".rwl", ".nrw", ".crw", ".x3f", ".iiq", ".3fr", ".dcr", ".mrw", ".srf", ".sr2", ".gpr"):
            self.assertIn(suffix, ingest.MEDIA_EXTENSIONS, suffix)
        for suffix in (".mxf", ".m2ts", ".crm", ".insv", ".lrv"):
            self.assertEqual(catalog._infer_media_type(Path("A001" + suffix)), "video", suffix)
        self.assertEqual(catalog._infer_media_type(Path("IMG_0001.HIF")), "photo")
        self.assertIsNone(catalog._infer_media_type(Path("IMG_0001.xmp")))

    def test_copies_every_raw_and_sidecar_and_lists_the_rest(self):
        kept = [
            "DCIM/100LEICA/L1000001.RWL",
            "DCIM/100NIKON/DSCN0001.NRW",
            "DCIM/100CANON/CRW_0001.CRW",
            "DCIM/100CANON/IMG_0002.HIF",
            "DCIM/100CANON/IMG_0002.xmp",
            "DCIM/SDIM0001.X3F",
            "PRIVATE/M4ROOT/CLIP/C0001.MXF",
        ]
        for relative in kept:
            self._put(relative)
        left = ["DCIM/100CANON/VOICE001.AMR", "README.TXT"]
        for relative in left:
            self._put(relative)
        # Card housekeeping and hidden files are neither copied nor reported.
        for relative in ("DCIM/100CANON/CANONMSC/M0100.CTG", "DCIM/100NIKON/NC_FLLST.DAT", ".Spotlight-V100/Store", "._L1000001.RWL"):
            self._put(relative)

        plan = ingest.plan_import(self.card, self.root / "library", shoot_date="2026-11-16", shoot_slug="leica-walk")
        self.assertEqual(sorted(i.relative_path.as_posix() for i in plan.items), sorted(kept, key=str.lower))
        self.assertEqual([p.as_posix() for p in plan.left_on_card], left)

        out, err = io.StringIO(), io.StringIO()
        code = main(
            ["preview-ingest", "--source", str(self.card), "--destination", str(self.root / "library"),
             "--shoot-date", "2026-11-16", "--shoot-slug", "leica-walk"],
            stdout=out, stderr=err,
        )
        self.assertEqual(code, 0, err.getvalue())
        self.assertEqual(json.loads(out.getvalue())["left_on_card"], left)

        report = ingest.execute_copy_plan(plan)
        self.assertEqual(report.copied, len(kept))
        manifest = json.loads(report.manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["left_on_card"], left)
        # The catalog still loads, with the sidecar copied but not catalogued as media.
        shoot = catalog.load_ingest_manifest(report.manifest_path)
        self.assertEqual(len(shoot.assets), len(kept) - 1)

    def test_rwl_is_read_as_rw2_and_develops(self):
        data, _ = make_rw2()
        src = self.root / "L1000001.RWL"
        src.write_bytes(data)
        self.assertTrue(raw_preview.is_rw2_path(src))
        self.assertTrue(raw_preview.is_developable_path(src))
        self.assertTrue(raw_preview.needs_profile_path(src))
        profiles = self.root / "profiles"
        profiles.mkdir()
        (profiles / "Panasonic DMC-GF7 Adobe Standard.dcp").write_bytes(make_profile("Panasonic DMC-GF7"))
        out, err = io.StringIO(), io.StringIO()
        code = main(["develop", str(src), "--out", str(self.root / "m"), "--dcp", str(profiles)], stdout=out, stderr=err)
        self.assertEqual(code, 0, err.getvalue())
        self.assertTrue((self.root / "m" / "L1000001.tif").exists())

    def test_profile_name_in_other_capitals_is_not_a_mismatch(self):
        # Leica writes 'LEICA D-LUX (Typ 109)'; Adobe's profile says 'Leica D-LUX (Typ 109)'.
        raw = rd.parse_raw(make_rw2()[0])

        def mismatch_notes(camera):
            path = self.root / f"{camera}.dcp"
            path.write_bytes(make_profile(camera))
            *_, report = rd.develop(raw, rd.DevelopSettings(engine="python", dcp=rd.read_dcp(path)))
            return [n for n in report.notes if n.startswith("camera profile is for")]

        self.assertEqual(mismatch_notes("PANASONIC  dmc-gf7"), [])
        self.assertEqual(len(mismatch_notes("Panasonic DMC-GF3")), 1)

    def test_cull_scans_the_new_raw_formats(self):
        folder = self.root / "picks"
        folder.mkdir()
        for name in ("L1000001.RWL", "CRW_0001.CRW", "SDIM0001.X3F", "notes.txt"):
            (folder / name).write_bytes(b"x")
        self.assertEqual([p.name for p in scan_photos(folder)], ["CRW_0001.CRW", "L1000001.RWL", "SDIM0001.X3F"])


if __name__ == "__main__":
    unittest.main()
