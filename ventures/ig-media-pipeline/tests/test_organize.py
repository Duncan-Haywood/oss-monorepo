from pathlib import Path

from igmp import catalog, organize

SHOTS = [
    "2026-10-03_211500_Great-Sand-Dunes_A7RV_DSC00001",
    "2026-10-04_013000_Great-Sand-Dunes_A7RV_DSC00002",     # after midnight: the evening before
    "2026-10-10_173952_Erie_Wedding_A7RV_DSC00003",
]


def library(tmp_path: Path) -> Path:
    root = tmp_path / "2026"
    root.mkdir()
    for s in SHOTS:
        for ext in (".ARW", ".JPG", ".xmp"):
            (root / f"{s}{ext}").write_bytes(b"x" * 10)
    (root / "2026-10-05_120000_Erie_A7RV_DSC00004.JPG").write_bytes(b"j")       # JPG-only, with sidecar
    (root / "2026-10-05_120000_Erie_A7RV_DSC00004.xmp").write_bytes(b"s")
    (root / "2026-10-06_090000_Erie_A7RV_C0001.MP4").write_bytes(b"v")
    (root / "2026-10-06_090000_Erie_A7RV_C0001.LRF").write_bytes(b"p")
    ins = root / "Insta360"
    ins.mkdir()
    (ins / "_index.csv").write_text("file,local_date,local_time,location,event,camera\n")
    (root / "notes.txt").write_text("not ours")
    return root


def test_plan_files_by_event_and_type_with_xmp_beside_its_raw(tmp_path):
    root = library(tmp_path)
    dests = {s.name: d.relative_to(root).as_posix() for s, d in organize.plan(root)}
    assert dests[f"{SHOTS[0]}.ARW"] == f"2026-10-03_Great-Sand-Dunes/RAW/{SHOTS[0]}.ARW"
    assert dests[f"{SHOTS[0]}.xmp"] == f"2026-10-03_Great-Sand-Dunes/RAW/{SHOTS[0]}.xmp"
    assert dests[f"{SHOTS[0]}.JPG"] == f"2026-10-03_Great-Sand-Dunes/JPG/{SHOTS[0]}.JPG"
    assert dests[f"{SHOTS[1]}.ARW"].startswith("2026-10-03_Great-Sand-Dunes/RAW/")
    assert dests[f"{SHOTS[2]}.JPG"].startswith("2026-10-10_Erie_Wedding/JPG/")
    assert dests["2026-10-05_120000_Erie_A7RV_DSC00004.xmp"] == \
        "2026-10-05_Erie/JPG/2026-10-05_120000_Erie_A7RV_DSC00004.xmp"
    assert dests["2026-10-06_090000_Erie_A7RV_C0001.LRF"].startswith("2026-10-06_Erie/VIDEO/")
    assert "notes.txt" not in dests and not any("Insta360" in d for d in dests)


def test_apply_keeps_catalog_ids_and_undo_restores(tmp_path):
    root = library(tmp_path)
    before = {a.id: a for a in catalog.scan([root])}
    moves = organize.plan(root)
    result = organize.apply(root, moves)
    assert result["moved"] == len(moves) == 3 * 3 + 2 + 2
    after = {a.id: a for a in catalog.scan([root])}
    assert set(after) == set(before)                                # every score and edit stays attached
    a = next(a for a in after.values() if a.raw and SHOTS[0] in a.raw)
    assert Path(a.raw).parent.name == "RAW" and Path(a.preview).parent.name == "JPG"
    assert a.raw.endswith(".ARW") and a.preview.endswith(".JPG")
    assert organize.plan(root) == []                                # nothing left loose: a re-run is a no-op
    back = organize.undo(Path(result["manifest"]))
    assert back["restored"] == len(moves)
    assert {a.id: a.files for a in catalog.scan([root])} == {k: v.files for k, v in before.items()}
    assert not (root / "2026-10-03_Great-Sand-Dunes").exists()


def test_never_overwrites(tmp_path):
    root = library(tmp_path)
    dest = root / "2026-10-03_Great-Sand-Dunes" / "RAW"
    dest.mkdir(parents=True)
    (dest / f"{SHOTS[0]}.ARW").write_bytes(b"already here")
    result = organize.apply(root, organize.plan(root))
    assert result["skipped"] == 1
    assert (dest / f"{SHOTS[0]}.ARW").read_bytes() == b"already here"
    assert (root / f"{SHOTS[0]}.ARW").exists()                      # the loose copy is left alone
