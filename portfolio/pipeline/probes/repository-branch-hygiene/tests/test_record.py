from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fixture_repo import build  # noqa: E402
from record import build_manifest, render_markdown  # noqa: E402
from scanner import Classification, classify_repo  # noqa: E402


@pytest.fixture(scope="module")
def manifest(tmp_path_factory):
    fixture = build(tmp_path_factory.mktemp("record"))
    classifications = classify_repo(
        fixture.repo, protected=fixture.protected, recorded_tips=fixture.recorded_tips
    )
    return build_manifest(classifications, generated_at="2026-08-24T00:00:00+00:00")


def test_every_ref_carries_a_recommended_action(manifest):
    for entry in manifest["refs"]:
        assert entry["recommended_action"]


def test_no_action_says_delete(manifest):
    """The candidate's boundary: the report never recommends a deletion, only
    a review. A future gated deletion step is out of this probe's scope.
    """
    for entry in manifest["refs"]:
        assert "delete" not in entry["recommended_action"].lower()


def test_unique_refs_list_their_commits_for_recovery(manifest):
    unique = [e for e in manifest["refs"] if e["category"] in ("unique", "moved")]
    assert unique
    for entry in unique:
        assert entry["unique_commits"], f"{entry['ref']} has no recovery commit list"


def test_markdown_renders_every_ref(manifest):
    md = render_markdown(manifest)
    for entry in manifest["refs"]:
        assert f"`{entry['ref']}`" in md


def test_markdown_states_the_read_only_and_race_caveats(manifest):
    md = render_markdown(manifest)
    assert "no ref was deleted" in md
    assert "re-check immediately before any deletion" in md


def test_diverged_copies_surface_in_the_report():
    c = Classification(
        ref="topic",
        sha="a" * 40,
        origin="local",
        category="unique",
        reason="test",
        unique_commits=("a" * 40,),
        diverged_copies=("origin=" + "b" * 40,),
    )
    md = render_markdown(build_manifest([c], generated_at="2026-08-24T00:00:00+00:00"))
    assert "copies at a different tip" in md
    assert "b" * 40 in md
