import json
import shutil
import sqlite3
import subprocess
import types
from pathlib import Path

import pytest

from igmp import catalog, cloud, outputs
from igmp.backup import digest
from igmp.bucket import LocalBucket, PreconditionFailed
from igmp.config import Config
from igmp.store import Store

SHOTS = ["2026-10-10_173952_Harbor_A7RV_DSC08969.JPG", "2026-10-10_173952_Harbor_A7RV_DSC08969.ARW",
         "2026-10-10_180100_Harbor_A7RV_DSC08970.JPG"]


def cfg(tmp_path, roots=None, **extra):
    return Config(library_roots=roots if roots is not None else [tmp_path / "Volumes" / "Photo" / "2026"],
                  output_dir=tmp_path / "IG",
                  extra={"state_dir": str(tmp_path / "state"), "proxy_preset": "ultrafast", **extra})


@pytest.fixture
def lib(tmp_path):
    c = cfg(tmp_path)
    root = c.library_roots[0]
    root.mkdir(parents=True)
    for i, name in enumerate(SHOTS):
        (root / name).write_bytes(f"shot {i} ".encode() * 50)
    ev = root / "Harbor" / "JPG"
    ev.mkdir(parents=True)
    (ev / "2026-10-11_090000_Harbor_Party_A7RV_DSC09000.JPG").write_bytes(b"party")
    (root / ".DS_Store").write_bytes(b"x")
    (root / "half.tmp").write_bytes(b"x")
    (root / "_organize").mkdir()
    (root / "_organize" / "moves.jsonl").write_text("{}\n")
    (root / "_checksums.csv").write_text("rel,size,mtime_ns,blake2b\n")
    return c, Store(c.db_path), LocalBucket(tmp_path / "bucket")


def keys(b, prefix=""):
    return [o.key for o in b.list(prefix)]


def lavfi_clip(path: Path, seconds=1):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y",
                    "-f", "lavfi", "-i", f"testsrc=size=320x240:rate=10:duration={seconds}",
                    "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
                    # lossless, so the clip is bigger than its proxy (as a camera original is)
                    "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-f", "mp4", str(path)], check=True)


# --------------------------------------------------------------------------- keys and push

def test_key_keeps_the_root_name(tmp_path):
    root = tmp_path / "Photo" / "2026"
    assert cloud.key_for(root, root / "Harbor" / "JPG" / "a.JPG") == "library/2026/Harbor/JPG/a.JPG"
    assert cloud.key_for(root, root / "a.JPG", prefix="x/") == "x/2026/a.JPG"


def test_push_library_sends_the_library_and_leaves_housekeeping(lib):
    c, store, b = lib
    r = cloud.push_library(c, store, b)
    assert r["counts"] == {"files": 5, "pushed": 5, "skipped": 0, "failed": 0}
    assert keys(b) == ["library/2026/2026-10-10_173952_Harbor_A7RV_DSC08969.ARW",
                       "library/2026/2026-10-10_173952_Harbor_A7RV_DSC08969.JPG",
                       "library/2026/2026-10-10_180100_Harbor_A7RV_DSC08970.JPG",
                       "library/2026/Harbor/JPG/2026-10-11_090000_Harbor_Party_A7RV_DSC09000.JPG",
                       "library/2026/_checksums.csv"]
    root = c.library_roots[0]
    head = b.head("library/2026/" + SHOTS[0])
    assert head.meta == {"blake2b": digest(root / SHOTS[0])}
    row = store.get("cloud", "library/2026/" + SHOTS[0])
    assert row["blake2b"] == head.meta["blake2b"] and row["size"] == (root / SHOTS[0]).stat().st_size
    assert row["proxied"] is False and row["pushed_at"]
    assert r["bytes"] == sum(o.size for o in b.list())
    assert cloud.unpushed(c, store) == 0


