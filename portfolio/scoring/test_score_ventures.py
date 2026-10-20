"""Unit tests for the venture merit scorer.

The validation branches matter more than the arithmetic here: a rescore is a
hand edit to a YAML file, and the failure this file guards against is a score
change that updates the dimension but not the derived composite, or a venture
added to `ventures/` that never gets scored. Both are invisible in a diff.
"""

import contextlib
import io
import json
import unittest
from pathlib import Path

import score_ventures as sv


def scores(**overrides) -> dict:
    base = {d: 5 for d in sv.DIMENSIONS}
    base.update(overrides)
    return base


def venture(slug="alpha", **overrides) -> dict:
    s = overrides.pop("scores", scores())
    values = [s[d] for d in sv.DIMENSIONS]
    entry = {
        "slug": slug,
        "scores": s,
        "composite": round(sum(values) / len(values), 3),
        "floor": min(values),
        "floor_dimension": sorted(d for d in sv.DIMENSIONS if s[d] == min(values))[0],
        "basis": "test fixture",
        "gates": {g: "pass" for g in sv.GATES},
    }
    if min(values) <= sv.FLOOR_NOTE_THRESHOLD:
        entry["floor_note"] = "test fixture"
    entry.update(overrides)
    return entry


def doc(*ventures) -> dict:
    return {"scored": "2026-01-01", "ventures": list(ventures)}


class TestComposite(unittest.TestCase):
    def test_mean_of_six_dimensions(self):
        self.assertEqual(sv.composite(scores(ai_leverage=8, distribution=2)), 5.0)

    def test_rounds_to_three_places(self):
        self.assertEqual(sv.composite(scores(ai_leverage=6)), 5.167)


class TestCheck(unittest.TestCase):
    def test_clean_document_has_no_problems(self):
        self.assertEqual(sv.check(doc(venture()), ["alpha"]), [])

    def test_empty_document(self):
        self.assertEqual(sv.check({}, ["alpha"]), ["no ventures scored"])

    def test_unscored_venture_is_reported_not_failed(self):
        self.assertEqual(sv.check(doc(venture()), ["alpha", "beta"]), [])
        self.assertEqual(sv.unscored(doc(venture()), ["alpha", "beta"]), ["beta"])

    def test_scored_nonexistent_venture_is_a_problem(self):
        problems = sv.check(doc(venture()), [])
        self.assertTrue(any("no such venture directory" in p for p in problems))

    def test_duplicate_slug_is_a_problem(self):
        problems = sv.check(doc(venture(), venture()), ["alpha"])
        self.assertTrue(any("scored more than once" in p for p in problems))

    def test_stale_composite_is_caught(self):
        entry = venture()
        entry["scores"]["ai_leverage"] = 9
        problems = sv.check(doc(entry), ["alpha"])
        self.assertTrue(any("composite is" in p for p in problems))

    def test_stale_floor_is_caught(self):
        entry = venture(scores=scores(distribution=2))
        entry["floor"] = 5
        problems = sv.check(doc(entry), ["alpha"])
        self.assertTrue(any("floor is 5" in p for p in problems))

    def test_wrong_floor_dimension_is_caught(self):
        entry = venture(scores=scores(distribution=2))
        entry["floor_dimension"] = "gross_margin"
        problems = sv.check(doc(entry), ["alpha"])
        self.assertTrue(any("floor_dimension is" in p for p in problems))

    def test_missing_floor_dimension_is_caught(self):
        entry = venture()
        del entry["floor_dimension"]
        problems = sv.check(doc(entry), ["alpha"])
        self.assertIn("alpha: floor_dimension is unset", problems)

    def test_low_floor_without_a_note_is_caught(self):
        entry = venture(scores=scores(distribution=3))
        del entry["floor_note"]
        problems = sv.check(doc(entry), ["alpha"])
        self.assertTrue(any("needs a named floor_note" in p for p in problems))

    def test_floor_of_five_needs_no_note(self):
        self.assertEqual(sv.check(doc(venture()), ["alpha"]), [])

    def test_out_of_range_score_is_caught(self):
        entry = venture()
        entry["scores"]["ai_leverage"] = 11
        problems = sv.check(doc(entry), ["alpha"])
        self.assertTrue(any("expected an integer 0-10" in p for p in problems))

    def test_unknown_dimension_is_caught(self):
        entry = venture()
        entry["scores"]["margin_typo"] = 5
        problems = sv.check(doc(entry), ["alpha"])
        self.assertTrue(any("unknown dimensions" in p for p in problems))

    def test_missing_dimension_is_caught(self):
        entry = venture()
        del entry["scores"]["defensibility"]
        problems = sv.check(doc(entry), ["alpha"])
        self.assertTrue(any("missing dimensions" in p for p in problems))

    def test_missing_gate_is_caught(self):
        entry = venture()
        entry["gates"] = {"liability_containment": "pass"}
        problems = sv.check(doc(entry), ["alpha"])
        self.assertTrue(any("gate ethical_robustness" in p for p in problems))

    def test_failed_gate_without_a_note_is_caught(self):
        entry = venture()
        entry["gates"]["liability_containment"] = "fail"
        problems = sv.check(doc(entry), ["alpha"])
        self.assertTrue(any("needs a named gate_note" in p for p in problems))

    def test_failed_gate_with_a_note_is_accepted(self):
        entry = venture()
        entry["gates"]["liability_containment"] = "fail"
        entry["gate_note"] = "why"
        self.assertEqual(sv.check(doc(entry), ["alpha"]), [])

    def test_missing_basis_is_caught(self):
        entry = venture()
        entry["basis"] = "  "
        problems = sv.check(doc(entry), ["alpha"])
        self.assertIn("alpha: no basis recorded for these scores", problems)


