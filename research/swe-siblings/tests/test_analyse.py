import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from swe_siblings import analyse as a

R = "# Does X change Y?\n\nintro\n\n## Question\n\nDoes the gripper slip at 3 N?\n\n## Method\n\nignored words\n"


class T(unittest.TestCase):
    def test_family(self):
        self.assertEqual(a.family("garment-twonodeopt"), "garment")

    def test_section(self):
        self.assertIn("gripper", a.section(R, "Question"))
        self.assertNotIn("ignored", a.section(R, "Question"))
        self.assertEqual(a.section(R, "Missing"), "")

    def test_words_drop_numbers_stop_code(self):
        w = a.words("The `code` gripper 3.5 N slips")
        self.assertEqual(w, {"gripper", "slips"})

    def test_project_words_uses_title_and_question_only(self):
        w = a.project_words(R)
        self.assertIn("gripper", w)
        self.assertNotIn("ignored", w)

    def test_jaccard(self):
        self.assertEqual(a.jaccard({"a", "b"}, {"b", "c"}), 1 / 3)
        self.assertEqual(a.jaccard(set(), set()), 0.0)

    def test_summarise_splits_within_and_across(self):
        p = {f"x-{i}": {"a", "b"} for i in range(5)}
        p["y-1"] = {"c"}
        fams, across = a.summarise(p)
        self.assertEqual(list(fams), ["x"])
        self.assertEqual(len(fams["x"]), 10)
        self.assertEqual(across, [0.0] * 5)

    def test_small_family_excluded(self):
        p = {"x-1": {"a"}, "x-2": {"a"}, "y-1": {"b"}}
        self.assertEqual(a.summarise(p)[0], {})


if __name__ == "__main__":
    unittest.main()