def test_push_is_incremental(lib, monkeypatch):
    c, store, b = lib
    cloud.push_library(c, store, b)
    calls = []
    real = cloud.backup.digest
    monkeypatch.setattr(cloud.backup, "digest", lambda p: calls.append(p) or real(p))
    r = cloud.push_library(c, store, b)
    assert r["counts"]["pushed"] == 0 and r["counts"]["skipped"] == 5 and calls == []   # not even re-read
    # a changed file goes up again; the rest stay put
    root = c.library_roots[0]
    (root / SHOTS[2]).write_bytes(b"re-exported")
    assert cloud.unpushed(c, store) == 1
    r = cloud.push_library(c, store, b)
    assert r["pushed"] == [str(root / SHOTS[2])] and len(r["skipped"]) == 4
    assert b.get_bytes("library/2026/" + SHOTS[2])[0] == b"re-exported"


def test_push_skips_what_the_bucket_already_has(lib, tmp_path):
    """Another Mac (or a lost database) pushed it: the object's meta digest says it is there."""
    c, store, b = lib
    cloud.push_library(c, store, b)
    fresh = Store(tmp_path / "other.sqlite")
    put = []
    b.put_file = lambda *a, **k: put.append(a)
    r = cloud.push_library(c, fresh, b)
    assert put == [] and r["counts"]["skipped"] == 5
    assert fresh.get("cloud", "library/2026/" + SHOTS[0])["blake2b"]


def test_push_uses_the_roots_checksum_manifest(lib, monkeypatch):
    from igmp import backup
    c, store, b = lib
    root = c.library_roots[0]
    (root / "_checksums.csv").unlink()
    backup.manifest(root)
    monkeypatch.setattr(cloud.backup, "digest", lambda p: pytest.fail(f"rehashed {p}"))
    r = cloud.push_paths(c, store, b, [root / SHOTS[0], root / SHOTS[1]])
    assert len(r["pushed"]) == 2


def test_push_failures_are_recorded_not_fatal(lib, tmp_path):
    c, store, b = lib
    root = c.library_roots[0]
    real = b.put_file

    def flaky(key, path, **kw):
        if key.endswith("DSC08970.JPG"):
            raise OSError("connection reset")
        return real(key, path, **kw)
    b.put_file = flaky
    outside = tmp_path / "elsewhere.JPG"
    outside.write_bytes(b"x")
    r = cloud.push_paths(c, store, b, [root / SHOTS[0], root / SHOTS[2], outside, root / "gone.JPG"])
    assert r["pushed"] == [str(root / SHOTS[0])]
    assert r["failed"] == [str(root / SHOTS[2]), str(outside), str(root / "gone.JPG")]
    assert "connection reset" in store.get("cloud", "library/2026/" + SHOTS[2])["error"]
    assert cloud.unpushed(c, store) == 4       # the failed one counts as waiting
    b.put_file = real
    assert cloud.push_paths(c, store, b, [root / SHOTS[2]])["pushed"] == [str(root / SHOTS[2])]


def test_push_limit_counts_uploads(lib):
    c, store, b = lib
    assert cloud.push_library(c, store, b, limit=2)["counts"]["pushed"] == 2
    r = cloud.push_library(c, store, b, limit=2)
    assert r["counts"]["pushed"] == 2 and r["counts"]["skipped"] == 2


def test_push_includes_the_ingest_spool(tmp_path, monkeypatch):
    c = cfg(tmp_path)
    spool = c.state_dir / "ingest" / "2026"
    spool.mkdir(parents=True)
    (spool / SHOTS[0]).write_bytes(b"spooled")
    monkeypatch.setattr(cloud, "scan_roots", lambda cfg: [*cfg.library_roots, spool])
    store, b = Store(c.db_path), LocalBucket(tmp_path / "bucket")
    r = cloud.push_library(c, store, b)        # the photo drive is away; the spool goes up
    assert r["counts"]["pushed"] == 1 and keys(b) == ["library/2026/" + SHOTS[0]]


# --------------------------------------------------------------------------- video

