"""igmp plan / --dry-run: reports reads, writes and Claude calls, and writes nothing anywhere."""
from __future__ import annotations

from pathlib import Path

from igmp import catalog, cli
from igmp.models import Metrics, Point, Score
from igmp.store import Store


def setup(tmp_path: Path, fake_rawtherapee: Path) -> tuple[Path, Path]:
    lib = tmp_path / "Library"
    lib.mkdir()
    for i in range(4):
        for ext in ("JPG", "ARW"):
            (lib / f"2026-10-10_17000{i}_Harbor_Party_A7RV_DSC0000{i}.{ext}").write_bytes(b"x")
    (lib / "2026-10-10_171000_Harbor_Party_Pocket3_DJI-0001.MP4").write_bytes(b"x")
    settings = tmp_path / "config.toml"
    settings.write_text(f'library_roots = ["{lib}"]\noutput_dir = "{tmp_path / "out"}"\n'
                        f'backend = "api"\nrawtherapee_cli = "{fake_rawtherapee}"\n')
    return lib, settings


def score(value: float) -> Score:
    return Score(score=value, keep=True, role="moment", subject="harbor", mood="calm",
                 vertical_focus=Point(x=0.5, y=0.5), feed_focus=Point(x=0.5, y=0.5))


def section(out: str, stage: str) -> str:
    """One stage's block of the plan: its indented lines up to the next stage."""
    lines = []
    for line in out.split(f"\n  {stage}\n", 1)[1].splitlines():
        if not line.startswith("    "):
            break
        lines.append(line)
    return "\n".join(lines)


def test_first_plan_writes_nothing(tmp_path, fake_rawtherapee, library_tree, capsys):
    lib, settings = setup(tmp_path, fake_rawtherapee)
    before = library_tree(tmp_path)
    assert cli.main(["plan", "--config", str(settings)]) == 0
    out = capsys.readouterr().out
    assert "Found 5 asset(s): 4 photo, 1 video in 1 event(s)" in out
    assert "will be created" in out and "state: none yet" in out
    assert "Claude  0-5 call(s)" in section(out, "score")    # up to one per asset; the prefilter decides
    # the metadata refresh puts XMP sidecars beside the originals: the plan says so
    assert "up to 5 XMP sidecar(s) <name>.xmp beside their originals" in section(out, "tag")
    assert library_tree(tmp_path) == before                  # not even output_dir was created


def test_plan_counts_remaining_work_from_the_state_database(tmp_path, fake_rawtherapee, library_tree, capsys):
    lib, settings = setup(tmp_path, fake_rawtherapee)
    store = Store(tmp_path / "out" / "state" / "igmp.sqlite")
    assets = catalog.scan([lib])
    photos = sorted((a for a in assets if a.kind == "photo"), key=lambda a: a.id)
    for a in assets:
        store.put("assets", a.id, a)
        store.put("metrics", a.id, Metrics(asset_id=a.id, sharpness=300, brightness=0.4, clipped_high=0,
                                           clipped_low=0, dhash="0" * 16, candidate=a.kind == "photo"))
    store.put("scores", photos[0].id, score(8))
    store.put("scores", photos[1].id, score(7))
    store.db.close()

    before = library_tree(tmp_path)
    assert cli.main(["plan", "--config", str(settings)]) == 0
    out = capsys.readouterr().out
    assert f"state: {tmp_path / 'out' / 'state' / 'igmp.sqlite'}" in out
    assert "Claude  2 call(s)" in section(out, "score")      # two candidates not scored yet
    assert "Claude  5+" in section(out, "edit")             # 1 curation + 2 x (director + critic), more after scoring
    assert library_tree(tmp_path) == before                  # read without journals, locks or -wal/-shm files

    assert cli.main(["edit", "--dry-run", "--config", str(settings)]) == 0
    out = capsys.readouterr().out
    assert "\n  edit\n" in out and "\n  reels\n" not in out and "\n  score\n" not in out
    assert "Claude  5-9 call(s)" in section(out, "edit")     # up to two critic revisions each
    assert library_tree(tmp_path) == before


def test_plan_says_when_a_tool_is_missing(tmp_path, fake_rawtherapee, capsys):
    lib, settings = setup(tmp_path, fake_rawtherapee)
    settings.write_text(settings.read_text().replace(str(fake_rawtherapee), str(tmp_path / "nope")))
    assert cli.main(["edit", "--dry-run", "--config", str(settings)]) == 0
    assert "rawtherapee-cli not found" in capsys.readouterr().out


def test_unsafe_settings_stop_every_command(tmp_path, fake_rawtherapee, capsys):
    lib, settings = setup(tmp_path, fake_rawtherapee)
    settings.write_text(settings.read_text().replace(str(tmp_path / "out"), str(lib / "IG")))
    for command in ("plan", "run", "scan", "verify-library"):
        assert cli.main([command, "--config", str(settings)]) == 2
    assert "refusing to start" in capsys.readouterr().err
    assert not (lib / "IG").exists()
