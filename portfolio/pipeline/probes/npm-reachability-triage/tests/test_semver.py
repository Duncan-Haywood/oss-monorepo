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


class TestParseBound:
    """OSV event bounds are timeline points, so partial values are coercible.

    Kept separate from :class:`TestParse` deliberately: the same strings must
    keep raising in the npm-range dialect, where ``1.2`` is an X-range rather
    than a point. :class:`TestBoundCoercionIsScopedToOsv` pins that split.
    """

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("13.0", semver.Version(13, 0, 0)),
            ("8.0", semver.Version(8, 0, 0)),
            ("1.2", semver.Version(1, 2, 0)),
            ("7.80", semver.Version(7, 80, 0)),
            ("8", semver.Version(8, 0, 0)),
        ],
    )
    def test_zero_fills_partial_versions(self, text, expected):
        assert semver.parse_bound(text) == expected

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("2026.05.1", semver.Version(2026, 5, 1)),
            ("2026.04.1", semver.Version(2026, 4, 1)),
            ("2025.08.14", semver.Version(2025, 8, 14)),
            ("20260509.0340.15", semver.Version(20260509, 340, 15)),
        ],
    )
    def test_strips_leading_zeros(self, text, expected):
        assert semver.parse_bound(text) == expected

    def test_still_parses_ordinary_versions(self):
        assert semver.parse_bound("14.2.30") == semver.Version(14, 2, 30)
        assert semver.parse_bound("1.0.0-alpha.1").prerelease == ("alpha", 1)

    @pytest.mark.parametrize(
        "text",
        [
            "2270aaf21bd02c6a6a102282",  # commit SHA
            "0.30.0b3",  # Python-style prerelease
            "2.0a1",
            "3.5.0.pre0",  # Ruby-style, four components
            "3.5.0.rc4",
            "1.2.3.4",
            "latest",
            "",
        ],
    )
    def test_refuses_to_guess_at_anything_else(self, text):
        # Coercing these could silently drop a real finding, which is the one
        # failure mode this tool exists to avoid.
        with pytest.raises(semver.UnparseableRange):
            semver.parse_bound(text)


class TestBoundCoercionIsScopedToOsv:
    def test_osv_range_with_partial_bound_resolves(self):
        # GHSA-3h52-269p-cp9r: `introduced: "13.0"` made the whole range
        # unparseable, so next@14.2.35 — patched in 14.2.30 — was reported as
        # a shipped vulnerability.
        events = [
            {"introduced": "15.0.0"},
            {"fixed": "15.2.2"},
            {"introduced": "13.0"},
            {"fixed": "14.2.30"},
        ]
        assert not semver.in_osv_range("14.2.35", events)
        assert semver.in_osv_range("14.2.29", events)
        assert semver.in_osv_range("15.1.0", events)
        assert not semver.in_osv_range("15.2.2", events)

    def test_npm_range_dialect_still_rejects_partial_versions(self):
        # `1.2` in an npm range is the X-range `>=1.2.0 <1.3.0`, not the point
        # 1.2.0, so the coercion must not leak into `satisfies`.
        with pytest.raises(semver.UnparseableRange):
            semver.satisfies("1.2.5", "<1.2")
        with pytest.raises(semver.UnparseableRange):
            semver.parse("1.2")

    def test_unparseable_bound_still_raises_from_osv_path(self):
        events = [{"introduced": "0"}, {"fixed": "2270aaf21bd02c6a6a102282"}]
        with pytest.raises(semver.UnparseableRange):
            semver.in_osv_range("1.0.0", events)
