import json

from vendor_watch import store

URL = "https://acme.test/terms"


def _snapshot(**overrides):
    base = {
        "vendor": "AcmeSaaS",
        "page_url": URL,
        "page_type": "terms",
        "captured_at": "2026-08-01T00:00:00Z",
        "fetch_status": "ok",
        "sections": [],
    }
    base.update(overrides)
    return base


def test_add_watch_is_idempotent(tmp_path):
    store.add_watch(tmp_path, "AcmeSaaS", URL, "terms")
    store.add_watch(tmp_path, "AcmeSaaS", URL, "terms")
    assert len(store.load_watchlist(tmp_path)) == 1


def test_remove_watch_returns_false_when_not_found(tmp_path):
    assert store.remove_watch(tmp_path, "Nobody", "https://x.test", "terms") is False


def test_remove_watch_removes_matching_entry(tmp_path):
    store.add_watch(tmp_path, "AcmeSaaS", URL, "terms")
    assert store.remove_watch(tmp_path, "AcmeSaaS", URL, "terms") is True
    assert store.load_watchlist(tmp_path) == []


def test_save_snapshot_and_list_snapshots_are_sorted_by_filename(tmp_path):
    snap1 = _snapshot(captured_at="2026-08-01T00:00:00Z")
    snap2 = _snapshot(captured_at="2026-08-02T00:00:00Z")
    store.save_snapshot(tmp_path, snap1)
    store.save_snapshot(tmp_path, snap2)
    paths = store.list_snapshots(tmp_path, "AcmeSaaS", "terms", URL)
    assert len(paths) == 2
    assert paths[0].name < paths[1].name


def test_latest_two_snapshots_is_none_until_second_capture(tmp_path):
    assert store.latest_two_snapshots(tmp_path, "AcmeSaaS", "terms", URL) is None
    store.save_snapshot(tmp_path, _snapshot(captured_at="2026-08-01T00:00:00Z"))
    assert store.latest_two_snapshots(tmp_path, "AcmeSaaS", "terms", URL) is None
    store.save_snapshot(tmp_path, _snapshot(captured_at="2026-08-02T00:00:00Z"))
    assert store.latest_two_snapshots(tmp_path, "AcmeSaaS", "terms", URL) is not None


def test_save_snapshot_does_not_overwrite_after_a_gap_from_deletion(tmp_path):
    """A count-based sequence number reuses a slot after a file is deleted,
    silently overwriting a remaining snapshot -- the sequence must instead
    be one past the highest surviving sequence number."""
    store.save_snapshot(tmp_path, _snapshot(captured_at="2026-08-01T00:00:00Z"))
    second = store.save_snapshot(tmp_path, _snapshot(captured_at="2026-08-02T00:00:00Z"))
    third_before_delete = store.save_snapshot(tmp_path, _snapshot(captured_at="2026-08-03T00:00:00Z"))
    third_content = json.loads(third_before_delete.read_text())

    second.unlink()  # simulates the documented `rm` retention workflow

    store.save_snapshot(tmp_path, _snapshot(captured_at="2026-08-04T00:00:00Z"))

    # The third snapshot must survive untouched -- its filename must not have
    # been reused by the newly-saved fourth one.
    assert third_before_delete.exists()
    assert json.loads(third_before_delete.read_text()) == third_content


def test_snapshot_storage_does_not_collide_across_urls_sharing_vendor_and_type(tmp_path):
    """Two different watched URLs for the same vendor/page_type must not
    interleave in the same snapshot history."""
    url_a = "https://acme.test/terms"
    url_b = "https://acme.test/terms-eu"
    store.save_snapshot(tmp_path, _snapshot(page_url=url_a, captured_at="2026-08-01T00:00:00Z"))
    store.save_snapshot(tmp_path, _snapshot(page_url=url_b, captured_at="2026-08-01T00:00:00Z"))
    store.save_snapshot(tmp_path, _snapshot(page_url=url_a, captured_at="2026-08-02T00:00:00Z"))

    assert len(store.list_snapshots(tmp_path, "AcmeSaaS", "terms", url_a)) == 2
    assert len(store.list_snapshots(tmp_path, "AcmeSaaS", "terms", url_b)) == 1
