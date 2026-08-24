from vendor_watch import store


def test_add_watch_is_idempotent(tmp_path):
    store.add_watch(tmp_path, "AcmeSaaS", "https://acme.test/terms", "terms")
    store.add_watch(tmp_path, "AcmeSaaS", "https://acme.test/terms", "terms")
    assert len(store.load_watchlist(tmp_path)) == 1


def test_remove_watch_returns_false_when_not_found(tmp_path):
    assert store.remove_watch(tmp_path, "Nobody", "https://x.test", "terms") is False


def test_remove_watch_removes_matching_entry(tmp_path):
    store.add_watch(tmp_path, "AcmeSaaS", "https://acme.test/terms", "terms")
    assert store.remove_watch(tmp_path, "AcmeSaaS", "https://acme.test/terms", "terms") is True
    assert store.load_watchlist(tmp_path) == []


def test_save_snapshot_and_list_snapshots_are_sorted_by_filename(tmp_path):
    snap1 = {
        "vendor": "AcmeSaaS",
        "page_url": "https://acme.test/terms",
        "page_type": "terms",
        "captured_at": "2026-08-01T00:00:00Z",
        "fetch_status": "ok",
        "sections": [],
    }
    snap2 = dict(snap1, captured_at="2026-08-02T00:00:00Z")
    store.save_snapshot(tmp_path, snap1)
    store.save_snapshot(tmp_path, snap2)
    paths = store.list_snapshots(tmp_path, "AcmeSaaS", "terms")
    assert len(paths) == 2
    assert paths[0].name < paths[1].name


def test_latest_two_snapshots_is_none_until_second_capture(tmp_path):
    assert store.latest_two_snapshots(tmp_path, "AcmeSaaS", "terms") is None
    snap = {
        "vendor": "AcmeSaaS",
        "page_url": "https://acme.test/terms",
        "page_type": "terms",
        "captured_at": "2026-08-01T00:00:00Z",
        "fetch_status": "ok",
        "sections": [],
    }
    store.save_snapshot(tmp_path, snap)
    assert store.latest_two_snapshots(tmp_path, "AcmeSaaS", "terms") is None
    store.save_snapshot(tmp_path, dict(snap, captured_at="2026-08-02T00:00:00Z"))
    assert store.latest_two_snapshots(tmp_path, "AcmeSaaS", "terms") is not None
