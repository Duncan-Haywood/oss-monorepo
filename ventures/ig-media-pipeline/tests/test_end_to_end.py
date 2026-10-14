"""The real stages, end to end, against a synthetic library that must come out byte-identical.

`igmp run` goes through cli.main exactly as on the Mac: plan, backup manifest, then scan, geo,
prefilter (in worker processes), score, curate, edit, reels and the metadata refresh, with
safety's tripwire up, then verify-library. The only files the library may gain are XMP sidecars
beside originals; everything else must come out byte-identical. Claude is a fake that answers every question by its schema. RawTherapee
is a stand-in that also tries to drop a .pp3 beside its input. Reels use real ffmpeg when it
is installed.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image
from pydantic import ValidationError

from igmp import cli, judge, rawedit, safety
from igmp.config import Config
from igmp.judge import JudgeError
from igmp.models import Critique, Curation, EditParams, EditReview, Point, ReelPlan, Score, Shot

HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
STRAY = (".pp3", "_original", ".xmp.tmp", ".csv.tmp", ".tmp")


def texture(seed: int, w: int = 1200, h: int = 800) -> Image.Image:
    rng = np.random.default_rng(seed)
    base = rng.random((h // 8, w // 8, 3)) * 160 + 40
    img = Image.fromarray(base.astype(np.uint8)).resize((w, h), Image.Resampling.BICUBIC)
    return Image.fromarray(np.clip(np.asarray(img, dtype=float) + rng.normal(0, 12, (h, w, 3)), 0, 255).astype(np.uint8))


def build_library(root: Path) -> Path:
    lib = root / "PhotoDrive" / "2026"
    lib.mkdir(parents=True)
    for i in range(5):
        stem = f"2026-10-10_1700{i}0_Harbor_Party_A7RV_DSC0000{i}"
        texture(i).save(lib / f"{stem}.JPG", quality=88)
        (lib / f"{stem}.ARW").write_bytes(b"SONY-ARW" + bytes([i]) * 50_000)
    (lib / "_rename-log.csv").write_text("old,new\n")
    (lib / ".DS_Store").write_bytes(b"finder state")
    insta = lib / "Insta360"
    insta.mkdir()
    dual = Image.new("RGB", (1600, 800))
    dual.paste(texture(9, 800, 800), (0, 0))
    dual.paste(texture(10, 800, 800), (800, 0))
    dual.save(insta / "IMG_20261010_170500_00_001.insp", "JPEG", quality=88)
    (insta / "IMG_20261010_170500_00_001.dng").write_bytes(b"DNG" * 1000)
    (insta / "_index.csv").write_text("file,local_date,local_time,location,event\n"
                                      "IMG_20261010_170500_00_001.insp,2026-10-10,17:05:00,Harbor,Party\n")
    if HAS_FFMPEG:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=4",
                        "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast",
                        str(lib / "2026-10-10_170600_Harbor_Party_Pocket3_DJI-0001.MP4")], check=True, capture_output=True)
    return lib


def unchanged(before: dict, after: dict) -> bool:
    """Every file in `before` is in `after` with the same bytes, mtime and mode, and every folder
    still exists (a folder's own mtime moves when a sidecar is added to it)."""
    return all(after.get(k) == v if v[0] == "file" else k in after for k, v in before.items())


class FakeClaude:
    """Answers by schema and checks it is only ever shown igmp's own files, never an original."""

    def __init__(self, lib: Path, out: Path):
        self.lib, self.out = lib.resolve(), out.resolve()
        self.calls: Counter[str] = Counter()

    def answer(self, task) -> dict:
        o = task.output
        if o is Score:
            return dict(score=8, keep=True, role="moment", subject="harbor", mood="warm",
                        vertical_focus=Point(x=0.5, y=0.5), feed_focus=Point(x=0.5, y=0.5))
        if o is Curation:
            return dict(drop=[], notes="varied")
        if o is EditParams:
            return dict(exposure_ev=0.2, vibrance=8)
        if o is EditReview:
            return dict(better_than_camera=True, exposure_ok=True, color_ok=True, crop_ok=True, notes="", verdict="ship")
        if o is ReelPlan:
            ids = re.findall(r"id=(\w+)", task.instructions)
            return dict(event_key=task.key, title="Harbor", cover_asset_id=ids[0], caption="Harbor at dusk",
                        shots=[Shot(asset_id=i, duration_s=1.0) for i in ids[:6]])
        if o is Critique:
            return dict(hook_ok=True, all_sharp=True, no_redundancy=True, crops_safe=True, pacing_ok=True,
                        ending_ok=True, score=8, notes="", verdict="ship")
        return {}

    def judge(self, task):
        self.calls[task.output.__name__] += 1
        for p in task.images:
            p = Path(p).resolve()
            assert self.out in p.parents and self.lib not in p.parents, p
        try:
            return task.output.model_validate(self.answer(task))
        except ValidationError as e:          # a schema this fake doesn't know: the stage records it
            raise JudgeError(f"{task.key}: fake has no answer: {e}") from e

    def judge_many(self, tasks):
        out = {}
        for t in tasks:
            try:
                out[t.key] = self.judge(t)
            except JudgeError as e:
                out[t.key] = e
        return out


def test_a_full_run_leaves_the_library_byte_identical(tmp_path, monkeypatch, fake_rawtherapee, library_tree):
    lib = build_library(tmp_path)
    out = tmp_path / "igmp-output"
    settings = tmp_path / "config.toml"
    settings.write_text(f'library_roots = ["{lib}"]\noutput_dir = "{out}"\nbackend = "api"\nmusic = "none"\n'
                        f'rawtherapee_cli = "{fake_rawtherapee}"\nparallel = 2\n')
    claude = FakeClaude(lib, out)
    monkeypatch.setattr(judge, "backend", lambda cfg: claude)
    pristine = library_tree(lib)
    assert cli.main(["plan", "--config", str(settings)]) == 0
    assert library_tree(lib) == pristine and not out.exists()
    assert cli.main(["backup", "manifest", "--config", str(settings)]) == 0     # writes <root>/_checksums.csv
    before = library_tree(lib)

    start = len(safety._violations)
    assert cli.main(["run", "--config", str(settings)]) == 0
    assert safety._violations[start:] == []

    # the library: every file that was there is byte-identical (bytes, mtime, mode); the only new
    # files are XMP sidecars, one beside each original; no ._*, .pp3, *_original or temp files
    after = library_tree(lib)
    assert unchanged(before, after)
    added = sorted(set(after) - set(before))
    assert added and all(n.endswith(".xmp") and safety.sidecar_of(lib / n) is not None for n in added), added
    assert not [p for p in lib.rglob("*") if p.name.startswith("._") or p.name.endswith(STRAY)]
    assert cli.main(["verify-library", "--config", str(settings)]) == 0
    assert cli.main(["verify-library", "--full", "--config", str(settings)]) == 0

    # the pipeline really ran under the guard
    assert claude.calls["Score"] >= 6 and len(list((out / "state" / "previews").glob("*.jpg"))) >= 6

    # a second run is resumable and still leaves the originals alone
    assert cli.main(["run", "--config", str(settings)]) == 0
    again = library_tree(lib)
    assert unchanged(before, again) and set(again) == set(after)


def test_rawtherapee_only_ever_sees_a_private_link(tmp_path, monkeypatch, fake_rawtherapee, library_tree):
    """rawedit.render_raw under the tripwire, with a RawTherapee stand-in that writes a .pp3
    beside whatever input it is given: the sidecar must land in igmp's work folder."""
    lib = tmp_path / "Library"
    lib.mkdir()
    raw = lib / "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.ARW"
    raw.write_bytes(b"ARW" * 10_000)
    cfg = Config(library_roots=[lib], output_dir=tmp_path / "out", rawtherapee_cli=str(fake_rawtherapee))
    monkeypatch.setattr(rawedit, "_raw_info", lambda path, min_preview=320: ((600, 400), False, 0))
    monkeypatch.setenv("FAKE_RT_LOG", str(tmp_path / "rt.log"))
    before = library_tree(lib)

    with safety.guard(cfg) as g:
        result = rawedit.render_raw(raw, EditParams(), cfg.output_dir / "photos" / "2026-10-10_Harbor_Party", cfg,
                                    colour_match=False)

    assert library_tree(lib) == before and not g.violations
    assert Path(result["ig"]).is_file() and Path(result["full"]).is_file()
    for args in map(json.loads, (tmp_path / "rt.log").read_text().splitlines()):
        given = args[args.index("-c") + 1]
        assert str(lib) not in given and not safety.in_library(cfg, Path(given).parent)
        assert not {"-s", "-S", "-O"} & set(args)
    assert not list((cfg.output_dir / "photos").rglob("*.ARW*"))     # the private link went with its folder
