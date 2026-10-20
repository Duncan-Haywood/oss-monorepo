import os

from igmp import backup


def make(root, files):
    for rel, data in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)


def test_manifest_is_incremental(tmp_path):
    make(tmp_path, {"a.ARW": b"raw", "sub/b.JPG": b"jpg", ".hidden": b"x"})
    assert backup.manifest(tmp_path)["hashed"] == 2
    again = backup.manifest(tmp_path)
    assert again["hashed"] == 0 and again["kept"] == 2
    entries = backup.load(tmp_path)
    assert set(entries) == {"a.ARW", "sub/b.JPG"}


def test_verify_tells_damage_from_edits(tmp_path):
    make(tmp_path, {"a.ARW": b"raw-bytes", "b.xmp": b"<x/>", "gone.JPG": b"j"})
    backup.manifest(tmp_path)
    a = tmp_path / "a.ARW"
    st = a.stat()
    a.write_bytes(b"raw-byteZ")                                   # same size...
    os.utime(a, ns=(st.st_atime_ns, st.st_mtime_ns))              # ...same timestamp: silent damage
    (tmp_path / "b.xmp").write_bytes(b"<x>edited</x>")            # an ordinary edit
    (tmp_path / "gone.JPG").unlink()
    make(tmp_path, {"new.MP4": b"m"})
    r = backup.verify(tmp_path)
    assert r["damaged"] == ["a.ARW"] and r["changed"] == ["b.xmp"]
    assert r["missing"] == ["gone.JPG"] and r["new"] == ["new.MP4"]


def test_copy_verifies_and_never_overwrites_media(tmp_path):
    src, dst = tmp_path / "src", tmp_path / "dst"
    make(src, {"a.ARW": b"raw", "a.xmp": b"<new/>", "b.JPG": b"jpg"})
    make(dst, {"a.xmp": b"<old/>", "b.JPG": b"different"})
    backup.manifest(src)
    r = backup.copy(src, dst)
    assert r["copied"] == ["a.ARW"] and r["refreshed"] == ["a.xmp"] and r["conflict"] == ["b.JPG"]
    assert (dst / "b.JPG").read_bytes() == b"different"           # left for a human to look at
    assert backup.copy(src, dst)["present"] == ["a.ARW", "a.xmp"]
