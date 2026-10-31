import unittest
import check_json_valid as c


class Classify(unittest.TestCase):
    def test_json(self):
        self.assertEqual(c.classify('{"a": [1, 2]}'), "json")

    def test_jsonl(self):
        self.assertEqual(c.classify('["a", 1]\n["b", 2]\n'), "jsonl")

    def test_trailing_comma(self):
        self.assertTrue(c.classify('{"a": 1,}').startswith("error"))

    def test_bad_line_in_jsonl(self):
        self.assertTrue(c.classify('[1]\n[2,\n').startswith("error"))


if __name__ == "__main__":
    unittest.main()
