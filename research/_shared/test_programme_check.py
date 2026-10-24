import json
import tempfile
import unittest
from pathlib import Path

import programme_check as pc

GOOD = "\n".join(f"## {s}\n\ntext\n" for s in pc.SECTIONS).replace(
    "## Related work\n\ntext", "## Related work\n\n" + "\n".join(f"- https://arxiv.org/abs/{i}" for i in range(10)))


class ProgrammeCheckTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "_shared").mkdir()
        (self.root / "_shared" / "legacy_projects.txt").write_text("old-one\n")
        (self.root / "old-one").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def make(self, name, proposal=None, card=None):
        d = self.root / name
        d.mkdir()
        if proposal is not None:
            (d / "PROPOSAL.md").write_text(proposal)
        if card is not None:
            (d / "project.json").write_text(json.dumps(card))
        return d

    def check(self, d):
        return pc.problems(d, {"old-one"}, self.root)

    def test_legacy_exempt(self):
        self.assertEqual(self.check(self.root / "old-one"), [])
        self.assertEqual(pc.main(self.root), 0)

    def test_new_standalone_fails(self):
        d = self.make("new-thing", card={"title": "x"})
        self.assertTrue(self.check(d))
        self.assertEqual(pc.main(self.root), 1)

    def test_complete_proposal_passes(self):
        self.assertEqual(self.check(self.make("prog", proposal=GOOD)), [])

    def test_missing_section_and_thin_related_work(self):
        thin = GOOD.replace("## Gap", "## Gapp")
        thin = "\n".join(l for l in thin.splitlines() if "arxiv.org/abs/9" not in l)
        found = self.check(self.make("prog", proposal=thin))
        self.assertTrue(any("'## Gap'" in p for p in found))
        self.assertTrue(any("fewer than 10" in p for p in found))

    def test_member_of_programme(self):
        self.make("prog", proposal=GOOD)
        self.assertEqual(self.check(self.make("prog-step", card={"programme": "prog"})), [])
        self.assertTrue(self.check(self.make("orphan", card={"programme": "nosuch"})))

    def test_member_of_incomplete_programme_fails(self):
        self.make("half", proposal="## Question\n")
        self.assertTrue(self.check(self.make("step", card={"programme": "half"})))

    def test_standalone_needs_reason(self):
        self.assertTrue(self.check(self.make("a", card={"programme": "none"})))
        self.assertEqual(self.check(self.make("b", card={"programme": "none", "why_standalone": "a dataset"})), [])


if __name__ == "__main__":
    unittest.main()
