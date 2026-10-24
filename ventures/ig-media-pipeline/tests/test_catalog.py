from datetime import datetime

from igmp.catalog import parse_flat, scan, scan_flat, scan_insta360


def touch(folder, *names):
    for n in names:
        (folder / n).write_bytes(b"x")


def test_parse_flat_full_name():
    f = parse_flat("2026-10-10_173952_Harbor_Party_A7RV_DSC08969.ARW")
    assert f["taken_at"] == datetime(2026, 10, 10, 17, 39, 52)
    assert (f["location"], f["event"], f["camera"], f["original"]) == ("Harbor", "Party", "A7RV", "DSC08969")


def test_parse_flat_without_event_or_time():
    f = parse_flat("2026-10-03_171411_Mesa-Top_A7RV_DSC02201.ARW")
    assert (f["location"], f["event"]) == ("Mesa-Top", "")
    g = parse_flat("2026-08-xx_Seaside_Swim_Insta360_VID-001.mp4")
    assert g["taken_at"] is None and g["date_label"] == "2026-08-xx" and g["event"] == "Swim"


def test_parse_flat_keeps_multi_part_original():
    f = parse_flat("2026-09-27_231915_Ridge_Lookout_OsmoAction_DJI-0004-001.DNG")
    assert f["camera"] == "OsmoAction" and f["original"] == "DJI-0004-001"


def test_parse_flat_rejects_other_names():
    assert parse_flat("DSC08969.ARW") is None
    assert parse_flat("2026-10-10_notes.txt") is None
    assert parse_flat("_rename-log.csv") is None


def test_raw_jpg_pair_is_one_photo(tmp_path):
    touch(tmp_path, "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.ARW",
          "2026-10-10_173952_Harbor_Party_A7RV_DSC08969.JPG",
          "2026-10-10_180615_Harbor_Party_Pocket3_DJI-0002.MP4",
          "2026-10-10_180615_Harbor_Party_Pocket3_DJI-0002.LRF", "_rename-log.csv")
    assets = {a.kind: a for a in scan_flat(tmp_path)}
    assert set(assets) == {"photo", "video"}
    photo = assets["photo"]
    assert photo.preview.endswith(".JPG") and photo.raw.endswith(".ARW")
    assert photo.event_key == "2026-10-10_Harbor_Party"
    assert assets["video"].preview.endswith(".MP4")


def test_insta360_folder_uses_index(tmp_path):
    folder = tmp_path / "Insta360"
    folder.mkdir()
    touch(folder, "IMG_20260522_170929_00_475.insp", "IMG_20260522_170929_00_475.dng",
          "VID_20261009_154049_00_017.insv", "LRV_20261009_154049_01_017.lrv",
          "VID_20261010_182112_00_027.insv.gyro.bin", "fileinfo_list.list")
    (folder / "_index.csv").write_text(
        "file,from_folder,kind,local_date,local_time,utc_offset,location,event,note\n"
        "VID_20261009_154049_00_017.insv,Camera04,insv,2026-10-09,15:40:49,-6,Valley,Drive,\n")
    assets = {a.kind: a for a in scan_insta360(folder)}
    assert set(assets) == {"photo360", "video360"}
    v = assets["video360"]
    assert v.location == "Valley" and v.taken_at == datetime(2026, 10, 9, 15, 40, 49)
    assert any(f.endswith(".lrv") for f in v.files) and v.preview.endswith(".insv")
    assert assets["photo360"].raw.endswith(".dng")


def test_scan_walks_roots_and_subfolders(tmp_path):
    touch(tmp_path, "2026-10-03_171411_Mesa-Top_A7RV_DSC02201.JPG")
    (tmp_path / "Insta360").mkdir()
    (tmp_path / "Insta360" / "_index.csv").write_text("file,local_date,local_time,location,event\n")
    touch(tmp_path / "Insta360", "IMG_20260523_000110_00_014.insp")
    assert {a.kind for a in scan([tmp_path, tmp_path / "missing"])} == {"photo", "photo360"}
