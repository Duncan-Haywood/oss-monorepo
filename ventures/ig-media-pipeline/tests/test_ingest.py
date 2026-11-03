import csv
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from igmp import backup, catalog, ingest, outputs
from igmp.config import Config
from igmp.store import Store

T = datetime(2026, 10, 10, 17, 39, 52)


def make(root: Path, files: dict[str, bytes]) -> None:
    for rel, data in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)


def sony_card(tmp_path: Path) -> Path:
    card = tmp_path / "vols" / "SONY"
    make(card, {
        "DCIM/100MSDCF/DSC08969.ARW": b"raw-08969",
        "DCIM/100MSDCF/DSC08969.JPG": b"jpg-08969",
        "DCIM/100MSDCF/DSC08970.JPG": b"jpg-08970",
        "PRIVATE/M4ROOT/CLIP/C0001.MP4": b"clip-0001",
        "PRIVATE/M4ROOT/CLIP/C0001M01.XML": b'<CreationDate value="2026-10-10T18:00:05+02:00"/>'
                                            b'<Device manufacturer="Sony" modelName="ILCE-7RM5"/>',
        "PRIVATE/M4ROOT/THMBNL/C0001T01.JPG": b"thumb",      # camera thumbnail: not a shot
        "PRIVATE/M4ROOT/SUB/C0001S03.MP4": b"proxy",          # camera proxy clip: not a shot
        "DCIM/100MSDCF/._DSC08969.ARW": b"appledouble",
        "DCIM/100MSDCF/INDEX.BIN": b"bin",
    })
    return card


def dji_card(tmp_path: Path) -> Path:
    card = tmp_path / "vols" / "POCKET3"
    make(card, {"DCIM/DJI_001/DJI_20261010173952_0001_D.MP4": b"dji-clip",
                "DCIM/DJI_001/DJI_20261010173952_0001_D.LRF": b"dji-proxy"})
    return card


def insta_card(tmp_path: Path) -> Path:
    card = tmp_path / "vols" / "X5"
    make(card, {"DCIM/Camera01/VID_20261010_173952_00_001.insv": b"insv",
                "DCIM/Camera01/LRV_20261010_173952_11_001.lrv": b"lrv",
                "DCIM/Camera01/IMG_20261010_174500_00_002.insp": b"insp",
                "DCIM/Camera01/IMG_20261010_174500_00_002.dng": b"dng"})
    return card


MODELS = {"DSC": ("ILCE-7RM5", "SONY"), "C0": ("ILCE-7RM5", "Sony"), "DJI": ("Pocket 3", "DJI"),
          "VID": ("Insta360 X5", "Arashi Vision"), "LRV": ("", ""), "IMG": ("Insta360 X5", "Arashi Vision")}


def reader(times: dict[str, datetime] | None = None):
    """A fake read_times: models by file-name prefix, times by stem (default T), source 'exif'."""
    times = times or {}

    def read(files, cfg):
        out = {}
        for p in files:
            model, make = next((v for k, v in MODELS.items() if p.name.startswith(k)), ("", ""))
            out[p] = {"taken_at": times.get(p.stem, T), "model": model, "make": make, "source": "exif"}
        return out
    return read


def setup(tmp_path: Path, **extra) -> tuple[Config, Store]:
    root = tmp_path / "lib" / "2026"
    root.mkdir(parents=True)
    cfg = Config(library_roots=[root], output_dir=tmp_path / "out",
                 extra={"state_dir": str(tmp_path / "state"), **extra})
    return cfg, Store(cfg.state_dir / "igmp.sqlite")


def hashes(card: Path) -> dict[str, tuple[str, int]]:
    return {p.relative_to(card).as_posix(): (backup.digest(p), p.stat().st_mtime_ns)
            for p in card.rglob("*") if p.is_file()}