def test_proxy_mode_transcodes_and_keeps_the_name(tmp_path):
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg")
    c = cfg(tmp_path)
    root = c.library_roots[0]
    root.mkdir(parents=True)
    clip = root / "2026-10-10_174500_Harbor_Pocket3_DJI_0042.MOV"
    lavfi_clip(clip)
    (root / "2026-10-10_174500_Harbor_Pocket3_DJI_0042.LRF").write_bytes(b"low res")
    store, b = Store(c.db_path), LocalBucket(tmp_path / "bucket")
    r = cloud.push_library(c, store, b)
    key = "library/2026/" + clip.name
    assert keys(b) == [key] and r["skipped"] == [str(root / "2026-10-10_174500_Harbor_Pocket3_DJI_0042.LRF")]
    h = b.head(key)
    assert h.meta == {"blake2b": digest(clip), "igmp-proxy": "1"}
    assert store.get("cloud", key)["proxied"] is True
    got = tmp_path / "got" / clip.name
    b.get_file(key, got)
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(got)],
                                     capture_output=True, check=True).stdout)
    assert {s["codec_type"] for s in info["streams"]} == {"video", "audio"}
    assert [s["codec_name"] for s in info["streams"] if s["codec_type"] == "video"] == ["h264"]
    assert not any((c.state_dir / "cloud-tmp").iterdir())          # the temporary proxy is gone
    assert cloud.push_library(c, store, b)["counts"]["pushed"] == 0
    # switching to originals sends the clip as shot, and the camera's low-res copy with it
    c.extra["cloud_video"] = "original"
    r = cloud.push_library(c, store, b)
    assert r["counts"]["pushed"] == 2 and b.get_bytes(key)[0] == clip.read_bytes()
    assert "igmp-proxy" not in b.head(key).meta


def test_proxy_mode_calls_the_video_recipe(tmp_path, monkeypatch):
    from igmp import proxies
    c = cfg(tmp_path)
    root = c.library_roots[0]
    root.mkdir(parents=True)
    for n in ("a_X5_VID_1.insv", "b_Pocket3_1.mp4", "c_A7RV_1.MOV"):
        (root / n).write_bytes(b"clip" * 100)
    seen = []

    def fake(src, dest, recipe, cfg, threads=0, want=None):
        seen.append((src.name, dest.name, recipe, want))
        dest.write_bytes(b"proxy")
    monkeypatch.setattr(proxies, "make_video", fake)
    store, b = Store(c.db_path), LocalBucket(tmp_path / "bucket")
    cloud.push_library(c, store, b)
    assert seen == [("a_X5_VID_1.insv", "a_X5_VID_1.insv", "video360", None),
                    ("b_Pocket3_1.mp4", "b_Pocket3_1.mp4", "video", None),
                    ("c_A7RV_1.MOV", "c_A7RV_1.MOV", "video", None)]
    assert all(b.get_bytes(k)[0] == b"proxy" for k in keys(b))


def test_a_proxy_bigger_than_its_clip_sends_the_clip(tmp_path, monkeypatch):
    from igmp import proxies
    c = cfg(tmp_path)
    root = c.library_roots[0]
    root.mkdir(parents=True)
    clip = root / "2026-10-10_174500_Harbor_Pocket3_DJI_0001.MP4"
    clip.write_bytes(b"small")
    monkeypatch.setattr(proxies, "make_video", lambda src, dest, recipe, cfg, threads=0, want=None:
                        dest.write_bytes(b"a bigger proxy"))
    store, b = Store(c.db_path), LocalBucket(tmp_path / "bucket")
    assert cloud.push_library(c, store, b)["counts"]["pushed"] == 1
    key = "library/2026/" + clip.name
    assert b.get_bytes(key)[0] == b"small" and b.head(key).meta["igmp-proxy"] == "original"
    # a fresh store on another machine sees it as done in proxy mode, not as a clip to re-send
    assert cloud.push_library(c, Store(tmp_path / "other.sqlite"), b)["counts"]["pushed"] == 0