class TestAgreement(unittest.TestCase):
    def test_dispatchable_on_top_is_consistent(self):
        ranking = sv.merit_ranking(
            doc(
                venture("alpha", scores=scores(ai_leverage=9)),
                venture("beta", scores=scores(ai_leverage=1)),
            )
        )
        result = sv.agreement(ranking, {"alpha"})
        self.assertTrue(result["occupies_top_slots"])
        self.assertEqual(result["dispatchable_merit_ranks"], [1])

    def test_dispatchable_at_the_bottom_is_not_consistent(self):
        ranking = sv.merit_ranking(
            doc(
                venture("alpha", scores=scores(ai_leverage=9)),
                venture("beta", scores=scores(ai_leverage=1)),
            )
        )
        result = sv.agreement(ranking, {"beta"})
        self.assertFalse(result["occupies_top_slots"])
        self.assertEqual(result["dispatchable_merit_ranks"], [2])
        self.assertLess(
            result["mean_composite_dispatchable"], result["mean_composite_blocked"]
        )

    def test_no_dispatchable_ventures_is_not_consistent(self):
        ranking = sv.merit_ranking(doc(venture("alpha")))
        result = sv.agreement(ranking, set())
        self.assertFalse(result["occupies_top_slots"])
        self.assertIsNone(result["mean_composite_dispatchable"])

    def test_ranking_orders_by_composite_then_slug(self):
        ranking = sv.merit_ranking(
            doc(
                venture("zulu", scores=scores(ai_leverage=7)),
                venture("alpha", scores=scores(ai_leverage=7)),
                venture("mike", scores=scores(ai_leverage=9)),
            )
        )
        self.assertEqual([v["slug"] for v in ranking], ["mike", "alpha", "zulu"])


class TestRaterAgreement(unittest.TestCase):
    def test_none_when_no_second_rater(self):
        self.assertIsNone(sv.rater_agreement(doc(venture())))

    def test_non_numeric_rater_b_is_caught(self):
        problems = sv.check(doc(venture(rater_b="five")), ["alpha"])
        self.assertTrue(any("rater_b is" in p for p in problems))

    def test_deltas_and_endpoint_agreement(self):
        d = doc(
            venture("alpha", scores=scores(ai_leverage=8), rater_b=5.0),
            venture("beta", scores=scores(ai_leverage=2), rater_b=4.0),
        )
        result = sv.rater_agreement(d)
        self.assertEqual(result["n"], 2)
        # alpha composite 5.5 vs 5.0 -> 0.5; beta 4.5 vs 4.0 -> 0.5
        self.assertEqual(result["max_abs_delta"], 0.5)
        self.assertEqual(result["mean_abs_delta"], 0.5)
        self.assertTrue(result["same_top"])
        self.assertTrue(result["same_bottom"])

    def test_disagreeing_top_pick_is_reported(self):
        d = doc(
            venture("alpha", scores=scores(ai_leverage=8), rater_b=1.0),
            venture("beta", scores=scores(ai_leverage=2), rater_b=9.0),
        )
        self.assertFalse(sv.rater_agreement(d)["same_top"])