def test_camera_labels():
    p = Path("x.JPG")
    assert ingest.camera_label("ILCE-7RM5", "SONY", p) == "A7RV"
    assert ingest.camera_label("Pocket 3", "DJI", p) == "Pocket3"
    assert ingest.camera_label("FC8482", "DJI", p) == "Pocket3"
    assert ingest.camera_label("Osmo Action 5 Pro", "DJI", p) == "OsmoAction"
    assert ingest.camera_label("OsmoAction", "DJI", p) == "OsmoAction"
    assert ingest.camera_label("Insta360 X5", "Arashi Vision", p) == "X5"
    assert ingest.camera_label("Insta360 Ace Pro 2", "Insta360", p) == "Ace-Pro-2"
    assert ingest.camera_label("", "", Path("VID_20261010_173952_00_001.insv")) == "Insta360"
    odd = ingest.camera_label("ILCE_7M4 II", "SONY", p)
    assert odd == "ILCE-7M4-II" and "_" not in odd and odd not in catalog.CAMERAS


def test_card_files_skip_thumbnails_proxies_and_system_files(tmp_path):
    card = sony_card(tmp_path)
    names = sorted(p.name for p in ingest.card_files(card))
    assert names == ["C0001.MP4", "DSC08969.ARW", "DSC08969.JPG", "DSC08970.JPG"]


def test_find_cards(tmp_path):
    sony_card(tmp_path)
    dji_card(tmp_path)
    (tmp_path / "vols" / "PhotoDrive" / "2026").mkdir(parents=True)     # no DCIM: not a card
    (tmp_path / "vols" / ".hidden" / "DCIM").mkdir(parents=True)
    assert [c.name for c in ingest.find_cards(tmp_path / "vols")] == ["POCKET3", "SONY"]


def test_flat_names_pairs_share_a_stem_and_scan_as_one_shot(tmp_path):
    cfg, store = setup(tmp_path)
    root = cfg.library_roots[0]
    card = sony_card(tmp_path)
    copies = ingest.plan(card, cfg, store, location="Harbor Town", event="Ana's party",
                         reader=reader({"DSC08970": datetime(2026, 10, 10, 17, 40, 1)}))
    by = {c.source.name: c.dest.relative_to(root).as_posix() for c in copies}
    assert by["DSC08969.ARW"] == "2026-10-10_173952_Harbor-Town_Ana-s-party_A7RV_DSC08969.ARW"
    assert by["DSC08969.JPG"] == "2026-10-10_173952_Harbor-Town_Ana-s-party_A7RV_DSC08969.JPG"
    assert by["DSC08970.JPG"].startswith("2026-10-10_174001_")
    assert by["C0001.MP4"] == "2026-10-10_173952_Harbor-Town_Ana-s-party_A7RV_C0001.MP4"
    assert {c.status for c in copies} == {"copy"}

    r = ingest.run(cfg, store, [card], location="Harbor Town", event="Ana's party", reader=reader())
    assert r["copied"] == 4
    assets = {Path(a.preview).name: a for a in catalog.scan([root])}
    pair = assets["2026-10-10_173952_Harbor-Town_Ana-s-party_A7RV_DSC08969.JPG"]
    assert pair.kind == "photo" and pair.raw.endswith("DSC08969.ARW") and len(pair.files) == 2
    assert (pair.camera, pair.location, pair.event, pair.taken_at) == ("A7RV", "Harbor-Town", "Ana-s-party", T)
    clip = assets["2026-10-10_173952_Harbor-Town_Ana-s-party_A7RV_C0001.MP4"]
    assert clip.kind == "video" and clip.camera == "A7RV"


def test_dji_clip_and_lrf_share_a_stem(tmp_path):
    cfg, store = setup(tmp_path)
    root = cfg.library_roots[0]
    card = dji_card(tmp_path)
    ingest.run(cfg, store, [card], location="Erie", reader=reader())
    names = sorted(p.name for p in root.iterdir())
    assert names == ["2026-10-10_173952_Erie_Pocket3_DJI_20261010173952_0001_D.LRF",
                     "2026-10-10_173952_Erie_Pocket3_DJI_20261010173952_0001_D.MP4"]
    [a] = catalog.scan([root])
    assert a.kind == "video" and a.camera == "Pocket3" and a.taken_at == T and len(a.files) == 2
    assert a.preview.endswith(".MP4")


