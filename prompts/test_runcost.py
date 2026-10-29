"""Tests for runcost.py: token sums, pricing, timing, attaching and reporting."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import promptctl
import runcost

PRICING = runcost.load_pricing()


def _usage(inp=10, out=100, read=1000, w5=0, w1=200, thinking=0, speed="standard"):
    return {"input_tokens": inp, "output_tokens": out, "cache_read_input_tokens": read,
            "cache_creation_input_tokens": w5 + w1, "speed": speed,
            "cache_creation": {"ephemeral_5m_input_tokens": w5, "ephemeral_1h_input_tokens": w1},
            "output_tokens_details": {"thinking_tokens": thinking}}


def _assistant(ts, mid, model="claude-opus-5-5", usage=None, blocks=None, **extra):
    return {"type": "assistant", "timestamp": ts, "sessionId": "s1", "uuid": f"u-{ts}",
            "message": {"id": mid, "model": model, "usage": usage or _usage(),
                        "content": blocks or [{"type": "text", "text": "ok"}]}, **extra}


def _user(ts, text=None, tool_id=None):
    content = text if text is not None else [{"type": "tool_result", "tool_use_id": tool_id}]
    return {"type": "user", "timestamp": ts, "sessionId": "s1", "message": {"content": content}}


class Transcript:
    def __init__(self, *files: list[dict]) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.paths = []
        for i, entries in enumerate(files):
            path = Path(self._tmp.name) / f"t{i}.jsonl"
            path.write_text("\n".join(json.dumps(e) for e in entries) + "\nnot json\n")
            self.paths.append(path)

    def close(self) -> None:
        self._tmp.cleanup()


class MeasureTest(unittest.TestCase):
    def setUp(self) -> None:
        tool = {"type": "tool_use", "id": "toolu_1", "name": "Bash"}
        self.t = Transcript([
            _user("2026-10-16T00:00:00Z", "please do the thing"),
            # one response written twice (two content blocks, same usage): counted once
            _assistant("2026-10-16T00:00:30Z", "msg_1", blocks=[{"type": "thinking"}]),
            _assistant("2026-10-16T00:00:31Z", "msg_1", blocks=[tool]),
            _user("2026-10-16T00:02:31Z", tool_id="toolu_1"),
            _assistant("2026-10-16T00:03:01Z", "msg_2", model="claude-sonnet-5-5",
                       usage=_usage(inp=5, out=50, read=0, w5=100, w1=0)),
            _user("2026-10-16T00:13:01Z", "thanks, one more"),
            _assistant("2026-10-16T00:13:31Z", "msg_3", model="<synthetic>"),
            {"type": "attachment", "timestamp": "2026-10-16T00:14:00Z"},
        ])

    def tearDown(self) -> None:
        self.t.close()

    def test_tokens_dedupe_and_split_by_model(self) -> None:
        u = runcost.measure(self.t.paths, PRICING)
        self.assertEqual(set(u["models"]), {"claude-opus-5-5", "claude-sonnet-5-5"})
        opus = u["models"]["claude-opus-5-5"]
        self.assertEqual(opus["requests"], 1)
        self.assertEqual((opus["input"], opus["output"], opus["cache_read"], opus["cache_write_1h"]),
                         (10, 100, 1000, 200))
        self.assertEqual(u["tools"], {"Bash": 1})
        self.assertEqual(u["primary_model"], "claude-opus-5-5")

    def test_api_equivalent_uses_list_prices(self) -> None:
        u = runcost.measure(self.t.paths, PRICING)
        opus = (10 * 4 + 100 * 20 + 1000 * 0.20 + 200 * 8) / 1e6
        sonnet = (5 * 2 + 50 * 10 + 100 * 2.5) / 1e6
        self.assertAlmostEqual(u["models"]["claude-opus-5-5"]["api_equivalent_usd"], round(opus, 4))
        self.assertAlmostEqual(u["totals"]["api_equivalent_usd"], round(opus + sonnet, 4), places=4)
        self.assertTrue(u["totals"]["api_equivalent_complete"])

    def test_timing_separates_model_tool_and_waiting(self) -> None:
        tm = runcost.measure(self.t.paths, PRICING)["time"]
        # model: 30s + 1s + 30s (+30s to the synthetic reply) ; tool: 120s ; waiting: 600s
        self.assertEqual(tm["tool_minutes"], 2.0)
        self.assertEqual(tm["waiting_on_human_minutes"], 10.0)
        self.assertAlmostEqual(tm["model_minutes"], round((30 + 1 + 30 + 30) / 60, 2))
        self.assertEqual(tm["human_prompts"], 2)
        self.assertEqual(tm["active_minutes"], round(tm["model_minutes"] + tm["tool_minutes"], 2))

    def test_since_slices_one_pr_out_of_a_session(self) -> None:
        u = runcost.measure(self.t.paths, PRICING, since=runcost.parse_ts("2026-10-16T00:03:00Z"))
        self.assertEqual(set(u["models"]), {"claude-sonnet-5-5"})

    def test_stall_is_counted_not_timed(self) -> None:
        t = Transcript([_user("2026-10-16T00:00:00Z", "go"),
                        _assistant("2026-10-16T02:00:00Z", "m")])
        try:
            tm = runcost.measure(t.paths, PRICING)["time"]
        finally:
            t.close()
        self.assertEqual((tm["stalls"], tm["active_minutes"]), (1, 0.0))

    def test_unknown_model_is_flagged_not_priced(self) -> None:
        t = Transcript([_assistant("2026-10-16T00:00:00Z", "m", model="claude-future-9")])
        try:
            u = runcost.measure(t.paths, PRICING)
        finally:
            t.close()
        self.assertIsNone(u["totals"]["api_equivalent_usd"])
        self.assertTrue(any("claude-future-9" in n for n in u["not_counted"]))

    def test_subagent_files_add_tokens_and_their_own_minutes(self) -> None:
        sub = [_assistant("2026-10-16T00:01:00Z", "sub_1", model="claude-haiku-5-5", isSidechain=True),
               _assistant("2026-10-16T00:04:00Z", "sub_2", model="claude-haiku-5-5", isSidechain=True)]
        t = Transcript([_user("2026-10-16T00:00:00Z", "go")], sub)
        try:
            u = runcost.measure(t.paths, PRICING)
        finally:
            t.close()
        self.assertEqual(u["models"]["claude-haiku-5-5"]["requests"], 2)
        self.assertEqual(u["time"]["subagent_minutes"], 3.0)


class PricingTest(unittest.TestCase):
    def test_haiku_long_prompt_rate_card(self) -> None:
        short = {"input": 1000, "output": 0, "cache_read": 0, "cache_write_5m": 0, "cache_write_1h": 0}
        long = {**short, "input": 200_000}
        self.assertAlmostEqual(runcost.price_request("claude-haiku-5-5", short, False, PRICING), 1000 * 0.10 / 1e6)
        self.assertAlmostEqual(runcost.price_request("claude-haiku-5-5", long, False, PRICING), 200_000 * 0.50 / 1e6)

    def test_fast_mode_multiplier(self) -> None:
        u = {"input": 0, "output": 1_000_000, "cache_read": 0, "cache_write_5m": 0, "cache_write_1h": 0}
        self.assertAlmostEqual(runcost.price_request("claude-opus-5-5", u, True, PRICING), 40.0)

    def test_every_row_has_every_rate(self) -> None:
        for model, rates in PRICING["models"].items():
            for key in ("input", "output", "cache_write_5m", "cache_write_1h", "cache_read"):
                self.assertIsInstance(rates[key], (int, float), f"{model}.{key}")


class AttachAndReportTest(unittest.TestCase):
    def test_attach_fills_nulls_validates_and_reports(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "prompts"
            (root / "runs").mkdir(parents=True)
            rec = json.loads(json.dumps(promptctl.RECORD_FIELDS))
            rec.update({"date": "2026-10-16", "session": "x", "track": "ventures",
                        "prompt_version": 0, "outcome": "success", "merged": True,
                        "tokens_out": 7})  # a value already there is kept
            path = root / "runs" / "2026-10-16-x.json"
            path.write_text(json.dumps(rec))
            t = Transcript([_user("2026-10-16T00:00:00Z", "go"),
                            _assistant("2026-10-16T00:01:00Z", "m")])
            try:
                usage = runcost.measure(t.paths, PRICING)
            finally:
                t.close()
            runcost.human_equivalent(usage, 2, "one engineer, half a morning", PRICING)
            out = runcost.attach(path, usage)
            self.assertEqual(out["tokens_out"], 7)
            self.assertEqual(out["tokens_in"], 10 + 1000 + 200)
            self.assertEqual(out["models_seen"], ["claude-opus-5-5"])
            self.assertEqual(out["usage"]["human_equivalent"]["usd"], 200.0)
            self.assertGreater(out["usage"]["leverage"], 1)
            self.assertEqual(promptctl.validate_usage("r", out["usage"]), [])
            r = runcost.report(root)
            self.assertEqual(r["records_with_usage"], 1)
            self.assertEqual(r["by_model"]["claude-opus-5-5"]["successful"], 1)

    def test_by_project_sums_hours_and_counts_unestimated_runs(self) -> None:
        def rec(projects: list[str], hours: float | None) -> dict:
            usage = {"human_equivalent": {"hours": hours}} if hours is not None else None
            return {"projects": projects, "usage": usage}
        r = runcost.by_project([rec(["a", "b"], 150), rec(["a"], 60), rec(["a"], None), rec([], 5)])
        self.assertEqual(r["records"], 4)
        self.assertEqual(r["records_with_hours"], 3)
        self.assertEqual(list(r["projects"]), ["a", "b"])
        self.assertEqual(r["projects"]["a"], {"runs": 3, "runs_with_hours": 2, "human_hours": 210.0})
        self.assertEqual(r["over"], {"20": 2, "200": 1, "300": 0})

    def test_hand_typed_usage_is_rejected(self) -> None:
        self.assertTrue(promptctl.validate_usage("r", {"measured_by": "by hand", "totals": {}}))
        self.assertTrue(promptctl.validate_usage("r", ["not", "an", "object"]))
        # the one pre-tool record (no measured_by) is left alone
        self.assertEqual(promptctl.validate_usage("r", {"input_tokens": 1, "cost_usd": 0.1}), [])

    def test_usage_without_a_human_estimate_validates(self) -> None:
        t = Transcript([_user("2026-10-16T00:00:00Z", "go"), _assistant("2026-10-16T00:01:00Z", "m")])
        try:
            usage = runcost.measure(t.paths, PRICING)
        finally:
            t.close()
        self.assertEqual(promptctl.validate_usage("r", usage), [])

    def test_estimate_needs_a_basis(self) -> None:
        with self.assertRaises(SystemExit):
            runcost.human_equivalent({"totals": {}}, 1, "  ", PRICING)


if __name__ == "__main__":
    unittest.main()
