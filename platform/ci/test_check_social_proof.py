import unittest

from check_social_proof import check


class SocialProof(unittest.TestCase):
    def test_clean(self):
        self.assertEqual(check("<p>A free calculator. No signup.</p>"), [])

    def test_trusted_by_flagged(self):
        self.assertEqual(check("a\n<p>Trusted by 10,000 teams</p>")[0][0], 2)

    def test_join_count_flagged(self):
        self.assertTrue(check("Join 5,000+ happy users"))

    def test_stars_flagged(self):
        self.assertTrue(check("<span>★★★★★</span>"))
        self.assertTrue(check("Rated 4.8 out of 5"))

    def test_award_and_press_flagged(self):
        self.assertTrue(check("Our award-winning tool"))
        self.assertTrue(check("As seen in the press"))

    def test_competitor_claim_allowed(self):
        self.assertEqual(check("It says it is trusted by thousands of pros."), [])
        self.assertEqual(check("Its own marketing calls it award-winning."), [])

    def test_format_example_allowed(self):
        self.assertEqual(check("start a block with <code>5 stars</code> or ★★★☆☆ e.g."), [])


if __name__ == "__main__":
    unittest.main()