def test_insta360_folder_and_index_read_by_the_catalog(tmp_path):
    cfg, store = setup(tmp_path)
    root = cfg.library_roots[0]
    card = insta_card(tmp_path)
    t2 = datetime(2026, 10, 10, 17, 45, 0)
    ingest.run(cfg, store, [card], location="Harbor", event="Party",
               reader=reader({"IMG_20261010_174500_00_002": t2}))
    folder = root / "2026-10-10_Insta360_Harbor"
    assert sorted(p.name for p in folder.iterdir()) == sorted(
        ["VID_20261010_173952_00_001.insv", "LRV_20261010_173952_11_001.lrv",
         "IMG_20261010_174500_00_002.insp", "IMG_20261010_174500_00_002.dng", "_index.csv"])
    with (folder / "_index.csv").open() as fh:
        rows = list(csv.DictReader(fh))
    assert list(rows[0]) == ["file", "local_date", "local_time", "location", "event", "camera"]
    assets = {a.kind: a for a in catalog.scan([root])}
    assert set(assets) == {"video360", "photo360"}
    v = assets["video360"]
    assert (v.taken_at, v.location, v.event, v.camera) == (T, "Harbor", "Party", "X5") and len(v.files) == 2
    assert assets["photo360"].taken_at == t2 and assets["photo360"].raw.endswith(".dng")


def test_reinsert_is_deduped_and_the_card_is_untouched(tmp_path):
    cfg, store = setup(tmp_path)
    card = sony_card(tmp_path)
    before = hashes(card)
    first = ingest.run(cfg, store, [card], location="Harbor", reader=reader())
    assert first["copied"] == 4 and first["cards"][str(card)]["safe_to_format"]
    second = ingest.run(cfg, store, [card], location="Harbor", reader=reader())
    assert second["copied"] == 0 and second["skip"] == 4 and second["cards"][str(card)]["safe_to_format"]
    assert hashes(card) == before
    rows = dict(store.all("ingest"))
    assert len(rows) == 4
    key = "A7RV|DSC08969.ARW|9|2026-10-10T17:39:52"
    assert rows[key]["blake2b"] == backup.digest(card / "DCIM/100MSDCF/DSC08969.ARW")
    assert rows[key]["card"] == "SONY" and Path(rows[key]["dest"]).exists()
    report = json.loads(Path(first["cards"][str(card)]["report"]).read_text())
    assert report["counts"]["copied"] == 4 and len(report["files"]) == 4
    # a file already at its destination (the ledger lost) is a skip, and is recorded
    store.delete("ingest", key)
    third = ingest.run(cfg, store, [card], location="Harbor", reader=reader())
    assert third["skip"] == 4 and store.has("ingest", key)


def test_conflict_never_overwrites(tmp_path, monkeypatch):
    cfg, store = setup(tmp_path)
    monkeypatch.setattr(ingest, "read_times", reader())
    root = cfg.library_roots[0]
    card = dji_card(tmp_path)
    taken = root / "2026-10-10_173952_Erie_Pocket3_DJI_20261010173952_0001_D.MP4"
    taken.write_bytes(b"someone else's clip")
    r = ingest.run(cfg, store, [card], location="Erie", reader=reader())
    assert r["conflict"] == 1 and r["copied"] == 1
    assert taken.read_bytes() == b"someone else's clip"
    c = r["cards"][str(card)]
    assert not c["safe_to_format"] and "conflict" in c["why"][0]
    assert ingest.cli_ingest(cfg, store, SimpleNamespace(paths=[str(card)], location="Erie", event="",
                                                         dry_run=False, watch=False, no_push=True,
                                                         settle=False)) == 1


