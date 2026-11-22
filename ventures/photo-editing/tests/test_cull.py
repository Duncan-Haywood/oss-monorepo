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

    def test_raw_jpeg_pair_is_one_shot_with_one_sidecar_and_raw_pick_matches(self) -> None:
        (self.root / "a2.cr2").write_bytes(b"x")
        result = cull_folder(self.root, analyzer=self.analyzer)
        paths = [i.path for i in result.items]
        self.assertEqual(paths.count("a2.jpg"), 1)
        self.assertNotIn("a2.cr2", paths)
        item = next(i for i in result.items if i.path == "a2.jpg")
        self.assertEqual(item.companions, ("a2.cr2",))
        score = score_against_picks(result, ["a2.cr2"])
        self.assertEqual(score.matched, 1)
        self.assertEqual(score.unmatched, ())
        self.assertEqual(len(write_sidecars(result).sidecars_written), 5)

    def test_keeper_margin_and_close_call(self) -> None:
        result = cull_folder(self.root, analyzer=self.analyzer)
        keeper = next(i for i in result.items if i.role == "keeper" and i.group == 1)
        self.assertIsNotNone(keeper.margin)
        self.assertEqual(keeper.close_call, keeper.margin < 0.03)
        lone = next(i for i in result.items if i.path == "c1.jpg")
        self.assertIsNone(lone.margin)
        self.assertFalse(lone.close_call)
        data = json.loads(
            (write_report(result, self.root / "out")[0]).read_text(encoding="utf-8")
        )
        self.assertIn("close_calls", data["summary"])
        self.assertIn("margin", data["items"][0])

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

    def test_close_call_recall_against_picks(self) -> None:
        result = cull_folder(self.root, analyzer=self.analyzer)
        # a1 is the alternate in a2's burst: picking it is a keeper miss with the keeper's margin.
        score = score_against_picks(result, ["a1.jpg", "c1.jpg"])
        self.assertEqual(score.keeper_misses, 1)
        keeper = next(i for i in result.items if i.role == "keeper" and i.group == result.items[0].group)
        self.assertEqual(score.keeper_miss_margins, (keeper.margin,))
        self.assertEqual(score.misses_flagged_close, 0)  # the lead is far over 0.03
        self.assertGreater(score.margin_to_flag_all_misses or 0, keeper.margin)
        _, html_path = write_report(result, self.root / "out2", score)
        self.assertIn("Keeper missed in 1 groups", html_path.read_text())
        self.assertEqual(score_against_picks(result, ["a2.jpg"]).keeper_misses, 0)
        self.assertIsNone(score_against_picks(result, ["a2.jpg"]).margin_to_flag_all_misses)

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


class NearDuplicateGroupingTest(unittest.TestCase):
    def test_groups_match_the_hamming_distance_definition(self):
        import random
        from types import SimpleNamespace

        from shootflow.cull import NEAR_DUPLICATE_MAX_DISTANCE, _group
        from shootflow.frame_analysis import hamming_distance

        rng = random.Random(3)
        bases = [rng.getrandbits(64) for _ in range(5)]
        rows = []
        for n in range(60):
            value = rng.choice(bases)
            for bit in rng.sample(range(64), rng.randint(0, 6)):
                value ^= 1 << bit
            rows.append((Path(f"p{n:03d}.jpg"), SimpleNamespace(dhash=f"{value:016x}"), None))
        groups = _group(rows)
        where = {row[0]: g for g, group in enumerate(groups) for row in group}
        self.assertEqual(sum(len(g) for g in groups), len(rows))
        self.assertLess(len(groups), len(rows))
        for a in rows:
            for b in rows:
                if hamming_distance(a[1].dhash, b[1].dhash) <= NEAR_DUPLICATE_MAX_DISTANCE:
                    self.assertEqual(where[a[0]], where[b[0]])


