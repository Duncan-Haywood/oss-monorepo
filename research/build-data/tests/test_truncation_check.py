import datetime, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
try:
    import truncation_check as tc
except ImportError:  # needs pandas/lightgbm
    tc = None


@unittest.skipIf(tc is None, "needs pandas and lightgbm")
class Censor(unittest.TestCase):
    """Session 77: history censored to the window a test-year permit had before the pull."""

    def test_window_counts_days_from_the_same_day_of_the_test_year(self):
        w = tc.window(["2020-01-01", "2021-03-01"], 2024, datetime.date(2024, 12, 31))
        self.assertEqual(int(w[0]), 365)  # 2024-01-01 to 2024-12-31
        self.assertEqual(int(w[1]), 365 - 59)  # 1 March is day 60 in a non-leap year

    def test_censor_drops_rows_longer_than_their_window(self):
        import pandas as pd
        d = pd.DataFrame(dict(start=["2020-01-01", "2020-01-01", "2020-12-01"], y=[300, 400, 100]))
        k = tc.censor(d, 2024, datetime.date(2024, 12, 31))
        self.assertEqual(list(k.y), [300])  # 400 > 365; 100 > 30 (1 Dec to 31 Dec 2024)


if __name__ == "__main__":
    unittest.main()