def test_corrupted_copy_is_detected_and_leaves_nothing(tmp_path, monkeypatch):
    cfg, store = setup(tmp_path)
    root = cfg.library_roots[0]
    card = dji_card(tmp_path)
    monkeypatch.setattr(ingest.backup, "digest", lambda p: "0" * 40)     # the re-read disagrees
    r = ingest.run(cfg, store, [card], location="Erie", reader=reader())
    assert r["failed"] == 2 and r["copied"] == 0
    assert list(root.iterdir()) == []                                    # no file, no .tmp
    assert not r["cards"][str(card)]["safe_to_format"]
    assert list(store.all("ingest")) == []


def test_dry_run_writes_nothing(tmp_path):
    cfg, store = setup(tmp_path)
    card = sony_card(tmp_path)
    r = ingest.run(cfg, store, [card], dry_run=True, reader=reader())
    assert r["copy"] == 4 and not any(cfg.library_roots[0].iterdir())
    assert not r["cards"][str(card)]["safe_to_format"] and not (cfg.state_dir / "ingest").exists()


def test_event_without_location_is_refused(tmp_path):
    cfg, store = setup(tmp_path)
    with pytest.raises(ValueError):
        ingest.plan(sony_card(tmp_path), cfg, store, event="Party", reader=reader())


def offline(monkeypatch, drive: Path):
    """Pretend the library root sits on /Volumes/<drive>, which is not mounted."""
    monkeypatch.setattr(outputs, "volume_root", lambda p: drive if str(p).startswith(str(drive)) else None)
    state = {"mounted": False}
    monkeypatch.setattr(outputs, "_mounted", lambda v: state["mounted"])
    return state


def test_spool_then_settle_keeps_asset_ids(tmp_path, monkeypatch):
    cfg, store = setup(tmp_path)
    root = cfg.library_roots[0]
    drive = tmp_path / "lib"
    state = offline(monkeypatch, drive)
    shutil.rmtree(drive)                                    # the drive is away: its folder is gone
    spool = ingest.spool_dir(cfg)
    assert ingest.dest_root(cfg) == spool and spool.name == root.name
    cards = [dji_card(tmp_path), insta_card(tmp_path)]
    r = ingest.run(cfg, store, cards, location="Erie", reader=reader())
    assert r["copied"] == 6 and not drive.exists()         # nothing written where the drive mounts
    assert all(c["spooled"] for c in r["cards"].values())
    assert ingest.scan_roots(cfg) == [root, spool]
    spooled = {a.id: a for a in catalog.scan([spool])}
    assert len(spooled) == 3                               # a clip, a 360 clip, a 360 photo
    assert ingest.settle(cfg, store)["waiting"] == 7       # still away: 6 files and an _index.csv wait

    state["mounted"] = True                                 # the drive is back
    root.mkdir(parents=True)
    (root / "2026-10-10_Insta360_Erie").mkdir()
    (root / "2026-10-10_Insta360_Erie" / "_index.csv").write_text(
        "file,local_date,local_time,location,event,camera\nVID_old.insv,2026-10-09,10:00:00,Erie,,X5\n")
    s = ingest.settle(cfg, store)
    assert s["moved"] == 6 and s["conflict"] == 0 and s["records"] == 6
    assert ingest.scan_roots(cfg) == [root] and not ingest._spool_files(spool)
    settled = {a.id: a for a in catalog.scan([root])}
    assert set(settled) == set(spooled)
    assert {k: (a.kind, a.taken_at, a.camera) for k, a in settled.items()} == \
        {k: (a.kind, a.taken_at, a.camera) for k, a in spooled.items()}
    with (root / "2026-10-10_Insta360_Erie" / "_index.csv").open() as fh:
        assert {row["file"] for row in csv.DictReader(fh)} >= {"VID_old.insv", "VID_20261010_173952_00_001.insv"}
    assert all(Path(v["dest"]).is_relative_to(root) and Path(v["dest"]).exists() for _, v in store.all("ingest"))
    # put the card in again: everything is already in
    again = ingest.run(cfg, store, cards, location="Erie", reader=reader())
    assert again["skip"] == 6 and again["copied"] == 0