def test_a_failed_transcode_is_recorded(tmp_path, monkeypatch):
    from igmp import proxies
    c = cfg(tmp_path)
    root = c.library_roots[0]
    root.mkdir(parents=True)
    (root / "bad.mp4").write_bytes(b"not a video")
    (root / SHOTS[0]).write_bytes(b"photo")

    def boom(*a, **k):
        raise RuntimeError("ffmpeg bad.mp4: invalid data")
    monkeypatch.setattr(proxies, "make_video", boom)
    store, b = Store(c.db_path), LocalBucket(tmp_path / "bucket")
    r = cloud.push_library(c, store, b)
    assert r["counts"]["pushed"] == 1 and r["failed"] == [str(root / "bad.mp4")]
    assert "invalid data" in store.get("cloud", "library/2026/bad.mp4")["error"]
    assert not any((c.state_dir / "cloud-tmp").iterdir())


# --------------------------------------------------------------------------- the worker's mirror

def test_mirror_keeps_asset_ids(lib, tmp_path):
    c, store, b = lib
    cloud.push_library(c, store, b)
    m = cloud.mirror_library(c, b, tmp_path / "worker" / "library")
    assert m["downloaded"] == 5 and m["roots"] == [tmp_path / "worker" / "library" / "2026"]
    mac = {a.id: a.files for a in catalog.scan(c.library_roots)}
    worker = {a.id: a.files for a in catalog.scan(m["roots"])}
    assert set(mac) == set(worker) and len(mac) == 3
    assert m == {**m, "bytes": sum(o.size for o in b.list("library/"))}
    again = cloud.mirror_library(c, b, tmp_path / "worker" / "library")
    assert again["downloaded"] == 0 and again["current"] == 5
    # a re-pushed file whose size changed is fetched again
    (c.library_roots[0] / SHOTS[2]).write_bytes(b"new and longer content")
    cloud.push_library(c, store, b)
    again = cloud.mirror_library(c, b, tmp_path / "worker" / "library")
    assert again["downloaded"] == 1
    assert (tmp_path / "worker" / "library" / "2026" / SHOTS[2]).read_bytes() == b"new and longer content"


# --------------------------------------------------------------------------- outputs

def make_outputs(base: Path):
    (base / "reels" / "Harbor").mkdir(parents=True)
    (base / "reels" / "Harbor" / "Harbor__short-01.mp4").write_bytes(b"reel")
    (base / "reels" / "Harbor" / ".Harbor__short-02.mp4.part").write_bytes(b"rendering")
    (base / "photos" / "Harbor").mkdir(parents=True)
    (base / "photos" / "Harbor" / "a.jpg").write_bytes(b"photo")
    (base / "ready").mkdir()
    (base / "ready" / "index.csv").write_text("a\n")
    (base / "state").mkdir()
    (base / "state" / "igmp.sqlite").write_bytes(b"not an output")


def test_push_outputs_is_incremental(tmp_path, monkeypatch):
    c = cfg(tmp_path, roots=[])
    make_outputs(c.output_dir)
    b = LocalBucket(tmp_path / "bucket")
    r = cloud.push_outputs(c, b)
    assert r["pushed"] == 3 and keys(b) == ["outputs/photos/Harbor/a.jpg",
                                            "outputs/ready/index.csv",
                                            "outputs/reels/Harbor/Harbor__short-01.mp4"]
    assert b.head("outputs/photos/Harbor/a.jpg").meta == {"blake2b": digest(c.output_dir / "photos/Harbor/a.jpg")}
    monkeypatch.setattr(cloud.backup, "digest", lambda p: pytest.fail(f"rehashed {p}"))
    b.head = lambda k: pytest.fail("asked the bucket about an unchanged file")
    assert cloud.push_outputs(c, b) == {"pushed": 0, "current": 3, "failed": 0, "bytes": 0}


