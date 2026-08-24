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
    paths = store.list_snapshots(tmp_path, "AcmeSaaS", "terms", "https://acme.test/terms")
    assert len(paths) == 2
    assert paths[0].name < paths[1].name


def test_latest_two_snapshots_is_none_until_second_capture(tmp_path):
    assert store.latest_two_snapshots(tmp_path, "AcmeSaaS", "terms", "https://acme.test/terms") is None
    snap = {
        "vendor": "AcmeSaaS",
        "page_url": "https://acme.test/terms",
        "page_type": "terms",
        "captured_at": "2026-08-01T00:00:00Z",
        "fetch_status": "ok",
        "sections": [],
    }
    store.save_snapshot(tmp_path, snap)
    assert store.latest_two_snapshots(tmp_path, "AcmeSaaS", "terms", "https://acme.test/terms") is None
    store.save_snapshot(tmp_path, dict(snap, captured_at="2026-08-02T00:00:00Z"))
    assert store.latest_two_snapshots(tmp_path, "AcmeSaaS", "terms", "https://acme.test/terms") is not None


def test_save_snapshot_does_not_overwrite_after_delete(tmp_path):
    snap = {
        "vendor": "AcmeSaaS",
        "page_url": "https://acme.test/terms",
        "page_type": "terms",
        "captured_at": "2026-08-01T00:00:00Z",
        "fetch_status": "ok",
        "sections": [],
    }
    first = store.save_snapshot(tmp_path, snap)
    second = store.save_snapshot(tmp_path, dict(snap, captured_at="2026-08-02T00:00:00Z"))
    third = store.save_snapshot(tmp_path, dict(snap, captured_at="2026-08-03T00:00:00Z"))
    first.unlink()
    fourth = store.save_snapshot(tmp_path, dict(snap, captured_at="2026-08-04T00:00:00Z"))
    assert second.exists()
    assert third.exists()
    assert fourth != second
    assert fourth != third
    remaining = store.list_snapshots(tmp_path, "AcmeSaaS", "terms", "https://acme.test/terms")
    assert [path.name for path in remaining] == [second.name, third.name, fourth.name]


def test_snapshots_for_same_vendor_type_keep_separate_urls(tmp_path):
    base = {
        "vendor": "AcmeSaaS",
        "page_type": "privacy",
        "captured_at": "2026-08-01T00:00:00Z",
        "fetch_status": "ok",
        "sections": [],
    }
    store.save_snapshot(tmp_path, dict(base, page_url="https://acme.test/privacy"))
    store.save_snapshot(tmp_path, dict(base, page_url="https://acme.test/privacy-eu"))
    assert len(store.list_snapshots(tmp_path, "AcmeSaaS", "privacy", "https://acme.test/privacy")) == 1
    assert len(store.list_snapshots(tmp_path, "AcmeSaaS", "privacy", "https://acme.test/privacy-eu")) == 1


def test_lossy_vendor_slugs_do_not_share_a_directory(tmp_path):
    snap = {
        "page_url": "https://acme.test/terms",
        "page_type": "terms",
        "captured_at": "2026-08-01T00:00:00Z",
        "fetch_status": "ok",
        "sections": [],
    }
    store.save_snapshot(tmp_path, dict(snap, vendor="Acme SaaS"))
    store.save_snapshot(tmp_path, dict(snap, vendor="Acme_SaaS"))
    assert len(store.list_snapshots(tmp_path, "Acme SaaS", "terms", "https://acme.test/terms")) == 1
    assert len(store.list_snapshots(tmp_path, "Acme_SaaS", "terms", "https://acme.test/terms")) == 1
