import unittest

import culture


class CultureTest(unittest.TestCase):
    def test_owner_quotes_only_count_in_owner_paragraphs(self):
        text = ('The owner, 2026-10-20: "cut the deadweight in rules and processes".\n\n'
                'A rule says "this quote comes from a run record, not a person".')
        self.assertEqual(culture.owner_quoted_bytes(text), len("cut the deadweight in rules and processes"))

    def test_short_quotes_ignored(self):
        self.assertEqual(culture.owner_quoted_bytes('The owner said "yes".'), 0)

    def test_classify_input(self):
        self.assertEqual(culture.classify_input("read ./prompt.md and follow the instructions there"), "routine")
        self.assertEqual(culture.classify_input("scheduled: continue work on revenue products"), "scheduled")
        self.assertEqual(culture.classify_input("analyze the culture of the repo"), "ask")
        self.assertEqual(culture.classify_input(""), "routine")

    def test_runs_summary(self):
        recs = [{"track": "process", "deviations": [{"x": 1}], "input": "do a study", "date": "2026-10-20"},
                {"track": "ventures", "input": "follow the instructions in ./prompt.md"},
                {"track": "review"}, {"track": "research"}]
        s = culture.runs_summary(recs)
        self.assertEqual(s["runs"], 4)
        self.assertEqual(s["meta_share"], 0.5)
        self.assertEqual(s["deviation_rate"], 0.25)
        self.assertEqual(s["owner_asks_by_day"], {"2026-10-20": 1})

    def test_outside_usage(self):
        usage = {"products": [{"readings": [{"signals": {"live_url_visitors": None, "x": 1}},
                                            {"signals": {"live_url_visitors": 3}}]}, {"readings": []}]}
        self.assertEqual(culture.outside_usage(usage), {"products": 2, "readings": 2, "visitor_readings": 1})

    def test_rulebook_files_adds_runbooks(self):
        files = culture.rulebook_files([".github/prompts/b.md", ".github/prompts/a.md", ".github/prompts/x.txt"])
        self.assertEqual(files[-2:], [".github/prompts/a.md", ".github/prompts/b.md"])
        self.assertIn("CLAUDE.md", files)


if __name__ == "__main__":
    unittest.main()
