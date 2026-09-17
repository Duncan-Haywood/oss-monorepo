import urllib.error

from vendor_watch.snapshot import FetchResult, build_snapshot, extract_sections, fetch_page

SAMPLE_HTML = """
<html><head><title>Terms</title><style>.x{color:red}</style></head>
<body>
<h1>Introduction</h1>
<p>We provide a service.</p>
<h2>Subprocessors</h2>
<p>We use  Acme  Cloud and   Beta Mail.</p>
<script>console.log('ignored')</script>
<h2>Notification</h2>
<p>We will notify you 30 days in advance.</p>
</body></html>
"""


def test_extract_sections_groups_text_under_nearest_heading():
    sections = extract_sections(SAMPLE_HTML)
    by_heading = {s["heading"]: s["text"] for s in sections}
    assert by_heading["Introduction"] == "We provide a service."
    assert "Acme Cloud" in by_heading["Subprocessors"]
    assert "Notification" in by_heading
    assert "ignored" not in by_heading.get("Notification", "")
    assert "ignored" not in " ".join(by_heading.values())


def test_extract_sections_with_no_headings_falls_back_to_page_bucket():
    sections = extract_sections("<html><body><p>Just text, no headings.</p></body></html>")
    assert len(sections) == 1
    assert sections[0]["heading"] == "(page)"
    assert "Just text" in sections[0]["text"]


def test_fetch_page_classifies_http_403_and_429_as_blocked(monkeypatch):
    def raise_403(*_args, **_kwargs):
        raise urllib.error.HTTPError("https://x.test", 403, "Forbidden", {}, None)

    monkeypatch.setattr("urllib.request.urlopen", raise_403)
    result = fetch_page("https://x.test")
    assert result.fetch_status == "blocked"
    assert result.http_status == 403


def test_fetch_page_classifies_network_error(monkeypatch):
    def raise_url_error(*_args, **_kwargs):
        raise urllib.error.URLError("no route to host")

    monkeypatch.setattr("urllib.request.urlopen", raise_url_error)
    result = fetch_page("https://x.test")
    assert result.fetch_status.startswith("error:")


def test_build_snapshot_uses_ok_fetch_result_sections():
    fetch_result = FetchResult(fetch_status="ok", html=SAMPLE_HTML, http_status=200)
    snap = build_snapshot("AcmeSaaS", "https://acme.test/terms", "terms", "2026-08-24T00:00:00Z", fetch_result)
    assert snap["fetch_status"] == "ok"
    assert snap["vendor"] == "AcmeSaaS"
    headings = {s["heading"] for s in snap["sections"]}
    assert "Subprocessors" in headings


def test_build_snapshot_records_empty_sections_on_failed_fetch():
    fetch_result = FetchResult(fetch_status="blocked", http_status=403)
    snap = build_snapshot("AcmeSaaS", "https://acme.test/terms", "terms", "2026-08-24T00:00:00Z", fetch_result)
    assert snap["fetch_status"] == "blocked"
    assert snap["sections"] == []