def test_settle_never_overwrites_a_different_file(tmp_path, monkeypatch):
    cfg, store = setup(tmp_path)
    root = cfg.library_roots[0]
    state = offline(monkeypatch, tmp_path / "lib")
    ingest.run(cfg, store, [dji_card(tmp_path)], location="Erie", reader=reader())
    state["mounted"] = True
    clash = root / "2026-10-10_173952_Erie_Pocket3_DJI_20261010173952_0001_D.MP4"
    clash.write_bytes(b"different")
    s = ingest.settle(cfg, store)
    assert s["conflict"] == 1 and s["moved"] == 1 and clash.read_bytes() == b"different"
    assert (ingest.spool_dir(cfg) / clash.name).exists()


def test_safe_to_format_needs_a_push(tmp_path):
    cfg, store = setup(tmp_path)
    card = dji_card(tmp_path)
    calls = []

    def half(paths):
        calls.append(list(paths))
        return {"pushed": [str(p) for p in paths if p.suffix == ".MP4"],
                "failed": [str(p) for p in paths if p.suffix != ".MP4"]}
    r = ingest.run(cfg, store, [card], location="Erie", reader=reader(), push=half)
    c = r["cards"][str(card)]
    assert not c["safe_to_format"] and "not pushed" in c["why"][0]
    assert len(calls[0]) == 2
    rows = {Path(v["dest"]).suffix: v["pushed"] for _, v in store.all("ingest")}
    assert rows == {".MP4": True, ".LRF": False}

    def down(paths):
        raise ConnectionError("bucket unreachable")
    assert not ingest.run(cfg, store, [card], location="Erie", reader=reader(), push=down)[
        "cards"][str(card)]["safe_to_format"]
    ok = ingest.run(cfg, store, [card], location="Erie", reader=reader(),
                    push=lambda paths: {"pushed": [str(p) for p in paths], "failed": []})
    assert ok["skip"] == 2 and ok["cards"][str(card)]["safe_to_format"]
    assert all(v["pushed"] for _, v in store.all("ingest"))


def test_insta360_index_is_pushed_too(tmp_path):
    cfg, store = setup(tmp_path)
    got = []
    ingest.run(cfg, store, [insta_card(tmp_path)], reader=reader(),
               push=lambda paths: got.extend(paths) or {"pushed": [str(p) for p in paths], "failed": []})
    assert any(p.name == "_index.csv" for p in got)


def test_watch_ingests_each_insertion_once(tmp_path):
    cfg, store = setup(tmp_path)
    dji_card(tmp_path)
    first = ingest.watch(cfg, store, once=True, volumes=tmp_path / "vols", location="Erie", reader=reader())
    assert len(first) == 1 and first[0]["copied"] == 2


def test_read_times_fallbacks_without_exiftool(tmp_path):
    from PIL import Image
    cfg = Config(library_roots=[], output_dir=tmp_path, exiftool=str(tmp_path / "no-exiftool"))
    jpg = tmp_path / "DSC00001.JPG"
    exif = Image.Exif()
    exif[0x0110], exif[0x010F] = "ILCE-7RM5", "SONY"
    exif.get_ifd(0x8769)[0x9003] = "2026:10:10 17:39:52"
    Image.new("RGB", (8, 8)).save(jpg, exif=exif)
    dji = tmp_path / "DJI_20261010173952_0001_D.MP4"
    dji.write_bytes(b"not really a clip")
    plain = tmp_path / "notes.xmp"
    plain.write_bytes(b"x")
    files = [jpg, dji, plain]
    if shutil.which("ffmpeg"):
        clip = tmp_path / "C0002.MP4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.2",
                        "-metadata", "creation_time=2026-10-10T15:39:52Z", str(clip)], check=True)
        files.append(clip)
    r = ingest.read_times(files, cfg)
    assert r[jpg] == {"taken_at": T, "model": "ILCE-7RM5", "make": "SONY", "source": "pillow"}
    assert r[dji]["taken_at"] == T and r[dji]["source"] == "name"
    assert r[plain]["source"] == "mtime"
    if len(files) == 4:
        assert r[files[3]]["source"] == "ffprobe-utc"
        assert r[files[3]]["taken_at"] == datetime(2026, 10, 10, 15, 39, 52, tzinfo=timezone.utc)
        # a UTC time is shifted to the place's timezone for the name
        cfg.places = {"Paris": {"timezone": "Europe/Paris"}}
        assert ingest._local(r[files[3]]["taken_at"], cfg, "Paris") == T


