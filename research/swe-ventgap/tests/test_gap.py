import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_ventgap.gap import (parse_log, sessions, is_ventures, version_of, scope_of, size_of, kind_of, rates,
                             mantel_haenszel_or, strata_by_day, mentions_record_step, wilson, record_session)

F, R = "\x1f", "\x1e"
def c(sha, d, subj, trailers, files):
    return f"@@{sha}{F}{d}{F}{subj}{F}{trailers}{R}\n" + "\n".join(files) + "\n"
A = "Claude-Session: https://claude.ai/code/session_AAA\nPrompt-Version: ventures/1"
B = "Claude-Session: https://claude.ai/code/session_BBB\nPrompt-Version: ventures/2\nPrompt-Version: research/0"
LOG = (c("a", "2026-10-14", "calc-x: new venture", A, ["ventures/calc-x/a.mjs", "gitops/prod/x.gz"])
       + c("b", "2026-10-15", "calc-x: more", A, ["ventures/calc-x/b.mjs", "ventures/other/c.mjs"])
       + c("d", "2026-10-15", "platform: thing", B, ["platform/x.py"]))


class T(unittest.TestCase):
    def setUp(self):
        self.s = sessions(parse_log(LOG))

    def test_parse_and_union(self):
        self.assertEqual(len(parse_log(LOG)), 3)
        a = self.s["session_AAA"]
        self.assertEqual((a["commits"], a["date"]), (2, "2026-10-14"))
        self.assertEqual(len(a["files"]), 4)

    def test_mixed_track_session_is_not_ventures(self):
        self.assertTrue(is_ventures(self.s["session_AAA"]))
        self.assertFalse(is_ventures(self.s["session_BBB"]))

    def test_version_scope_size(self):
        a = self.s["session_AAA"]
        self.assertEqual(version_of(a), "ventures/1")
        self.assertEqual(scope_of(a), "several ventures")
        self.assertEqual(size_of(a), "1-5 files")  # the gitops file is generated and does not count
        self.assertEqual(scope_of({"files": {"platform/x.py"}}), "no venture files")
        self.assertEqual(size_of({"files": {f"ventures/a/{i}" for i in range(7)}}), "6-20 files")

    def test_kind(self):
        self.assertEqual(kind_of({"subjects": ["calc-x: new venture"]}), "new venture")
        self.assertEqual(kind_of({"subjects": ["calc-x: add import"]}), "venture feature or fix")
        self.assertEqual(kind_of({"subjects": ["platform: add import"]}), "other subject")
        self.assertEqual(kind_of({"subjects": ["Merge main"]}), "other subject")

    def test_rates(self):
        r = rates(self.s, {"session_AAA"}, lambda e: "x")
        self.assertEqual(r["x"], (1, 2))
        self.assertEqual(rates(self.s, set(), lambda e: "x", is_ventures)["x"], (0, 1))

    def test_mantel_haenszel(self):
        # equal rates in every stratum -> OR 1
        self.assertAlmostEqual(mantel_haenszel_or([(5, 5, 5, 5), (2, 2, 3, 3)]), 1.0)
        # exposed always recorded, control half -> OR above 1; strata with an empty arm are skipped
        self.assertGreater(mantel_haenszel_or([(10, 0.5, 5, 5), (3, 0, 0, 0)]), 1)
        self.assertIsNone(mantel_haenszel_or([(1, 1, 0, 0)]))

    def test_strata_by_day(self):
        st = strata_by_day(self.s, {"session_AAA"}, lambda e: e["date"] == "2026-10-14", lambda e: e["date"] == "2026-10-15")
        self.assertEqual(st, [(1, 0, 0, 0), (0, 0, 0, 1)])

    def test_prompt_mentions(self):
        self.assertTrue(mentions_record_step("then run `python3 prompts/promptctl.py record --track x`"))
        self.assertTrue(mentions_record_step("No run record in git."))
        self.assertFalse(mentions_record_step("Build the venture."))

    def test_wilson_and_record_session(self):
        lo, hi = wilson(50, 100)
        self.assertTrue(0.40 < lo < 0.41 and 0.59 < hi < 0.60)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))
        self.assertEqual(record_session({"session": "https://claude.ai/code/session_Z9"}), "session_Z9")
        self.assertIsNone(record_session({"session": None}))


if __name__ == "__main__":
    unittest.main()
