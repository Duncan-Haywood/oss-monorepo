import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "research" / "_homepage"))
import registry  # noqa: E402


def make(root, cards):
    (root / "_homepage").mkdir()
    themes = [{"id": "a", "name": "A", "blurb": "", "projects": [{"slug": "old", "title": "t", "summary": "s"}]}]
    (root / "_homepage" / "projects.json").write_text(json.dumps({"themes": themes, "featured": []}))
    for slug, card in cards.items():
        (root / slug).mkdir()
        (root / slug / "project.json").write_text(card if isinstance(card, str) else json.dumps(card))


class RegistryTest(unittest.TestCase):
    def load(self, cards):
        with tempfile.TemporaryDirectory() as d:
            make(Path(d), cards)
            return registry.load(Path(d))

    def test_card_is_appended_to_its_theme_in_slug_order(self):
        card = {"theme": "a", "title": "T", "summary": "S"}
        data = self.load({"zeta": card, "beta": card})
        self.assertEqual([p["slug"] for p in data["themes"][0]["projects"]], ["old", "beta", "zeta"])
        self.assertEqual(data["registry_errors"], [])

    def test_bad_cards_are_reported(self):
        data = self.load({"x": {"theme": "nope"}, "y": "{", "old": {"theme": "a"}})
        self.assertEqual(len(data["registry_errors"]), 3)


if __name__ == "__main__":
    unittest.main()