def test_read_times_uses_exiftool_and_sony_xml(tmp_path):
    tool = tmp_path / "exiftool"
    jpg = tmp_path / "DSC00001.JPG"
    jpg.write_bytes(b"j")
    tool.write_text("#!/bin/sh\n" f"cat <<'EOF'\n" + json.dumps([
        {"SourceFile": str(jpg), "DateTimeOriginal": "2026:10:10 17:39:52", "Model": "ILCE-7RM5", "Make": "SONY"}])
        + "\nEOF\n")
    tool.chmod(0o755)
    clip = tmp_path / "C0001.MP4"
    clip.write_bytes(b"c")
    (tmp_path / "C0001M01.XML").write_text('<CreationDate value="2026-10-10T17:39:52+02:00"/>'
                                           '<Device manufacturer="Sony" modelName="ILCE-7RM5"/>')
    cfg = Config(library_roots=[], output_dir=tmp_path, exiftool=str(tool), ffprobe=str(tmp_path / "none"))
    r = ingest.read_times([jpg, clip], cfg)
    assert r[jpg] == {"taken_at": T, "model": "ILCE-7RM5", "make": "SONY", "source": "exif"}
    assert r[clip] == {"taken_at": T, "model": "ILCE-7RM5", "make": "Sony", "source": "xml"}


def test_scan_roots_without_any_root_configured(tmp_path):
    cfg = Config(library_roots=[], output_dir=tmp_path)
    assert ingest.scan_roots(cfg) == []


def test_ingest_camera_names_a_card_whose_files_carry_no_model(tmp_path):
    from igmp import config, ingest
    from igmp.store import Store
    card = tmp_path / "CARD"
    clip = card / "DCIM" / "DJI_001" / "DJI_20261010173952_0001_D.MP4"
    clip.parent.mkdir(parents=True)
    clip.write_bytes(b"clip")
    root = tmp_path / "lib" / "2026"
    root.mkdir(parents=True)
    cfg = config.Config(library_roots=[root], output_dir=tmp_path / "out",
                        extra={"ingest_camera": "OsmoAction"})
    reader = lambda files, cfg: {p: {"taken_at": __import__("datetime").datetime(2026, 10, 10, 17, 39, 52),
                                     "model": "", "make": "", "source": "name"} for p in files}
    copies = ingest.plan(card, cfg, Store(cfg.db_path), location="Harbor", reader=reader)
    assert [c.dest.name for c in copies] == ["2026-10-10_173952_Harbor_OsmoAction_DJI_20261010173952_0001_D.MP4"]


def test_an_insta360_clip_and_its_lrv_share_one_camera_in_the_index(tmp_path):
    # the LRV carries no model; the catalog takes whichever index row it lists first, so every
    # file of a clip must carry the clip's camera, whatever order the folder lists them in
    cfg, store = setup(tmp_path)
    ingest.run(cfg, store, [insta_card(tmp_path)], location="Harbor", reader=reader())
    with (cfg.library_roots[0] / "2026-10-10_Insta360_Harbor" / "_index.csv").open() as fh:
        rows = {r["file"]: r for r in csv.DictReader(fh)}
    assert rows["LRV_20261010_173952_11_001.lrv"]["camera"] == rows["VID_20261010_173952_00_001.insv"]["camera"] == "X5"
