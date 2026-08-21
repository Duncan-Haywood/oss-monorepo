"""Behaviour of the production dependency graph and the build-only decision.

This module decides a *suppression*, so the tests are weighted the same way as
``test_engine.py``: proving that a build-only verdict requires a named edge all
the way down, and that every unproven shape falls through to "not build-only".
"""

import pytest

from triage.graph import (
    BUILD_ONLY_EDGES,
    ROOT,
    build_from_lockfile_data,
    build_only_reasons,
    resolve,
)


def lockfile(packages):
    return {"lockfileVersion": 3, "packages": packages}


#: The shape every Next.js product in this portfolio actually has: the project's
#: own dev copy of postcss hoisted to the top, and next's production copy nested
#: underneath it, which is the location that keeps the finding alive.
NEXT_SHAPE = lockfile(
    {
        "": {"dependencies": {"next": "14.2.35"}},
        "node_modules/next": {"version": "14.2.35", "dependencies": {"postcss": "8.4.31"}},
        "node_modules/next/node_modules/postcss": {
            "version": "8.4.31",
            "dependencies": {"nanoid": "^3.3.6"},
        },
        "node_modules/postcss": {"version": "8.5.15", "dev": True},
        "node_modules/nanoid": {"version": "3.3.12"},
    }
)


class TestResolve:
    def test_prefers_the_nearest_nested_copy(self):
        locations = frozenset(
            {"node_modules/next", "node_modules/next/node_modules/postcss", "node_modules/postcss"}
        )
        assert (
            resolve("node_modules/next", "postcss", locations)
            == "node_modules/next/node_modules/postcss"
        )

    def test_falls_back_to_the_hoisted_copy(self):
        locations = frozenset({"node_modules/a", "node_modules/postcss"})
        assert resolve("node_modules/a", "postcss", locations) == "node_modules/postcss"

    def test_root_resolves_against_the_top_level(self):
        locations = frozenset({"node_modules/next"})
        assert resolve(ROOT, "next", locations) == "node_modules/next"

    def test_unresolvable_name_is_none(self):
        assert resolve("node_modules/a", "missing", frozenset({"node_modules/a"})) is None


class TestGraphConstruction:
    def test_records_the_resolved_dependent(self):
        graph = build_from_lockfile_data(NEXT_SHAPE)
        assert graph.dependents["node_modules/next/node_modules/postcss"] == frozenset(
            {"node_modules/next"}
        )

    def test_dev_locations_contribute_no_edges(self):
        # The project's own dev postcss also depends on nanoid, but a dev-only
        # location cannot put anything on the production graph.
        graph = build_from_lockfile_data(
            lockfile(
                {
                    "": {"devDependencies": {"postcss": "^8"}},
                    "node_modules/postcss": {
                        "version": "8.5.15",
                        "dev": True,
                        "dependencies": {"nanoid": "^3"},
                    },
                    "node_modules/nanoid": {"version": "3.3.12", "dev": True},
                }
            )
        )
        assert graph.dependents.get("node_modules/nanoid") is None

    def test_name_of_handles_nesting_and_scopes(self):
        graph = build_from_lockfile_data(NEXT_SHAPE)
        assert graph.name_of("node_modules/next/node_modules/postcss") == "postcss"
        assert graph.name_of("node_modules/@scope/pkg") == "@scope/pkg"
        assert graph.name_of(ROOT) == "<root>"

    def test_a_lockfile_without_packages_yields_an_empty_graph(self):
        graph = build_from_lockfile_data({"lockfileVersion": 3})
        assert graph.locations == frozenset()


class TestBuildOnly:
    def test_named_edge_proves_build_only(self):
        graph = build_from_lockfile_data(NEXT_SHAPE)
        reasons = build_only_reasons(graph, "node_modules/next/node_modules/postcss")
        assert reasons is not None
        assert any("`next` → `postcss`" in reason for reason in reasons)

    def test_build_only_propagates_transitively(self):
        """nanoid's only production dependent is a build-only postcss.

        This is the case the probe's README had recorded as needing call-graph
        analysis. It does not: the dependency graph settles it.
        """
        graph = build_from_lockfile_data(NEXT_SHAPE)
        reasons = build_only_reasons(graph, "node_modules/nanoid")
        assert reasons is not None
        assert any("`postcss` → `nanoid`" in reason for reason in reasons)

    def test_a_runtime_dependent_defeats_the_transitive_claim(self):
        """Same nanoid, one extra production dependent that is not a build tool."""
        graph = build_from_lockfile_data(
            lockfile(
                {
                    "": {"dependencies": {"next": "14.2.35", "some-runtime-lib": "1.0.0"}},
                    "node_modules/next": {
                        "version": "14.2.35",
                        "dependencies": {"postcss": "8.4.31"},
                    },
                    "node_modules/next/node_modules/postcss": {
                        "version": "8.4.31",
                        "dependencies": {"nanoid": "^3.3.6"},
                    },
                    "node_modules/some-runtime-lib": {
                        "version": "1.0.0",
                        "dependencies": {"nanoid": "^3.3.6"},
                    },
                    "node_modules/nanoid": {"version": "3.3.12"},
                }
            )
        )
        assert build_only_reasons(graph, "node_modules/nanoid") is None

    def test_the_root_project_is_never_build_only(self):
        graph = build_from_lockfile_data(
            lockfile(
                {
                    "": {"dependencies": {"postcss": "^8"}},
                    "node_modules/postcss": {"version": "8.5.15"},
                }
            )
        )
        assert build_only_reasons(graph, "node_modules/postcss") is None

    def test_a_location_with_no_production_dependents_is_unproven(self):
        graph = build_from_lockfile_data(
            lockfile({"": {}, "node_modules/orphan": {"version": "1.0.0"}})
        )
        assert build_only_reasons(graph, "node_modules/orphan") is None

    def test_an_unnamed_edge_is_unproven(self):
        graph = build_from_lockfile_data(
            lockfile(
                {
                    "": {"dependencies": {"express": "4.0.0"}},
                    "node_modules/express": {
                        "version": "4.0.0",
                        "dependencies": {"postcss": "^8"},
                    },
                    "node_modules/postcss": {"version": "8.5.15"},
                }
            )
        )
        assert build_only_reasons(graph, "node_modules/postcss") is None

    def test_a_dependency_cycle_cannot_bootstrap_a_suppression(self):
        graph = build_from_lockfile_data(
            lockfile(
                {
                    "": {},
                    "node_modules/a": {"version": "1.0.0", "dependencies": {"b": "1.0.0"}},
                    "node_modules/b": {"version": "1.0.0", "dependencies": {"a": "1.0.0"}},
                }
            )
        )
        assert build_only_reasons(graph, "node_modules/a") is None
        assert build_only_reasons(graph, "node_modules/b") is None

    def test_a_dev_location_is_not_this_rules_business(self):
        graph = build_from_lockfile_data(NEXT_SHAPE)
        assert build_only_reasons(graph, "node_modules/postcss") is None


class TestEdgeTableIsSelfDescribing:
    """Every edge must carry a reason a reviewer can disagree with.

    The rule table is the whole audit surface of this rule; an edge with a
    vague or empty justification is indistinguishable from an unexplained
    suppression.
    """

    @pytest.mark.parametrize("edge", sorted(BUILD_ONLY_EDGES))
    def test_edge_has_a_substantive_explanation(self, edge):
        explanation = BUILD_ONLY_EDGES[edge]
        assert len(explanation) > 40
        dependent, package = edge
        assert dependent and package