class BurstMatchTest(unittest.TestCase):
    def test_window_match_is_crop_or_pan_match(self):
        from shootflow.cull import crop_match, pan_match, window_match
        from shootflow.frame_analysis import pan_pack, window_pack

        rng = __import__("random").Random(7)
        for _ in range(400):
            a = tuple(rng.getrandbits(64) for _ in range(25))
            b = tuple(a[rng.randrange(25)] ^ rng.getrandbits(64) & rng.getrandbits(64) & rng.getrandbits(64)
                      for _ in range(25))
            for distance in range(0, 50, 3):
                self.assertEqual(
                    window_match(distance, window_pack(a), window_pack(b)),
                    crop_match(distance, a, b) or pan_match(distance, pan_pack(a), pan_pack(b)),
                )

    def test_a_six_percent_pan_far_apart_on_the_whole_frame_groups(self):
        # 2026-11-18: crop windows within a few bits, whole frames 25-33 apart (past the old gate of 24).
        from shootflow.cull import CROP_CANDIDATE_MAX_DISTANCE, CROP_MAX_DISTANCE, CROP_MIN_GAIN, crop_match

        rng = __import__("random").Random(3)
        a = tuple(rng.getrandbits(64) for _ in range(25))
        b = list(rng.getrandbits(64) for _ in range(25))
        b[0] = a[12] ^ 0b1  # a's centre window one bit from b's top-left window
        self.assertGreaterEqual(CROP_CANDIDATE_MAX_DISTANCE, 33)
        self.assertTrue(crop_match(30, a, b))
        self.assertFalse(crop_match(CROP_CANDIDATE_MAX_DISTANCE + 1, a, b))
        self.assertFalse(crop_match(CROP_MIN_GAIN, a, b))
        self.assertLessEqual(1, CROP_MAX_DISTANCE)

    def test_pan_pass_needs_both_a_close_far_window_and_a_gain(self):
        from shootflow.cull import PAN_CANDIDATE_MAX_DISTANCE, PAN_MAX_DISTANCE, PAN_MIN_GAIN, pan_match
        from shootflow.frame_analysis import _PAN_PAIRS, pan_pack

        rng = __import__("random").Random(5)
        far = tuple(rng.getrandbits(64) for _ in range(25))  # windows about 32 bits from each other
        x, y = _PAN_PAIRS[0]
        near = list(far)
        near[y] = far[x] ^ 0b11  # 2 bits from a's window x at a far offset
        far, near = pan_pack(far), pan_pack(near)
        distance = max(2 + PAN_MIN_GAIN, PAN_MAX_DISTANCE + 1)
        self.assertLessEqual(distance, PAN_CANDIDATE_MAX_DISTANCE)
        self.assertTrue(pan_match(distance, far, near))
        self.assertFalse(pan_match(2 + PAN_MIN_GAIN - 1, far, near))
        self.assertFalse(pan_match(PAN_CANDIDATE_MAX_DISTANCE + 1, far, near))
        self.assertFalse(pan_match(distance, far, ()))

    def test_zoom_pass_needs_both_a_close_window_and_a_gain(self):
        from shootflow.cull import ZOOM_CANDIDATE_MAX_DISTANCE, ZOOM_MIN_GAIN, zoom_match
        from shootflow.frame_analysis import ZOOM_SCALES, ZOOM_STEPS, zoom_index

        n = len(ZOOM_SCALES) * ZOOM_STEPS * ZOOM_STEPS
        a = 0x0123456789ABCDEF
        b = a ^ ((1 << 20) - 1)  # 20 bits apart on the whole frame
        far = zoom_index(tuple((a ^ 0xFFFFFFFF) for _ in range(n)))  # every window 32 bits from a
        near = zoom_index(tuple(a ^ 0xFFFFFFFF for _ in range(n - 1)) + (a ^ 0b111,))  # one window 3 bits from a
        self.assertTrue(zoom_match(20, a, far, b, near))
        self.assertTrue(zoom_match(20, b, near, a, far))
        self.assertFalse(zoom_match(20, a, far, b, far))
        self.assertFalse(zoom_match(3 + ZOOM_MIN_GAIN - 1, a, far, b, near))
        self.assertFalse(zoom_match(ZOOM_CANDIDATE_MAX_DISTANCE + 1, a, far, b, near))
        self.assertFalse(zoom_match(20, a, (), b, near))


class ZoomIndexTest(unittest.TestCase):
    def test_pruned_search_agrees_with_the_full_scan(self):
        import random

        from shootflow.frame_analysis import ZOOM_SCALES, ZOOM_STEPS, zoom_distance, zoom_distance_within, zoom_index

        rng = random.Random(11)
        n = len(ZOOM_SCALES) * ZOOM_STEPS * ZOOM_STEPS
        for _ in range(300):
            base = rng.getrandbits(64)
            frames = []
            for _side in range(2):
                h = base ^ sum(1 << b for b in rng.sample(range(64), rng.randint(0, 30)))
                zooms = tuple(
                    h ^ sum(1 << b for b in rng.sample(range(64), rng.randint(0, 20))) for _ in range(n)
                )
                frames.append((h, zooms))
            (ha, za), (hb, zb) = frames
            exact = zoom_distance(ha, za, hb, zb)
            for limit in range(0, 12):
                pruned = zoom_distance_within(ha, zoom_index(za), hb, zoom_index(zb), limit)
                self.assertEqual(exact <= limit, pruned <= limit)
                if exact <= limit:
                    self.assertEqual(pruned, exact)


