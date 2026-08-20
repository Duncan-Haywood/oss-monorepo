import pytest

from triage import semver


class TestParse:
    def test_parses_plain_version(self):
        assert semver.parse("10.3.10") == semver.Version(10, 3, 10)

    def test_tolerates_leading_v(self):
        assert semver.parse("v1.2.3") == semver.Version(1, 2, 3)

    def test_parses_prerelease_identifiers(self):
        assert semver.parse("1.0.0-alpha.1").prerelease == ("alpha", 1)

    def test_discards_build_metadata(self):
        assert semver.parse("1.0.0+build.5") == semver.Version(1, 0, 0)

    @pytest.mark.parametrize("text", ["1.2", "", "latest", "1.2.3.4", "^1.0.0"])
    def test_rejects_non_semver(self, text):
        with pytest.raises(semver.UnparseableRange):
            semver.parse(text)


class TestCompare:
    def test_orders_by_precedence(self):
        assert semver.compare(semver.parse("1.0.0"), semver.parse("1.0.1")) == -1
        assert semver.compare(semver.parse("2.0.0"), semver.parse("1.9.9")) == 1
        assert semver.compare(semver.parse("1.0.0"), semver.parse("1.0.0")) == 0

    def test_prerelease_sorts_below_release(self):
        assert semver.compare(semver.parse("1.0.0-alpha"), semver.parse("1.0.0")) == -1

    def test_numeric_prerelease_sorts_below_alphanumeric(self):
        assert semver.compare(semver.parse("1.0.0-1"), semver.parse("1.0.0-alpha")) == -1

    def test_prerelease_ordering_follows_spec_example(self):
        ordered = [
            "1.0.0-alpha",
            "1.0.0-alpha.1",
            "1.0.0-alpha.beta",
            "1.0.0-beta",
            "1.0.0-beta.2",
            "1.0.0-beta.11",
            "1.0.0-rc.1",
            "1.0.0",
        ]
        for lower, higher in zip(ordered, ordered[1:]):
            assert semver.compare(semver.parse(lower), semver.parse(higher)) == -1


class TestSatisfies:
    def test_matches_the_measured_glob_range(self):
        # From the print-atelier case: advisory range >=10.2.0 <10.5.0 matches
        # 10.3.10 but not the 7.2.3 install of the same package.
        assert semver.satisfies("10.3.10", ">=10.2.0 <10.5.0")
        assert not semver.satisfies("7.2.3", ">=10.2.0 <10.5.0")

    def test_supports_upper_bound_only(self):
        assert semver.satisfies("14.2.0", "<14.2.32")
        assert not semver.satisfies("14.2.32", "<14.2.32")

    def test_supports_alternation(self):
        assert semver.satisfies("1.0.0", "<0.5.0 || >=1.0.0 <2.0.0")
        assert not semver.satisfies("0.7.0", "<0.5.0 || >=1.0.0 <2.0.0")

    def test_bare_version_is_an_equality_check(self):
        assert semver.satisfies("1.2.3", "1.2.3")
        assert not semver.satisfies("1.2.4", "1.2.3")

    @pytest.mark.parametrize("wildcard", ["*", "", "   "])
    def test_wildcard_matches_everything(self, wildcard):
        assert semver.satisfies("9.9.9", wildcard)

    def test_raises_on_unsupported_syntax(self):
        with pytest.raises(semver.UnparseableRange):
            semver.satisfies("1.0.0", "^1.0.0")


class TestOsvRanges:
    def test_introduced_without_fix_is_open_ended(self):
        events = [{"introduced": "1.0.0"}]
        assert semver.in_osv_range("99.0.0", events)
        assert not semver.in_osv_range("0.9.0", events)

    def test_fixed_closes_the_range(self):
        events = [{"introduced": "1.0.0"}, {"fixed": "1.5.0"}]
        assert semver.in_osv_range("1.4.9", events)
        assert not semver.in_osv_range("1.5.0", events)

    def test_zero_sentinel_means_from_the_beginning(self):
        events = [{"introduced": "0"}, {"fixed": "2.0.0"}]
        assert semver.in_osv_range("0.0.1", events)
        assert semver.in_osv_range("1.9.9", events)
        assert not semver.in_osv_range("2.0.0", events)

    def test_last_affected_is_inclusive(self):
        events = [{"introduced": "1.0.0"}, {"last_affected": "1.5.0"}]
        assert semver.in_osv_range("1.5.0", events)
        assert not semver.in_osv_range("1.5.1", events)

    def test_handles_multiple_disjoint_windows(self):
        events = [
            {"introduced": "1.0.0"},
            {"fixed": "1.5.0"},
            {"introduced": "2.0.0"},
            {"fixed": "2.1.0"},
        ]
        assert semver.in_osv_range("1.2.0", events)
        assert not semver.in_osv_range("1.7.0", events)
        assert semver.in_osv_range("2.0.5", events)
        assert not semver.in_osv_range("2.1.0", events)

    def test_ignores_declared_event_order(self):
        # OSV does not guarantee ordering; a reversed list must behave the same.
        events = [{"fixed": "1.5.0"}, {"introduced": "1.0.0"}]
        assert semver.in_osv_range("1.2.0", events)
        assert not semver.in_osv_range("1.5.0", events)

    def test_git_style_events_yield_no_match(self):
        assert not semver.in_osv_range("1.0.0", [])