def test_push_outputs_resends_a_changed_file(tmp_path):
    c = cfg(tmp_path, roots=[])
    make_outputs(c.output_dir)
    b = LocalBucket(tmp_path / "bucket")
    cloud.push_outputs(c, b)
    (c.output_dir / "ready" / "index.csv").write_text("a\nb\n")
    r = cloud.push_outputs(c, b)
    assert r["pushed"] == 1 and b.get_bytes("outputs/ready/index.csv")[0] == b"a\nb\n"


def test_pull_outputs_is_incremental_and_never_deletes(tmp_path, monkeypatch):
    worker = cfg(tmp_path / "w", roots=[])
    make_outputs(worker.output_dir)
    b = LocalBucket(tmp_path / "bucket")
    cloud.push_outputs(worker, b)
    mac = cfg(tmp_path / "m", roots=[])
    (mac.output_dir / "reels").mkdir(parents=True)
    (mac.output_dir / "reels" / "mine.mp4").write_bytes(b"made on the Mac")
    store = Store(mac.db_path)
    r = cloud.pull_outputs(mac, store, b)
    assert (r["downloaded"], r["current"], r["failed"]) == (3, 0, 0)
    assert (mac.output_dir / "reels" / "Harbor" / "Harbor__short-01.mp4").read_bytes() == b"reel"
    assert (mac.output_dir / "reels" / "mine.mp4").exists()
    assert not list(mac.output_dir.rglob(".*"))                      # no temporaries left
    got = []
    real = b.get_file
    b.get_file = lambda k, p: got.append(k) or real(k, p)
    assert cloud.pull_outputs(mac, store, b)["current"] == 3 and got == []
    # the worker revises a reel: only it comes down again
    (worker.output_dir / "reels" / "Harbor" / "Harbor__short-01.mp4").write_bytes(b"reel v2")
    cloud.push_outputs(worker, b)
    r = cloud.pull_outputs(mac, store, b)
    assert r["downloaded"] == 1 and got == ["outputs/reels/Harbor/Harbor__short-01.mp4"]
    assert (mac.output_dir / "reels" / "Harbor" / "Harbor__short-01.mp4").read_bytes() == b"reel v2"


def test_pull_recognises_files_already_there(tmp_path):
    worker = cfg(tmp_path / "w", roots=[])
    make_outputs(worker.output_dir)
    b = LocalBucket(tmp_path / "bucket")
    cloud.push_outputs(worker, b)
    mac = cfg(tmp_path / "m", roots=[])
    shutil.copytree(worker.output_dir / "photos", mac.output_dir / "photos")
    r = cloud.pull_outputs(mac, Store(mac.db_path), b)
    assert r["downloaded"] == 2 and r["current"] == 1


def test_pull_goes_to_the_outbox_while_the_drive_is_away(tmp_path, monkeypatch):
    worker = cfg(tmp_path / "w", roots=[])
    make_outputs(worker.output_dir)
    b = LocalBucket(tmp_path / "bucket")
    cloud.push_outputs(worker, b)
    vol = tmp_path / "Volumes" / "Extreme SSD"
    mounted = {"on": False}
    monkeypatch.setattr(outputs, "volume_root", lambda p: vol if str(p).startswith(str(vol)) else None)
    monkeypatch.setattr(outputs, "_mounted", lambda v: mounted["on"])
    mac = Config(library_roots=[], output_dir=vol / "IG", extra={"state_dir": str(tmp_path / "macstate")})
    store = Store(mac.db_path)
    r = cloud.pull_outputs(mac, store, b)
    box = tmp_path / "macstate" / "outbox"
    assert r["downloaded"] == 3 and r["to"] == str(box)
    assert (box / "reels" / "Harbor" / "Harbor__short-01.mp4").read_bytes() == b"reel"
    assert not vol.exists()                                          # nothing made under /Volumes
    # the drive comes back, sync moves the outbox; a re-pull does not fetch the files again
    mounted["on"] = True
    vol.mkdir(parents=True)
    assert outputs.sync(mac, store)["moved"] == 3
    r = cloud.pull_outputs(mac, store, b)
    assert r["downloaded"] == 0 and r["current"] == 3
    assert (mac.output_dir / "reels" / "Harbor" / "Harbor__short-01.mp4").read_bytes() == b"reel"


