from pathlib import Path

from shootflow.ingest import IngestPlan, MediaAsset, build_ingest_plan


def write_file(path: Path, contents: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)


def test_build_ingest_plan_copies_media_into_shoot_folder_without_deletions(tmp_path: Path) -> None:
    source = tmp_path / "sd-card"
    destination = tmp_path / "archive"
    write_file(source / "DCIM" / "100APPLE" / "IMG_0001.CR3", b"raw")
    write_file(source / "DCIM" / "100APPLE" / "IMG_0002.JPG", b"jpeg")
    write_file(source / "PRIVATE" / "M4ROOT" / "CLIP001.MP4", b"video")
    write_file(source / "notes.txt", b"not media")

    plan = build_ingest_plan(
        source_root=source,
        destination_root=destination,
        shoot_name="brooklyn-editorial",
    )

    assert isinstance(plan, IngestPlan)
    assert plan.deletions == []
    assert plan.destination_shoot_root == destination / "brooklyn-editorial"
    assert [asset.relative_path for asset in plan.assets] == [
        Path("DCIM/100APPLE/IMG_0001.CR3"),
        Path("DCIM/100APPLE/IMG_0002.JPG"),
        Path("PRIVATE/M4ROOT/CLIP001.MP4"),
    ]
    assert [action.destination for action in plan.copy_actions] == [
        destination / "brooklyn-editorial" / "raw" / "DCIM" / "100APPLE" / "IMG_0001.CR3",
        destination / "brooklyn-editorial" / "jpeg" / "DCIM" / "100APPLE" / "IMG_0002.JPG",
        destination / "brooklyn-editorial" / "video" / "PRIVATE" / "M4ROOT" / "CLIP001.MP4",
    ]


def test_build_ingest_plan_marks_existing_matching_files_as_verified(tmp_path: Path) -> None:
    source = tmp_path / "sd-card"
    destination = tmp_path / "archive"
    write_file(source / "IMG_0001.RAF", b"fuji raw")
    write_file(destination / "fuji-shoot" / "raw" / "IMG_0001.RAF", b"fuji raw")

    plan = build_ingest_plan(
        source_root=source,
        destination_root=destination,
        shoot_name="fuji-shoot",
    )

    assert plan.copy_actions == []
    assert plan.verified_existing == [
        MediaAsset(
            source_path=source / "IMG_0001.RAF",
            relative_path=Path("IMG_0001.RAF"),
            kind="raw",
            size_bytes=8,
            checksum="059babefc592c22dda28d9553cad371d3ca05c6eb79a0d08cbf88cb798f908b3",
        )
    ]


def test_build_ingest_plan_conflicts_when_destination_has_different_content(tmp_path: Path) -> None:
    source = tmp_path / "sd-card"
    destination = tmp_path / "archive"
    write_file(source / "IMG_0001.DNG", b"new raw")
    write_file(destination / "winter-portraits" / "raw" / "IMG_0001.DNG", b"old raw")

    plan = build_ingest_plan(
        source_root=source,
        destination_root=destination,
        shoot_name="winter-portraits",
    )

    assert plan.copy_actions == []
    assert len(plan.conflicts) == 1
    assert plan.conflicts[0].source == source / "IMG_0001.DNG"
    assert plan.conflicts[0].destination == destination / "winter-portraits" / "raw" / "IMG_0001.DNG"
    assert plan.conflicts[0].reason == "destination exists with different checksum"


def test_build_ingest_plan_rejects_missing_source_root(tmp_path: Path) -> None:
    destination = tmp_path / "archive"

    try:
        build_ingest_plan(
            source_root=tmp_path / "missing-card",
            destination_root=destination,
            shoot_name="missing",
        )
    except FileNotFoundError as error:
        assert "source_root does not exist" in str(error)
    else:
        raise AssertionError("expected missing source root to fail")
