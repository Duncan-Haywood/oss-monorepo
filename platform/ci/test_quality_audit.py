"""Tests for platform/ci/quality_audit.py (the quality-audit programme, portfolio/quality/)."""
import datetime as dt
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("quality_audit", Path(__file__).with_name("quality_audit.py"))
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)

FULL = {d: 3 for d in q.DIMENSIONS}
EV = {d: "ran the command and compared three outputs against the published table" for d in q.DIMENSIONS}


def audit(subject="ventures/ai-bookkeeper", stratum="venture", date="2026-11-07", **kw):
    a = {"_file": f"{date}-{subject.split('/')[-1]}.json", "date": date, "subject": subject, "stratum": stratum,
         "status": "audited", "professional": "a CPA", "scores": dict(FULL), "evidence": dict(EV),
         "defects": [], "fix_prs": [], "verdict": "fine"}
    a.update(kw)
    return a


POP = {"flagship": ["ventures/a", "ventures/b"], "venture": [f"ventures/{c}" for c in "abcdefgh"],
       "research": [f"research/r{i}" for i in range(10)], "platform": ["platform/p1", "platform/p2"]}


class QualityAuditTest(unittest.TestCase):
    def test_bar_needs_every_gate(self):
        assert q.meets_bar(FULL)
        for gate in q.GATES:
            assert not q.meets_bar({**FULL, gate: 2}), gate
        # a non-gate dimension below the bar is outweighed only while the median holds
        assert q.meets_bar({**FULL, "fitness": 1})
        assert not q.meets_bar({**FULL, "fitness": 1, "craft": 2, "domain": 2, "completeness": 2})


    def test_finished_is_completeness(self):
        assert q.finished(FULL) and not q.finished({**FULL, "completeness": 2})


    def test_wilson_known_values(self):
        lo, hi = q.wilson(40, 40)
        assert round(lo, 3) == 0.912 and hi == 1.0
        assert q.wilson(0, 0) == (0.0, 1.0)
        lo, hi = q.wilson(5, 10)
        assert round(lo, 3) == 0.237 and round(hi, 3) == 0.763


    def test_validate_accepts_good_and_names_problems(self):
        assert q.validate_audit(audit()) == []
        bad = audit(scores={**FULL, "craft": 5}, evidence={**EV, "claims": "ok"}, stratum="other", professional="")
        errs = "\n".join(q.validate_audit(bad))
        for needle in ("scores.craft", "evidence.claims", "stratum", "professional"):
            assert needle in errs
        assert any("date" in e for e in q.validate_audit(audit(_file="2026-11-08-ai-bookkeeper.json")))
        assert any("not a path" in e for e in q.validate_audit(audit(subject="ventures/no-such-thing-xyz", _file="2026-11-07-no-such-thing-xyz.json")))
        assert any("severity" in e for e in q.validate_audit(audit(defects=[{"severity": "huge", "what": "x"}])))


    def test_unauditable_needs_no_scores(self):
        assert q.validate_audit(audit(status="unauditable", scores={}, evidence={}, professional="")) == []



    def test_draw_is_reproducible_and_stratified(self):
        one = q.draw("2026-11-07", audits=[], pop=POP, today=dt.date(2026, 11, 7))
        assert one == q.draw("2026-11-07", audits=[], pop=POP, today=dt.date(2026, 11, 7))
        assert [p["stratum"] for p in one] == ["flagship", "venture", "venture", "research", "research", "platform"]
        assert one[0]["subject"] == "ventures/a"
        # a flagship is never drawn again in the venture stratum
        assert all(p["subject"] not in POP["flagship"] for p in one if p["stratum"] == "venture")
        assert len({p["subject"] for p in one}) == len(one)


    def test_draw_rotates_flagships_and_skips_recent(self):
        done = [audit(subject="ventures/a", stratum="flagship", date="2026-11-01")]
        done += [audit(subject=f"research/r{i}", stratum="research", date="2026-11-01") for i in range(8)]
        picks = q.draw("x", audits=done, pop=POP, today=dt.date(2026, 11, 7))
        assert picks[0]["subject"] == "ventures/b"
        assert sorted(p["subject"] for p in picks if p["stratum"] == "research") == ["research/r8", "research/r9"]
        # after the skip window they are eligible again
        later = q.draw("x", audits=done, pop=POP, today=dt.date(2027, 3, 1))
        assert len([p for p in later if p["stratum"] == "research"]) == 2


    def test_summary_uses_latest_audit_and_reports_sampled_share(self):
        rows = [
            audit(subject="ventures/a", date="2026-11-01", scores={**FULL, "correctness": 1}),
            audit(subject="ventures/a", date="2026-11-07"),  # re-audit after a fix replaces the row
            audit(subject="ventures/b", scores={**FULL, "claims": 2}, defects=[{"severity": "high", "what": "x"}]),
            audit(subject="ventures/c", stratum="flagship"),
        ]
        s = q.summarize(rows)
        assert s["subjects"] == 3 and s["audits"] == 4
        assert s["strata"]["venture"]["n"] == 2 and s["strata"]["venture"]["meets_bar"] == 1
        assert s["sampled"]["n"] == 2  # the flagship is chosen, not sampled
        assert s["defects"]["high"] == 1
        assert s["rounds"]["2026-11-01"] == {"n": 1, "meets_bar": 0}
        md = q.render_md(s)
        assert "1 of 2" in md and "| `ventures/c` | flagship |" in md


    def test_population_reads_the_repository(self):
        pop = q.population()
        assert pop["flagship"] and all(p.startswith("ventures/") for p in pop["flagship"])
        assert not any(p.split("/")[1].startswith("_") for p in pop["research"])


    def test_history_counts_follow_through_and_refound_highs(self):
        hi = {"severity": "high", "what": "wrong total", "where": "ventures/a/calc.mjs:12"}
        other = {"severity": "high", "what": "x", "where": "ventures/a/page.html:3"}
        audits = [
            audit("ventures/a", date="2026-11-07", defects=[hi], fix_prs=[]),
            audit("ventures/a", date="2026-11-08", defects=[{**hi, "where": "ventures/a/calc.mjs:40 and README"}],
                  scores={**FULL, "claims": 2}),
            audit("ventures/b", date="2026-11-08", defects=[other], fix_prs=["#1"]),
            audit("ventures/c", date="2026-11-07"),
            audit("ventures/c", date="2026-11-09"),
        ]
        audits[1]["_file"] = "2026-11-08-a.json"
        h = q.history(audits)
        assert (h["audits"], h["with_high"], h["with_high_and_fix_prs"], h["with_fix_prs"]) == (5, 3, 1, 1)
        assert [r["subject"] for r in h["reaudited"]] == ["ventures/a", "ventures/c"]
        assert h["reaudited"][0]["change"] == -1 and h["reaudited"][0]["bar"] == [True, False]
        assert h["reaudit_change"] == {"up": 0, "flat": 1, "down": 1}
        assert h["refound_high"] == [{"subject": "ventures/a", "file": "ventures/a/calc.mjs",
                                      "first": "2026-11-07-a.json", "again": "2026-11-08-a.json"}]
        md = q.render_history_md(h)
        assert "ventures/a/calc.mjs" in md and "of which 1 list a fix PR" in md

    def test_defect_file_ignores_line_numbers_and_prose(self):
        assert q.defect_file({"where": "ventures/x/calc.mjs:25"}) == "ventures/x/calc.mjs"
        assert q.defect_file({"where": "index.html:opts() (inline module script)"}) == "index.html"
        assert q.defect_file({"where": "no file named"}) == ""


if __name__ == "__main__":
    unittest.main()
