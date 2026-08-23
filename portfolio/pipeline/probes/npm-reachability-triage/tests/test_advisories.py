"""Behaviour of OSV/npm-bulk record normalisation.

The one decision worth pinning here is the withdrawn-advisory filter: OSV
sets ``withdrawn`` when the database retracts a record outright, and a
retracted record matched against a live lockfile is not a finding. Found by
hand-verifying GHSA-gv7w-rqvm-qjhr, which OSV withdrew because the advisory
had misattributed a Deno-only vulnerability to the npm ``esbuild`` package —
this engine had no filter for that field at all before this test.
"""

from triage.advisories import (
    advisories_from_npm_bulk,
    advisory_from_osv,
    load_osv_records,
)


def osv_record(package="esbuild", *, withdrawn=None, **overrides):
    record = {
        "id": "GHSA-TEST",
        "summary": "Example advisory",
        "affected": [
            {
                "package": {"name": package},
                "ranges": [
                    {
                        "type": "SEMVER",
                        "events": [{"introduced": "0"}, {"fixed": "1.0.0"}],
                    }
                ],
            }
        ],
    }
    if withdrawn is not None:
        record["withdrawn"] = withdrawn
    record.update(overrides)
    return record


class TestWithdrawn:
    def test_a_withdrawn_record_has_no_affected_ranges(self):
        advisory = advisory_from_osv(osv_record(withdrawn="2026-06-17T13:42:24Z"))
        assert advisory.affected == ()
        assert advisory.id == "GHSA-TEST"

    def test_load_osv_records_drops_withdrawn_advisories(self):
        advisories = load_osv_records(
            [osv_record(withdrawn="2026-06-17T13:42:24Z"), osv_record("lodash")]
        )
        assert len(advisories) == 1
        assert advisories[0].packages == {"lodash"}

    def test_an_unwithdrawn_record_is_unaffected(self):
        advisory = advisory_from_osv(osv_record())
        assert advisory.packages == {"esbuild"}


class TestAdvisoryFromOsv:
    def test_reads_summary_details_and_severity(self):
        record = osv_record(
            details="full text",
            severity=[{"type": "CVSS_V3", "score": "CVSS:3.1/AV:N"}],
        )
        advisory = advisory_from_osv(record)
        assert advisory.summary == "Example advisory"
        assert advisory.details == "full text"
        assert advisory.severity == "CVSS:3.1/AV:N"

    def test_ignores_a_git_range_with_no_semver_events(self):
        record = osv_record()
        record["affected"][0]["ranges"] = [{"type": "GIT", "events": [{"introduced": "abc123"}]}]
        advisory = advisory_from_osv(record)
        assert advisory.affected == ()


class TestAdvisoriesFromNpmBulk:
    def test_builds_one_advisory_per_entry(self):
        payload = {
            "esbuild": [
                {
                    "github_advisory_id": "GHSA-TEST",
                    "title": "Example",
                    "vulnerable_versions": "<1.0.0",
                    "severity": "high",
                }
            ]
        }
        advisories = advisories_from_npm_bulk(payload)
        assert len(advisories) == 1
        assert advisories[0].affected[0].range_text == "<1.0.0"
