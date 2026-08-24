from pathlib import Path

from dns_diff import build_report, load_snapshot

FIXTURES = Path(__file__).parent / "fixtures"


def snapshot(name: str) -> dict:
    return load_snapshot(FIXTURES / name)


def test_unchanged_is_observed_with_no_changes():
    report = build_report(snapshot("unchanged-before.json"), snapshot("unchanged-after.json"))
    assert report["status"] == "observed"
    assert report["changes"] == []


def test_txt_record_change_is_flagged():
    report = build_report(snapshot("unchanged-before.json"), snapshot("txt-changed-after.json"))
    assert report["status"] == "observed"
    changed = {c["record_type"]: c for c in report["changes"]}
    assert set(changed) == {"TXT"}
    assert changed["TXT"]["change"] == "changed"
    assert "mailer.thirdparty.test" in changed["TXT"]["after"][0]


def test_ns_delegation_change_is_flagged():
    report = build_report(snapshot("unchanged-before.json"), snapshot("delegation-changed-after.json"))
    assert report["status"] == "observed"
    changed = {c["record_type"]: c for c in report["changes"]}
    assert set(changed) == {"NS"}
    assert changed["NS"]["after"] == ["ns1.newregistrar.test.", "ns2.newregistrar.test."]


def test_resolver_disagreement_is_inconclusive_not_unchanged():
    report = build_report(snapshot("unchanged-before.json"), snapshot("disagreement-after.json"))
    assert report["status"] == "inconclusive"
    assert "disagree" in report["reason"]
    assert "changes" not in report


def test_resolver_timeout_is_inconclusive_not_unchanged():
    report = build_report(snapshot("unchanged-before.json"), snapshot("timeout-after.json"))
    assert report["status"] == "inconclusive"
    assert "timeout" in report["reason"]
    assert "changes" not in report


def test_domain_mismatch_is_unknown():
    report = build_report(snapshot("unchanged-before.json"), snapshot("other-domain-after.json"))
    assert report["status"] == "unknown"
    assert report["reason"] == "snapshot domains differ"


def test_added_and_removed_record_types_are_flagged():
    before = snapshot("unchanged-before.json")
    after = snapshot("unchanged-before.json")
    import json

    after = json.loads(json.dumps(after))  # deep copy
    for resolver in after["resolvers"]:
        del resolver["records"]["MX"]
        resolver["records"]["CAA"] = ["0 issue \"letsencrypt.org\""]
    report = build_report(before, after)
    by_change = {c["record_type"]: c["change"] for c in report["changes"]}
    assert by_change == {"MX": "removed", "CAA": "added"}
