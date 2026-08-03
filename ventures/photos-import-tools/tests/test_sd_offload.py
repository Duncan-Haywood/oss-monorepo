"""Contracts for the SD offload verification manifest.

The manifest is the artifact a person reads before erasing a camera card, so
the word "verified" in it has to mean the copy was read back and matched. These
tests exist because it once meant only that the two files had the same byte
count, and the digest helper that could have proved more was defined and never
called.
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from sd_offload import (
    CardSpec,
    OffloadStats,
    offload_card,
    sha256_file,
    verify_and_manifest,
)


def _card(tmp_path: Path) -> CardSpec:
    (tmp_path / "source" / "DCIM").mkdir(parents=True)
    (tmp_path / "dest" / "DCIM").mkdir(parents=True)
    return CardSpec(
        name="TestCard",
        source=tmp_path / "source",
        dest=tmp_path / "dest",
        include_paths=("DCIM",),
    )


def _run(card: CardSpec, tmp_path: Path):
    stats = OffloadStats(card=card.name)
    manifest_path = tmp_path / "manifest.json"
    with patch("sd_offload.evict", return_value=True) as evicted:
        verify_and_manifest(card, stats, manifest_path, tmp_path / "log.txt")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = {e["relative_path"]: e for e in manifest["files"]}
    return stats, entries, evicted


def test_same_size_different_content_is_not_verified(tmp_path):
    """The defect this suite exists for: equal length is not equal content."""
    card = _card(tmp_path)
    (card.source / "DCIM" / "img.JPG").write_bytes(b"AAAAAAAAAA")
    (card.dest / "DCIM" / "img.JPG").write_bytes(b"BBBBBBBBBB")

    stats, entries, evicted = _run(card, tmp_path)

    assert entries["DCIM/img.JPG"]["status"] == "checksum_mismatch"
    assert stats.verified_files == 0
    assert any("Checksum mismatch: DCIM/img.JPG" in e for e in stats.errors)
    # A file that failed verification must keep its local copy.
    evicted.assert_not_called()


def test_verified_file_records_matching_digests_on_both_sides(tmp_path):
    card = _card(tmp_path)
    payload = b"intact camera original"
    (card.source / "DCIM" / "img.JPG").write_bytes(payload)
    (card.dest / "DCIM" / "img.JPG").write_bytes(payload)

    stats, entries, evicted = _run(card, tmp_path)
    entry = entries["DCIM/img.JPG"]

    assert entry["status"] == "verified"
    assert stats.verified_files == 1
    assert stats.errors == []
    expected = sha256_file(card.source / "DCIM" / "img.JPG")
    assert entry["source_sha256"] == expected
    assert entry["dest_sha256"] == expected
    evicted.assert_called_once_with(card.dest / "DCIM" / "img.JPG")


def test_missing_and_size_mismatch_are_still_distinguished(tmp_path):
    card = _card(tmp_path)
    (card.source / "DCIM" / "gone.JPG").write_bytes(b"1234567890")
    (card.source / "DCIM" / "short.JPG").write_bytes(b"1234567890")
    (card.dest / "DCIM" / "short.JPG").write_bytes(b"12345")

    stats, entries, _ = _run(card, tmp_path)

    assert entries["DCIM/gone.JPG"]["status"] == "missing"
    assert entries["DCIM/short.JPG"]["status"] == "size_mismatch"
    # A size mismatch is settled without hashing either side.
    assert "source_sha256" not in entries["DCIM/short.JPG"]
    assert stats.verified_files == 0
    assert len(stats.errors) == 2


def test_unverified_count_reports_copies_that_failed_verification(tmp_path):
    """`skipped_files` was unreachable and therefore always zero."""
    card = _card(tmp_path)
    (card.source / "DCIM" / "ok.JPG").write_bytes(b"AAAA")
    (card.dest / "DCIM" / "ok.JPG").write_bytes(b"AAAA")
    (card.source / "DCIM" / "bad.JPG").write_bytes(b"AAAA")
    (card.dest / "DCIM" / "bad.JPG").write_bytes(b"BBBB")
    (card.source / "DCIM" / "gone.JPG").write_bytes(b"AAAA")

    stats, _, _ = _run(card, tmp_path)

    assert stats.copied_files == 2  # present at destination
    assert stats.verified_files == 1
    assert stats.unverified_files == 1  # copied but not proven intact


def test_unreadable_source_is_an_error_not_a_verification(tmp_path):
    card = _card(tmp_path)
    (card.source / "DCIM" / "img.JPG").write_bytes(b"AAAA")
    (card.dest / "DCIM" / "img.JPG").write_bytes(b"AAAA")

    stats = OffloadStats(card=card.name)
    manifest_path = tmp_path / "manifest.json"
    with patch("sd_offload.evict", return_value=True), patch(
        "sd_offload.sha256_file", side_effect=OSError("input/output error")
    ):
        verify_and_manifest(card, stats, manifest_path, tmp_path / "log.txt")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["files"][0]["status"] == "unreadable"
    assert stats.verified_files == 0
    assert any("Unreadable during verification" in e for e in stats.errors)


def test_offload_does_not_evict_before_the_copy_is_verified(tmp_path):
    """Eviction used to run over the whole tree straight after rsync.

    That is what forced verification down to a size check: an evicted iCloud
    file still reports its size, so the only check the code could afford was
    the only one that could not detect corruption.
    """
    card = _card(tmp_path)
    (card.source / "DCIM" / "ok.JPG").write_bytes(b"AAAA")
    (card.dest / "DCIM" / "ok.JPG").write_bytes(b"AAAA")
    (card.source / "DCIM" / "corrupt.JPG").write_bytes(b"AAAA")
    (card.dest / "DCIM" / "corrupt.JPG").write_bytes(b"BBBB")

    with patch("sd_offload.rsync_copy", return_value=0), patch(
        "sd_offload.wait_for_disk_space", return_value=None
    ), patch("sd_offload.evict", return_value=True) as evicted:
        stats = offload_card(card, tmp_path / "log.txt", tmp_path / "manifest.json")

    assert stats.verified_files == 1
    assert stats.unverified_files == 1
    # Only the file that was proven intact may be evicted.
    assert evicted.call_args_list == [((card.dest / "DCIM" / "ok.JPG",), {})]


def test_manifest_never_calls_a_file_verified_without_a_digest(tmp_path):
    """A whole-manifest invariant, so a new status cannot reintroduce the bug."""
    card = _card(tmp_path)
    (card.source / "DCIM" / "a.JPG").write_bytes(b"AAAA")
    (card.dest / "DCIM" / "a.JPG").write_bytes(b"AAAA")
    (card.source / "DCIM" / "b.JPG").write_bytes(b"AAAA")
    (card.dest / "DCIM" / "b.JPG").write_bytes(b"BBBB")
    (card.source / "DCIM" / "c.JPG").write_bytes(b"AAAAA")
    (card.dest / "DCIM" / "c.JPG").write_bytes(b"AA")

    _, entries, _ = _run(card, tmp_path)

    for entry in entries.values():
        if entry["status"] == "verified":
            assert entry["source_sha256"] == entry["dest_sha256"]
            assert len(entry["source_sha256"]) == 64


@pytest.mark.parametrize("chunked", [b"", b"x", b"y" * (1024 * 1024 + 7)])
def test_sha256_file_matches_hashlib_across_chunk_boundaries(tmp_path, chunked):
    import hashlib

    target = tmp_path / "blob.bin"
    target.write_bytes(chunked)
    assert sha256_file(target) == hashlib.sha256(chunked).hexdigest()