# --------------------------------------------------------------------------- state

def make_db(c: Config, rows=3):
    s = Store(c.db_path)
    for i in range(rows):
        s.put("scores", f"a{i}", {"score": i})
    return s


def test_snapshot_and_restore(tmp_path):
    mac = cfg(tmp_path / "m", roots=[])
    s = make_db(mac)                          # still open, WAL mode: the backup API copes
    b = LocalBucket(tmp_path / "bucket")
    o = cloud.snapshot_state(mac, b)
    assert o.key == "state/igmp.sqlite" and o.meta["blake2b"]
    assert not any((mac.state_dir / "cloud-tmp").iterdir())
    worker = cfg(tmp_path / "w", roots=[])
    assert cloud.restore_state(worker, b) == "state"
    rows = sqlite3.connect(worker.db_path).execute("SELECT key FROM scores ORDER BY key").fetchall()
    assert rows == [("a0",), ("a1",), ("a2",)]
    assert cloud.restore_state(worker, b) == "local"
    s.db.close()


def test_restore_falls_back_to_the_seed_then_none(tmp_path):
    b = LocalBucket(tmp_path / "bucket")
    w = cfg(tmp_path / "w", roots=[])
    assert cloud.restore_state(w, b) == "none" and not w.db_path.exists()
    mac = cfg(tmp_path / "m", roots=[])
    make_db(mac, rows=1)
    cloud.seed(mac, b)
    assert cloud.restore_state(w, b) == "seed"
    assert Store(w.db_path).get("scores", "a0") == {"score": 0}


def test_seed_is_refused_once_the_worker_owns_the_state(tmp_path):
    mac = cfg(tmp_path / "m", roots=[])
    make_db(mac)
    b = LocalBucket(tmp_path / "bucket")
    assert cloud.seed(mac, b).key == "state/seed.sqlite"
    b.put_bytes("state/igmp.sqlite", b"the worker's")
    with pytest.raises(RuntimeError, match="already owns"):
        cloud.seed(mac, b)
    assert cloud.seed(mac, b, force=True).key == "state/seed.sqlite"
    assert b.get_bytes("state/igmp.sqlite")[0] == b"the worker's"     # never overwritten by a seed


def test_seed_without_a_database(tmp_path):
    with pytest.raises(FileNotFoundError):
        cloud.seed(cfg(tmp_path, roots=[]), LocalBucket(tmp_path / "bucket"))


# --------------------------------------------------------------------------- the lease

def lease(b):
    return json.loads(b.get_bytes("lease.json")[0])


def test_lease_create_renew_contend_expire(tmp_path):
    b = LocalBucket(tmp_path)
    assert cloud.acquire_lease(b, "w1", ttl_s=100, now=1000)
    first = lease(b)
    assert first["owner"] == "w1" and first["expires_at"] == 1100 and first["acquired_at"] == 1000 and first["host"]
    assert not cloud.acquire_lease(b, "w2", ttl_s=100, now=1050)      # w1's lease runs
    assert cloud.renew_lease(b, "w1", ttl_s=100, now=1080)
    assert lease(b)["expires_at"] == 1180 and lease(b)["acquired_at"] == 1000
    assert cloud.acquire_lease(b, "w1", ttl_s=100, now=1090)          # ours: renewed
    assert not cloud.renew_lease(b, "w2", ttl_s=100, now=1100)
    assert not cloud.acquire_lease(b, "w2", ttl_s=100, now=1189)
    assert cloud.acquire_lease(b, "w2", ttl_s=100, now=1191)          # expired: taken over
    assert lease(b)["owner"] == "w2" and lease(b)["acquired_at"] == 1191
    assert not cloud.renew_lease(b, "w1", ttl_s=100, now=1192)        # w1 must stop now
    cloud.release_lease(b, "w1")                                      # not ours: untouched
    assert lease(b)["owner"] == "w2" and lease(b)["expires_at"] == 1291
    cloud.release_lease(b, "w2")
    assert lease(b)["released_at"]
    assert cloud.acquire_lease(b, "w3", ttl_s=100)                    # released: free at once


