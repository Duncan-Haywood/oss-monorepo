import pytest

from vendor_watch import usage


def test_record_event_and_summarize_round_trip(tmp_path):
    usage.record_event(tmp_path, "watch_added", "2026-08-24T00:00:00Z")
    usage.record_event(tmp_path, "check_run", "2026-08-24T00:00:01Z")
    usage.record_event(tmp_path, "check_run", "2026-08-24T00:00:02Z")
    totals = usage.summarize(tmp_path)
    assert totals == {"watch_added": 1, "check_run": 2}


def test_record_event_rejects_unknown_event(tmp_path):
    with pytest.raises(ValueError, match="unknown event"):
        usage.record_event(tmp_path, "vendor_name_leaked", "2026-08-24T00:00:00Z")


def test_disabled_via_env_var_writes_nothing(tmp_path, monkeypatch):
    monkeypatch.setenv("VENDOR_WATCH_NO_TELEMETRY", "1")
    usage.record_event(tmp_path, "watch_added", "2026-08-24T00:00:00Z")
    assert not (tmp_path / usage.EVENTS_FILENAME).exists()


def test_summarize_on_empty_dir_returns_empty(tmp_path):
    assert usage.summarize(tmp_path) == {}
