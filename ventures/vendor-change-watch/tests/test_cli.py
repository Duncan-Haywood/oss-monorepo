from vendor_watch import cli, snapshot, usage


def run(monkeypatch, tmp_path, args, html_by_call=None):
    calls = {"n": 0}
    html_by_call = html_by_call or []

    def fake_fetch_page(url, timeout=15.0):
        idx = calls["n"]
        calls["n"] += 1
        html = html_by_call[idx] if idx < len(html_by_call) else html_by_call[-1]
        return snapshot.FetchResult(fetch_status="ok", html=html, http_status=200)

    monkeypatch.setattr(cli.snapshot, "fetch_page", fake_fetch_page)
    return cli.main(["--data-dir", str(tmp_path), *args])


def test_add_list_and_remove_roundtrip(tmp_path, capsys):
    assert cli.main(["--data-dir", str(tmp_path), "add", "--vendor", "AcmeSaaS", "--url", "https://acme.test/terms", "--type", "terms"]) == 0
    out = capsys.readouterr().out
    assert "Watching AcmeSaaS" in out

    assert cli.main(["--data-dir", str(tmp_path), "list"]) == 0
    out = capsys.readouterr().out
    assert "AcmeSaaS" in out
    assert "https://acme.test/terms" in out

    assert cli.main(["--data-dir", str(tmp_path), "remove", "--vendor", "AcmeSaaS", "--url", "https://acme.test/terms", "--type", "terms"]) == 0
    assert cli.main(["--data-dir", str(tmp_path), "list"]) == 0
    out = capsys.readouterr().out
    assert "No vendors watched yet" in out


def test_check_first_run_has_nothing_to_compare(monkeypatch, tmp_path, capsys):
    cli.main(["--data-dir", str(tmp_path), "add", "--vendor", "AcmeSaaS", "--url", "https://acme.test/terms", "--type", "terms"])
    exit_code = run(monkeypatch, tmp_path, ["check"], html_by_call=["<h1>Intro</h1><p>hello</p>"])
    assert exit_code == 0
    out = capsys.readouterr().out
    assert "First snapshot captured" in out


def test_check_second_run_reports_a_change(monkeypatch, tmp_path, capsys):
    cli.main(["--data-dir", str(tmp_path), "add", "--vendor", "AcmeSaaS", "--url", "https://acme.test/terms", "--type", "terms"])
    run(monkeypatch, tmp_path, ["check"], html_by_call=["<h1>Intro</h1><p>hello</p>"])
    capsys.readouterr()
    exit_code = run(monkeypatch, tmp_path, ["check"], html_by_call=["<h1>Intro</h1><p>hello, updated</p>"])
    assert exit_code == 0
    out = capsys.readouterr().out
    assert "section(s) changed" in out
    assert "not legal advice" in out

    totals = usage.summarize(tmp_path)
    assert totals.get("change_detected") == 1
    assert totals.get("check_run") == 2


def test_check_unchanged_page_reports_no_change(monkeypatch, tmp_path, capsys):
    cli.main(["--data-dir", str(tmp_path), "add", "--vendor", "AcmeSaaS", "--url", "https://acme.test/terms", "--type", "terms"])
    run(monkeypatch, tmp_path, ["check"], html_by_call=["<h1>Intro</h1><p>hello</p>"])
    capsys.readouterr()
    exit_code = run(monkeypatch, tmp_path, ["check"], html_by_call=["<h1>Intro</h1><p>hello</p>"])
    assert exit_code == 0
    out = capsys.readouterr().out
    assert "No change detected" in out


def test_report_without_two_snapshots_fails_cleanly(tmp_path, capsys):
    cli.main(["--data-dir", str(tmp_path), "add", "--vendor", "AcmeSaaS", "--url", "https://acme.test/terms", "--type", "terms"])
    exit_code = cli.main(["--data-dir", str(tmp_path), "report", "--vendor", "AcmeSaaS", "--type", "terms"])
    assert exit_code == 1
    err = capsys.readouterr().err
    assert "Fewer than two snapshots" in err


def test_report_with_no_watch_at_all_fails_cleanly(tmp_path, capsys):
    exit_code = cli.main(["--data-dir", str(tmp_path), "report", "--vendor", "AcmeSaaS", "--type", "terms"])
    assert exit_code == 1
    err = capsys.readouterr().err
    assert "No watch found" in err


def test_report_with_ambiguous_vendor_type_requires_url(monkeypatch, tmp_path, capsys):
    url_a = "https://acme.test/terms"
    url_b = "https://acme.test/terms-eu"
    cli.main(["--data-dir", str(tmp_path), "add", "--vendor", "AcmeSaaS", "--url", url_a, "--type", "terms"])
    cli.main(["--data-dir", str(tmp_path), "add", "--vendor", "AcmeSaaS", "--url", url_b, "--type", "terms"])
    capsys.readouterr()

    exit_code = cli.main(["--data-dir", str(tmp_path), "report", "--vendor", "AcmeSaaS", "--type", "terms"])
    assert exit_code == 1
    err = capsys.readouterr().err
    assert "Multiple URLs are watched" in err
    assert url_a in err
    assert url_b in err

    run(monkeypatch, tmp_path, ["check"], html_by_call=["<h1>Intro</h1><p>hello</p>"])
    run(monkeypatch, tmp_path, ["check"], html_by_call=["<h1>Intro</h1><p>hello, updated</p>"])
    capsys.readouterr()

    exit_code = cli.main(
        ["--data-dir", str(tmp_path), "report", "--vendor", "AcmeSaaS", "--type", "terms", "--url", url_a]
    )
    assert exit_code == 0
    out = capsys.readouterr().out
    assert "section(s) changed" in out


def test_usage_command_reports_local_only_counts(monkeypatch, tmp_path, capsys):
    cli.main(["--data-dir", str(tmp_path), "add", "--vendor", "AcmeSaaS", "--url", "https://acme.test/terms", "--type", "terms"])
    run(monkeypatch, tmp_path, ["check"], html_by_call=["<h1>Intro</h1><p>hello</p>"])
    capsys.readouterr()
    assert cli.main(["--data-dir", str(tmp_path), "usage"]) == 0
    out = capsys.readouterr().out
    assert "watch_added: 1" in out
    assert "check_run: 1" in out
