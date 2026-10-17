"""Tests for research_idea_dupe.py."""
import unittest

import research_idea_dupe as r

FOUND = {
    "verifier-bribery": "bribing verifiers in refereed verification: closed-form bribe floor",
    "sybil-stake": "identity splitting vs merging under stake-weighted pools",
    "bare-dir": "",
}


class T(unittest.TestCase):
    def test_all_keywords_rank_first(self):
        rows = r.search(["bribe", "verifier"], FOUND)
        self.assertEqual(rows[0][:2], (2, "verifier-bribery"))

    def test_slug_matches_and_case(self):
        self.assertEqual([x[1] for x in r.search(["SYBIL"], FOUND)], ["sybil-stake"])

    def test_no_hit(self):
        self.assertEqual(r.search(["quantum"], FOUND), [])

    def test_bullet_regex(self):
        m = r.BULLET.match("- [`research/foo-bar`](foo-bar) — does a thing — and more.")
        self.assertEqual(m.groups(), ("foo-bar", "does a thing — and more."))

    def test_real_main_has_projects(self):
        found = r.projects("HEAD")
        if found:
            self.assertGreater(len(found), 100)


if __name__ == "__main__":
    unittest.main()
