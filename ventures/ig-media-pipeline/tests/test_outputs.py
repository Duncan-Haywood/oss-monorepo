from pathlib import Path

import pytest

from igmp import outputs, reels
from igmp.config import Config
from igmp.store import Store


@pytest.fixture
def drive(tmp_path, monkeypatch):
    """output_dir on a fake external volume that can be unplugged."""
    vol = tmp_path / "Volumes" / "Extreme SSD"
    state = {"mounted": False}
    monkeypatch.setattr(outputs, "volume_root", lambda p: vol)
    monkeypatch.setattr(outputs, "_mounted", lambda v: state["mounted"])
    c = Config(library_roots=[], output_dir=vol / "IG", extra={"state_dir": str(tmp_path / "state")})

    def plug(on=True):
        state["mounted"] = on
        if on:
            vol.mkdir(parents=True, exist_ok=True)
    return c, plug


def test_volume_root():
    assert outputs.volume_root(Path("/Volumes/Extreme SSD/IG/reels")) == Path("/Volumes/Extreme SSD")
    assert outputs.volume_root(Path("/Users/me/IG")) is None


def test_outputs_on_the_system_disk_are_always_online(tmp_path):
    c = Config(library_roots=[], output_dir=tmp_path / "IG")
    assert outputs.output_online(c) and outputs.out_path(c, "reels") == tmp_path / "IG" / "reels"


def test_every_output_builder_uses_the_outbox_while_the_drive_is_away(drive):
    from igmp import astro, carousels, editing
    from igmp.models import Asset
    c, plug = drive
    box = c.state_dir / "outbox"
    a = Asset(id="a", kind="photo", files=[], date_label="2026-10-03", location="Boulder")
    group = type("G", (), {"event_key": "2026-10-03_Boulder"})()
    assert reels.out_folder(c, "2026-10-03_Boulder", "short", True) == box / "reels" / "2026-10-03_Boulder"
    assert reels.out_folder(c, "k", "short", False) == box / "reels" / "_needs-attention" / "k"
    assert editing.edit_dir(c, a) == box / "photos" / "2026-10-03_Boulder"
    assert astro.out_dir(group, c) == box / "photos" / "2026-10-03_Boulder" / "astro"
    assert carousels._destinations(c, "e__01")["shipped"] == box / "carousels" / "e" / "e__01"
    assert outputs.work_cwd(c) == c.state_dir
    plug()
    assert reels.out_folder(c, "k", "short", True) == c.output_dir / "reels" / "k"
    assert editing.edit_dir(c, a) == c.output_dir / "photos" / "2026-10-03_Boulder"
    assert outputs.work_cwd(c) == c.output_dir


def test_ready_index_goes_to_the_outbox(drive):
    from igmp import ready
    c, _ = drive
    out = ready.write(c, [])
    assert Path(out["csv"]).parent == c.state_dir / "outbox" / "ready"


def test_sync_moves_the_outbox_and_rewrites_records(drive):
    c, plug = drive
    store = Store(c.db_path)
    folder = reels.out_folder(c, "e", "short", True)
    folder.mkdir(parents=True)
    video = folder / "e__short-01.mp4"
    video.write_bytes(b"v" * 1000)
    (folder / ".e__short-01.mp4.tmp").write_bytes(b"half")           # a write in progress: left alone
    store.put("reels", "e__short-01", {"video": str(video), "plan": {"title": "t"},
                                        "covers": [str(folder / "e__short-01.jpg")]})
    store.put("scores", "x", {"note": str(video)})                     # not an output table: untouched

    assert outputs.sync(c, store) == {"moved": 0, "failed": 0, "records": 0, "waiting": 1}
    assert video.exists()

    plug()
    res = outputs.sync(c, store)
    final = c.output_dir / "reels" / "e" / "e__short-01.mp4"
    assert res == {"moved": 1, "failed": 0, "records": 1, "waiting": 0}
    assert final.read_bytes() == b"v" * 1000 and not video.exists()
    rec = store.get("reels", "e__short-01")
    assert rec["video"] == str(final) and rec["plan"] == {"title": "t"}
    assert rec["covers"] == [str(folder / "e__short-01.jpg")]          # never written: left as it was
    assert store.get("scores", "x") == {"note": str(video)}
    assert (folder / ".e__short-01.mp4.tmp").exists()
    assert outputs.sync(c, store)["moved"] == 0


def test_sync_replaces_an_older_copy_and_keeps_failures_in_the_outbox(drive, monkeypatch):
    c, plug = drive
    plug()
    old = c.output_dir / "photos" / "e" / "a.jpg"
    old.parent.mkdir(parents=True)
    old.write_bytes(b"old")
    box = c.state_dir / "outbox" / "photos" / "e"
    box.mkdir(parents=True)
    (box / "a.jpg").write_bytes(b"newer")
    (box / "b.jpg").write_bytes(b"bbb")
    real = outputs.shutil.copyfile
    monkeypatch.setattr(outputs.os, "replace", lambda a, b: (_ for _ in ()).throw(OSError(18, "EXDEV"))
                        if not Path(a).name.startswith(".") else __import__("os").rename(a, b))

    def short(src, dst):
        real(src, dst)
        if Path(src).name == "b.jpg":
            Path(dst).write_bytes(b"b")                                  # a truncated copy
    monkeypatch.setattr(outputs.shutil, "copyfile", short)
    res = outputs.sync(c)
    assert (res["moved"], res["failed"]) == (1, 1)
    assert old.read_bytes() == b"newer" and (box / "b.jpg").exists()
    assert not (c.output_dir / "photos" / "e" / "b.jpg").exists()
    assert not [p for p in old.parent.iterdir() if p.name.startswith(".")]


def test_cli_syncs_before_every_command(drive, tmp_path, monkeypatch):
    from igmp import cli
    c, plug = drive
    plug()
    box = c.state_dir / "outbox" / "ready"
    box.mkdir(parents=True)
    (box / "index.csv").write_text("queue\n")
    monkeypatch.setattr(cli.config, "load", lambda path: c)
    assert cli.main(["status"]) == 0
    assert (c.output_dir / "ready" / "index.csv").read_text() == "queue\n" and not (box / "index.csv").exists()
    assert cli.main(["sync-outputs"]) == 0