class GroupingIndexTest(unittest.TestCase):
    """The candidate index (2026-11-18) must give the all-pairs scan's groups exactly."""

    def _rows(self, seed: int, n: int):
        import random
        from types import SimpleNamespace

        from shootflow.frame_analysis import CROP_STEPS, ZOOM_SCALES, ZOOM_STEPS

        rng = random.Random(seed)

        def flip(value: int, most: int) -> int:
            for bit in rng.sample(range(64), rng.randint(0, most)):
                value ^= 1 << bit
            return value

        crops_n, zooms_n = CROP_STEPS * CROP_STEPS, len(ZOOM_SCALES) * ZOOM_STEPS * ZOOM_STEPS
        bases = []
        for b in range(12):
            whole = rng.getrandbits(64)
            crops = [rng.getrandbits(64) for _ in range(crops_n)]
            # Some bursts whose fine windows repeat a corner crop window, so a
            # fine lane (a fine window against that corner) lines up while the
            # crop lanes stay random.
            fines = [crops[0]] * 24 if b % 4 == 0 else [rng.getrandbits(64) for _ in range(24)]
            bases.append((whole, crops, fines))
        rows = []
        for k in range(n):
            base, crops, fines = rng.choice(bases)
            # Whole frames from near (0-6 bits) to far past the window gate (up
            # to 48), so every pass decides some pairs; zoom windows near the
            # burst's base, so a near frame sits inside a far frame's window.
            whole = flip(base, rng.choice((6, 20, 34, 48)))
            crops = [flip(c, rng.choice((4, 8, 30))) for c in crops]
            zooms = [flip(base, rng.choice((3, 9, 30))) for _ in range(zooms_n)]
            fine = [flip(c, rng.choice((1, 6, 30))) for c in fines]
            if k % 7 == 0:
                crops, zooms, fine = [], [], []  # an old catalogue row: whole frame only
            elif k % 5 == 0:
                fine = []  # analysed before the fine offsets (2026-11-18)
            rows.append((Path(f"p{k:03d}.jpg"), SimpleNamespace(
                dhash=f"{whole:016x}",
                dhash_crops=tuple(f"{c:016x}" for c in crops),
                dhash_zooms=tuple(f"{z:016x}" for z in zooms),
                dhash_fine=tuple(f"{c:016x}" for c in fine),
            ), None))
        return rows

    def test_index_matches_the_all_pairs_scan(self):
        from shootflow.cull import _group

        for seed in range(4):
            rows = self._rows(seed, 150)
            plain = [[r[0] for r in g] for g in _group(rows, index=False)]
            indexed = [[r[0] for r in g] for g in _group(rows, index=True)]
            self.assertEqual(plain, indexed)
            self.assertLess(len(plain), len(rows))
            self.assertGreater(len(plain), 1)

    def test_candidates_cover_every_linked_pair(self):
        from shootflow import cull
        from shootflow.frame_analysis import fine_pack, window_pack, zoom_index

        rows = self._rows(9, 120)
        hashes = [int(r[1].dhash, 16) for r in rows]
        crops = [tuple(int(h, 16) for h in r[1].dhash_crops) for r in rows]
        zoom_hashes = [tuple(int(h, 16) for h in r[1].dhash_zooms) for r in rows]
        zooms = [zoom_index(z) for z in zoom_hashes]
        windows = [window_pack(c) for c in crops]
        fine_hashes = [tuple(int(h, 16) for h in r[1].dhash_fine) for r in rows]
        fines = [fine_pack(c, f) for c, f in zip(crops, fine_hashes)]
        near, win, zoom, fine = cull._candidate_pairs(hashes, crops, zoom_hashes, fine_hashes)
        kinds = {"near": 0, "windows": 0, "zoom": 0, "fine": 0}
        for i in range(len(rows)):
            for j in range(i + 1, len(rows)):
                distance = (hashes[i] ^ hashes[j]).bit_count()
                if distance <= cull.NEAR_DUPLICATE_MAX_DISTANCE:
                    kinds["near"] += 1
                    self.assertIn(j, near[i])
                if cull.window_match(distance, windows[i], windows[j]):
                    kinds["windows"] += 1
                    self.assertIn(j, win[i])
                if cull.zoom_match(distance, hashes[i], zooms[i], hashes[j], zooms[j]):
                    kinds["zoom"] += 1
                    self.assertIn(j, zoom[i])
                if cull.fine_match(distance, fines[i], fines[j]):
                    kinds["fine"] += 1
                    self.assertIn(j, fine[i])
        for kind, count in kinds.items():
            self.assertGreater(count, 0, kind)

    def test_flips_and_chunks(self):
        from shootflow.cull import _chunks, _flips

        self.assertEqual(sum(bits for _s, _m, bits in _chunks(3)), 64)
        self.assertEqual(len(_flips(22, 2)), 1 + 22 + 231)
        self.assertEqual(len(_flips(21, 1)), 22)


if __name__ == "__main__":
    unittest.main()
