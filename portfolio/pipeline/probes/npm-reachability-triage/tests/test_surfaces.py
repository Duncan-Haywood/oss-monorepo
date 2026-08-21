import pytest

from triage.surfaces import classify, is_dev_server_only


class TestServerOnlySurfaces:
    @pytest.mark.parametrize(
        "text,expected_rule",
        [
            ("Authorization bypass in Next.js Middleware", "middleware"),
            ("Denial of service via Server Actions", "server-actions"),
            ("Next.js Image Optimization allows arbitrary reads", "image-optimizer"),
            ("Vulnerability in /_next/image endpoint", "image-optimizer"),
            ("HTTP request smuggling in the router", "request-smuggling"),
            ("Response cache poisoning affects deployments", "cache-poisoning"),
            ("Server-Side Request Forgery in the fetch handler", "ssrf"),
            ("Flaw in server-side rendering of untrusted input", "server-rendering"),
            ("Issue in getServerSideProps error handling", "server-rendering"),
            ("Improper access control in API routes", "route-handlers"),
        ],
    )
    def test_recognised_server_surfaces(self, text, expected_rule):
        verdict = classify(text)
        assert verdict.server_only is True
        assert verdict.matched_rule == expected_rule
        assert verdict.explanation


class TestVetoes:
    def test_client_side_mention_vetoes_suppression(self):
        verdict = classify(
            "Middleware flaw also allows client-side script injection in the browser"
        )
        assert verdict.server_only is False
        assert verdict.vetoed_by == "client-side"

    def test_xss_vetoes_suppression(self):
        verdict = classify("Server Actions issue leading to cross-site scripting")
        assert verdict.server_only is False
        assert verdict.vetoed_by == "xss"

    def test_build_time_mention_vetoes_suppression(self):
        verdict = classify("Middleware flaw triggered during the build process")
        assert verdict.server_only is False
        assert verdict.vetoed_by == "build-time"

    def test_static_generation_mention_vetoes_suppression(self):
        verdict = classify("SSR and statically generated pages are both affected")
        assert verdict.server_only is False
        assert verdict.vetoed_by == "static-generation"

    def test_prototype_pollution_vetoes_suppression(self):
        verdict = classify("Prototype pollution reachable through a route handler")
        assert verdict.server_only is False
        assert verdict.vetoed_by == "prototype-pollution"


class TestFallthrough:
    @pytest.mark.parametrize(
        "text",
        [
            "Regular expression denial of service in a utility function",
            "Improper input validation",
            "",
            "   ",
        ],
    )
    def test_unrecognised_text_is_never_server_only(self, text):
        verdict = classify(text)
        assert verdict.server_only is False
        assert verdict.matched_rule is None

    def test_classification_is_case_insensitive(self):
        assert classify("AUTHORIZATION BYPASS IN MIDDLEWARE").server_only is True

    def test_cache_confusion_is_the_same_family_as_cache_poisoning(self):
        # Seen on real data: several Next.js advisories say "cache confusion".
        verdict = classify("Cache confusion of response bodies for requests with bodies")
        assert verdict.server_only is True
        assert verdict.matched_rule == "cache-poisoning"


class TestDevServerScope:
    @pytest.mark.parametrize(
        "text",
        [
            "Information exposure in Next.js dev server due to lack of origin verification",
            "Flaw in the development server allows source disclosure",
            "next dev exposes internal state",
        ],
    )
    def test_recognises_development_server_scope(self, text):
        assert is_dev_server_only(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "Dev server and production builds are both affected",
            "The development server issue also affects next build output",
            "Affects next start in production mode",
        ],
    )
    def test_production_mention_vetoes(self, text):
        assert is_dev_server_only(text) is False

    @pytest.mark.parametrize("text", ["", "   ", "Middleware authorization bypass"])
    def test_unrelated_text_is_not_dev_server_scoped(self, text):
        assert is_dev_server_only(text) is False


class TestServerFunctionSurface:
    """The React Server Components advisories, and why the rule is not named that.

    All three RSC advisories in the 2026-08 feed describe "a specially crafted
    HTTP request sent to any App Router Server Function endpoint". The endpoint
    is the part a static export does not have; Server Components themselves run
    at build time to produce the pre-rendered HTML. Matching the endpoint is
    therefore both sufficient for these advisories and correct for the ones a
    "Server Components" pattern would have wrongly caught.
    """

    @pytest.mark.parametrize(
        "text",
        [
            "A specially crafted HTTP request can be sent to any App Router "
            "Server Function endpoint that, when deserialized, may trigger "
            "excessive CPU usage.",
            "Next.js: Unauthenticated disclosure of internal Server Function endpoints",
        ],
    )
    def test_server_function_endpoints_are_server_only(self, text):
        verdict = classify(text)
        assert verdict.server_only is True
        assert verdict.matched_rule == "server-functions"

    def test_build_time_server_component_rendering_is_not_suppressed(self):
        """The case a `server components` pattern would have got wrong."""
        text = (
            "A flaw in React Server Components rendering can corrupt output "
            "produced during static generation."
        )
        assert classify(text).server_only is False

    def test_there_is_no_server_components_rule(self):
        """Pins the decision so a later pass cannot quietly widen it.

        Adding `\\bserver components?\\b` to SERVER_ONLY_RULES would suppress
        advisories about build-time rendering, which a static export does
        perform. If a future change needs that pattern it has to delete this
        test and say why.
        """
        from triage.surfaces import SERVER_ONLY_RULES

        assert not any(
            rule.pattern.search("uses React Server Components at build time")
            for rule in SERVER_ONLY_RULES
        )