def test_lease_takeover_race_has_one_winner(tmp_path, monkeypatch):
    """Two workers read the same expired lease; the conditional write lets only one through."""
    b = LocalBucket(tmp_path)
    assert cloud.acquire_lease(b, "old", ttl_s=10, now=0)
    stale = b.get_bytes("lease.json")
    real = b.get_bytes
    monkeypatch.setattr(b, "get_bytes", lambda k: stale if k == "lease.json" else real(k))
    results = [cloud.acquire_lease(b, w, ttl_s=100, now=50) for w in ("a", "b")]
    assert results == [True, False]
    monkeypatch.setattr(b, "get_bytes", real)
    assert lease(b)["owner"] == "a"


def test_lease_create_race_has_one_winner(tmp_path, monkeypatch):
    b = LocalBucket(tmp_path)
    real = b.get_bytes
    monkeypatch.setattr(b, "get_bytes", lambda k: None if k == "lease.json" else real(k))   # both saw none
    assert [cloud.acquire_lease(b, w, ttl_s=100, now=0) for w in ("a", "b")] == [True, False]


def test_unreadable_lease_counts_as_expired(tmp_path):
    b = LocalBucket(tmp_path)
    b.put_bytes("lease.json", b"{not json")
    assert cloud.acquire_lease(b, "w", ttl_s=10, now=5) and lease(b)["owner"] == "w"


# --------------------------------------------------------------------------- the command

def test_cli_without_a_bucket(tmp_path, capsys):
    c = cfg(tmp_path, roots=[])
    assert cloud.cli_cloud(c, Store(c.db_path), types.SimpleNamespace(action="status")) == 2
    assert "cloud_url" in capsys.readouterr().out


def test_cli_push_pull_seed_status(lib, tmp_path, capsys):
    c, store, b = lib
    c.extra["cloud_url"] = f"file://{b.root}"
    ns = types.SimpleNamespace
    assert cloud.cli_cloud(c, store, ns(action="push", limit=2)) == 0
    assert "pushed 2 file(s)" in capsys.readouterr().out
    assert cloud.cli_cloud(c, store, ns(action="status")) == 0
    out = capsys.readouterr().out
    assert "no status.json" in out and "lease: none" in out and "3 file(s) not pushed" in out
    b.put_bytes("status.json", json.dumps({
        "finished_at": "2026-11-02T10:00:00+00:00", "host": "worker-1", "counts": {"scored": 12, "reels": 2},
        "tokens": {"used": 150000, "cap": 2000000}, "errors": ["score: timeout"]}).encode())
    cloud.acquire_lease(b, "worker-1:42", ttl_s=600)
    assert cloud.cli_cloud(c, store, ns(action="status")) == 0
    out = capsys.readouterr().out
    assert "2026-11-02T10:00:00+00:00 on worker-1" in out and "scored 12, reels 2" in out
    assert "tokens today: 150000 of 2000000" in out and "score: timeout" in out
    assert "lease: held by worker-1:42" in out
    make_db(c)
    assert cloud.cli_cloud(c, store, ns(action="seed", force=False)) == 0
    b.put_bytes("state/igmp.sqlite", b"x")
    assert cloud.cli_cloud(c, store, ns(action="seed", force=False)) == 1
    assert "refused" in capsys.readouterr().out
    b.put_bytes("outputs/reels/x.mp4", b"reel")
    assert cloud.cli_cloud(c, store, ns(action="pull")) == 0
    assert "pulled 1 output(s)" in capsys.readouterr().out
    assert (c.output_dir / "reels" / "x.mp4").read_bytes() == b"reel"


def test_scan_roots_without_any_root_configured(tmp_path):
    assert cloud.scan_roots(cfg(tmp_path, roots=[])) == []