class TestAnchor(unittest.TestCase):
    def test_missing_ideas_file_reports_unavailable(self):
        self.assertIsNone(sv.anchor_dimension_means(Path("/nonexistent/ideas.ts")))

    def test_real_ideas_file_yields_rows_of_six(self):
        rows = sv.anchor_dimension_means()
        self.assertTrue(rows)
        for row in rows:
            self.assertEqual(len(row), len(sv.DIMENSIONS))
            self.assertTrue(all(0 <= v <= 10 for v in row))


class TestRealDocument(unittest.TestCase):
    """The committed scores must satisfy every rule and cover every venture."""

    def test_committed_scores_are_valid(self):
        problems = sv.check(sv.load_doc(), sv.venture_slugs(), sv.documented_slugs())
        self.assertEqual(problems, [], f"venture-scores.yaml: {problems}")

    def test_json_output_is_serializable(self):
        # `scored:` parses as a datetime.date, which json.dumps rejects.
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(sv.main(["--json"]), 0)
        payload = json.loads(out.getvalue())
        # The ranking carries every scored venture; `agreement.ranked` narrows
        # it to the scored ones actually allocated to. Unscored ventures are
        # reported by `unscored`, not ranked.
        doc = sv.load_doc()
        self.assertEqual(len(payload["ranking"]), len(doc["ventures"]))
        waiting = sv.unscored(doc, sv.venture_slugs())
        self.assertEqual(len(payload["agreement"]["ranked"]), len(sv.venture_slugs()) - len(waiting))


class TestVentureSlugs(unittest.TestCase):
    def test_not_a_venture_marker_excludes_a_directory_with_a_yaml(self):
        # The scorer must agree with the router and validate.py: a
        # NOT-A-VENTURE marker opts a directory out even when a VENTURE.yaml
        # is still present (the transitional state of a reclassification).
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            ventures_dir = Path(tmp)
            (ventures_dir / "real-venture").mkdir()
            (ventures_dir / "real-venture" / "VENTURE.yaml").write_text("name: real-venture\n")
            (ventures_dir / "opted-out").mkdir()
            (ventures_dir / "opted-out" / "VENTURE.yaml").write_text("name: opted-out\n")
            (ventures_dir / "opted-out" / "NOT-A-VENTURE").write_text("infra\n")
            self.assertEqual(sv.venture_slugs(ventures_dir), ["real-venture"])
            self.assertEqual(
                sv.documented_slugs(ventures_dir), ["opted-out", "real-venture"]
            )


class TestReclassifiedVentureKeepsItsScore(unittest.TestCase):
    """A directory that opts out of allocation may keep its score row.

    Without this, dropping a NOT-A-VENTURE marker in turns `--check` red
    ("scored but no such venture directory"), so the single-file
    reclassification README.md documents is not actually available.
    """

    def test_scored_but_opted_out_is_allowed(self):
        problems = sv.check(
            doc(venture("alpha"), venture("beta")),
            ["alpha"],
            ["alpha", "beta"],
        )
        self.assertEqual(problems, [])

    def test_scored_but_no_directory_at_all_is_still_a_problem(self):
        problems = sv.check(doc(venture("alpha"), venture("ghost")), ["alpha"], ["alpha"])
        self.assertEqual(problems, ["scored but no such venture directory: ['ghost']"])

    def test_allocated_venture_without_a_score_is_listed_as_waiting(self):
        problems = sv.check(doc(venture("alpha")), ["alpha", "beta"], ["alpha", "beta"])
        self.assertEqual(problems, [])
        self.assertEqual(sv.unscored(doc(venture("alpha")), ["alpha", "beta"]), ["beta"])

    def test_agreement_excludes_reclassified_from_ranks_and_means(self):
        ranking = sv.merit_ranking(
            doc(
                venture("top", scores=scores(ai_leverage=10)),
                venture("alpha"),
                venture("beta"),
            )
        )
        result = sv.agreement(ranking, {"alpha"}, allocated={"top", "alpha"})
        self.assertEqual(result["ranked"], ["top", "alpha"])
        # "beta" is reclassified, so it must not be counted as blocked.
        self.assertEqual(result["mean_composite_blocked"], sv.composite(scores(ai_leverage=10)))


if __name__ == "__main__":
    unittest.main()
