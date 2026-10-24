import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_reccover.cover import (parse_log, landed_prs, trailer_sessions, record_session, record_pr, claim_check,
                                window_start, coverage, track_of, orphan_records, wilson)

F, R = "\x1f", "\x1e"
LOG = (f"a{F}2026-10-13{F}feat: x (#101){F}Co-Authored-By: C\nClaude-Session: https://claude.ai/code/session_AAA\nPrompt-Version: research/0{R}\n"
       f"b{F}2026-10-14{F}Merge pull request #102 from o/branch{F}mentions #999 in passing{R}\n"
       f"c{F}2026-10-15{F}wip (#103) follow-up{F}Claude-Session: https://claude.ai/code/session_AAA\nPrompt-Version: process/1{R}\n"
       f"d{F}2026-10-12{F}old{F}Claude-Session: https://claude.ai/code/session_BBB\nPrompt-Version: 0{R}\n")


class T(unittest.TestCase):
    def setUp(self):
        self.commits = parse_log(LOG)

    def test_parse(self):
        self.assertEqual(len(self.commits), 4)

    def test_landed_ignores_mentions_and_mid_subject(self):
        self.assertEqual(landed_prs(self.commits), {101, 102})

    def test_sessions_take_first_date_and_union_versions(self):
        s = trailer_sessions(self.commits)
        self.assertEqual(s["session_AAA"]["date"], "2026-10-13")
        self.assertEqual(s["session_AAA"]["versions"], {"research/0", "process/1"})
        self.assertEqual(s["session_AAA"]["commits"], 2)

    def test_track_of(self):
        self.assertEqual(track_of({"versions": {"research/0", "process/1"}}), ["process", "research"])
        self.assertEqual(track_of({"versions": {"0"}}), ["(version only)"])
        self.assertEqual(track_of({"versions": set()}), ["(no Prompt-Version)"])

    def test_record_fields(self):
        self.assertEqual(record_session({"session": "https://claude.ai/code/session_AAA"}), "session_AAA")
        self.assertIsNone(record_session({"session": None}))
        self.assertEqual(record_pr({"pr": "https://github.com/Duncan-Haywood/oss-monorepo/pull/5"}), 5)
        self.assertEqual(record_pr({"pr": "https://github.com/Duncan-Haywood/oss-research-monorepo/pull/5"}), "other")
        self.assertIsNone(record_pr({"pr": None}))

    def test_claim_check(self):
        mk = lambda n, o: {"outcome": o, "pr": f"https://github.com/Duncan-Haywood/oss-monorepo/pull/{n}"}
        by, missing = claim_check([mk(101, "success"), mk(500, "success"), mk(102, "partial"), {"outcome": "success"}], {101, 102})
        self.assertEqual(by, {"success": (1, 2), "partial": (1, 1)})
        self.assertEqual(missing, [500])

    def test_coverage_and_window(self):
        s = trailer_sessions(self.commits)
        self.assertEqual(coverage(s, {"session_AAA"}, "2026-10-13", lambda e: ["all"]), {"all": (1, 1)})
        self.assertEqual(coverage(s, set(), "2026-10-01", lambda e: ["all"]), {"all": (0, 2)})
        self.assertEqual(window_start(s, {"session_AAA"}, min_recorded=1), "2026-10-13")
        self.assertIsNone(window_start(s, {"session_AAA"}, min_recorded=2))

    def test_orphans(self):
        s = trailer_sessions(self.commits)
        recs = [{"date": "2026-10-14", "outcome": "success", "session": "https://claude.ai/code/session_ZZZ"},
                {"date": "2026-10-14", "outcome": "success", "session": "https://claude.ai/code/session_AAA"},
                {"date": "2026-10-01", "outcome": "success", "session": "https://claude.ai/code/session_QQQ"}]
        self.assertEqual(orphan_records(recs, s, "2026-10-13"), {"success": (1, 2)})

    def test_wilson(self):
        self.assertEqual(wilson(0, 0), (0.0, 1.0))
        lo, hi = wilson(50, 100)
        self.assertLess(lo, 0.5); self.assertGreater(hi, 0.5)
        self.assertAlmostEqual(wilson(10, 10)[1], 1.0)


if __name__ == "__main__":
    unittest.main()
