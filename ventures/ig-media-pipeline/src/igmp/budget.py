"""A hard daily cap on the Claude tokens the cloud worker spends.

The worker calls the API unattended, so every call goes through `BudgetedJudge`, which wraps any
judge backend (same `judge` / `judge_many` interface) and keeps a `TokenBudget`:

  TokenBudget(store, per_day)   tokens used per UTC day, in the store table `meta` under
                                `budget:<YYYY-MM-DD>` (input + output + cache-creation tokens; cache
                                reads are recorded but not counted, they cost a tenth of an input
                                token). It travels with the state snapshot, so a restarted or moved
                                worker knows what today already cost.
  BudgetedJudge(inner, budget)  checks the budget before each call and records usage after it. The
                                API backend reports each response's `usage` through its `on_usage`
                                hook (single calls, batch results and their retries); the claude-code
                                backend is not billed per token, so only its calls are counted (and
                                capped only when `calls_per_day` is set).

How a stop reaches the stages (read `taste.py`, `editing.py`, `reels.py`, `carousels.py`,
`astro.py` and `direction.py` before changing this):

* `judge_many` never raises for the budget. It submits only the tasks that fit what is left of
  today (estimated per task from the running average of earlier calls, or `task_estimate`) and
  returns no result, and calls no `on_result`, for the rest. Every stage treats a missing result
  as "not done yet": nothing is stored, and the task is asked again next cycle (`direction`
  falls back to its rule-based transitions for a missing answer, as it does for an error). A
  `JudgeError` result, by contrast, is written to the `jobs` table as a failure, so trimmed tasks
  are deliberately not turned into errors.
* A single `judge` call cannot return without an answer, so on an exhausted budget it raises
  `BudgetExhausted`. That class derives from `BaseException`, not `Exception`: the stages catch
  `JudgeError` (and reels catches every `Exception` per reel) and store it as a failed job, then
  carry on with the next item, each of which would render first and fail at its critic. As a
  `BaseException` it passes through those handlers (and through thread pools, whose futures re-raise
  it) exactly like Ctrl-C does, and the stages are already built to resume after Ctrl-C: every
  plan, round and checkpoint is saved before the next call. The worker catches it around the
  pipeline and records a clean budget stop. Nothing else in the package catches `BaseException`
  except render writers that abort a partial file and re-raise.

The cap can be overshot by at most one call (a single call is checked before, not during) or by
the estimate error of one trimmed batch.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Callable

log = logging.getLogger(__name__)

DEFAULT_TASK_TOKENS = 12_000     # per-task estimate until there is a history: an image, the cached
                                 # style guide being written once, and adaptive thinking
MIN_HISTORY = 5                  # calls before the running average replaces the default
SAFETY = 1.5                     # the average is scaled up by this much for batch trimming
STATS_KEY = "budget:stats"


class BudgetExhausted(BaseException):
    """Today's token (or call) cap is reached. A BaseException on purpose; see the module docstring."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def tokens_of(usage) -> dict[str, int]:
    """An Anthropic `usage` object (or a dict with the same names) -> plain ints, missing = 0."""
    def get(name: str) -> int:
        v = usage.get(name) if isinstance(usage, dict) else getattr(usage, name, None)
        try:
            return int(v or 0)
        except (TypeError, ValueError):
            return 0
    return {"input": get("input_tokens"), "output": get("output_tokens"),
            "cache_creation": get("cache_creation_input_tokens"), "cache_read": get("cache_read_input_tokens")}


class TokenBudget:
    def __init__(self, store, per_day: int | None, clock: Callable[[], datetime] = _utcnow, *,
                 calls_per_day: int | None = None, task_estimate: int | None = None):
        self.store = store
        self.per_day = per_day                  # None: no token cap (accounting only)
        self.calls_per_day = calls_per_day
        self.task_estimate = task_estimate
        self.clock = clock
        self.lock = threading.Lock()

    def day(self) -> str:
        now = self.clock()
        if now.tzinfo is not None:
            now = now.astimezone(timezone.utc)
        return now.strftime("%Y-%m-%d")

    def usage(self, day: str | None = None) -> dict:
        rec = self.store.get("meta", f"budget:{day or self.day()}") or {}
        return {k: int(rec.get(k, 0)) for k in ("tokens", "calls", "input", "output", "cache_creation", "cache_read")}

    def used(self) -> int:
        return self.usage()["tokens"]

    def remaining(self) -> int | None:
        return None if self.per_day is None else max(0, self.per_day - self.used())

    def exhausted(self) -> bool:
        u = self.usage()
        if self.per_day is not None and u["tokens"] >= self.per_day:
            return True
        return self.calls_per_day is not None and u["calls"] >= self.calls_per_day

    def check(self) -> None:
        if self.exhausted():
            u = self.usage()
            raise BudgetExhausted(f"daily budget reached for {self.day()}: {u['tokens']} of "
                                  f"{self.per_day} tokens, {u['calls']} calls")

    def record(self, usage=None, *, calls: int = 1) -> int:
        """Add one response's usage (None: a call with no token count). Returns the tokens counted."""
        t = tokens_of(usage) if usage is not None else {"input": 0, "output": 0, "cache_creation": 0,
                                                         "cache_read": 0}
        counted = t["input"] + t["output"] + t["cache_creation"]
        with self.lock:
            key = f"budget:{self.day()}"
            rec = self.usage(key.split(":", 1)[1])
            for k, v in t.items():
                rec[k] += v
            rec["tokens"] += counted
            rec["calls"] += calls
            self.store.put("meta", key, rec)
            if usage is not None:               # the running average only learns from priced calls
                stats = self.store.get("meta", STATS_KEY) or {"calls": 0, "tokens": 0}
                stats = {"calls": int(stats.get("calls", 0)) + calls,
                         "tokens": int(stats.get("tokens", 0)) + counted}
                self.store.put("meta", STATS_KEY, stats)
        return counted

    def estimate(self) -> int:
        """Tokens one task is expected to cost, on the high side."""
        if self.task_estimate:
            return int(self.task_estimate)
        stats = self.store.get("meta", STATS_KEY) or {}
        calls, tokens = int(stats.get("calls", 0)), int(stats.get("tokens", 0))
        if calls >= MIN_HISTORY and tokens > 0:
            return max(1, int(tokens / calls * SAFETY))
        return DEFAULT_TASK_TOKENS

    def fits(self, n: int, *, by_tokens: bool = True) -> int:
        """How many of n tasks to send now. At least one while the budget is not exhausted (the
        same overshoot a single call allows), never more than the estimate says is left."""
        if n <= 0 or self.exhausted():
            return 0
        k = n
        if by_tokens and self.per_day is not None:
            k = min(k, max(1, (self.per_day - self.used()) // self.estimate()))
        if self.calls_per_day is not None:
            k = min(k, max(0, self.calls_per_day - self.usage()["calls"]))
        return k

    def summary(self) -> dict:
        u = self.usage()
        return {"day": self.day(), "tokens": u["tokens"], "cap": self.per_day, "calls": u["calls"],
                "calls_cap": self.calls_per_day, "cache_read": u["cache_read"], "exhausted": self.exhausted(),
                "task_estimate": self.estimate()}


class BudgetedJudge:
    """Any judge backend behind a TokenBudget. `stopped` turns true once a call or batch was held
    back by the budget; `deferred` counts the tasks left for a later cycle."""

    def __init__(self, inner, budget: TokenBudget):
        self.inner = inner
        self.budget = budget
        self.stopped = False
        self.deferred = 0
        # the API backend reports real token usage; anything else is counted per call
        self.metered = hasattr(inner, "on_usage")
        if self.metered:
            previous = getattr(inner, "on_usage", None)

            def on_usage(key: str, usage) -> None:
                budget.record(usage)
                if previous is not None:
                    previous(key, usage)
            inner.on_usage = on_usage

    def _stop(self, what: str) -> None:
        if not self.stopped:
            u = self.budget.usage()
            log.warning("token budget for %s reached (%d of %s tokens, %d calls): %s",
                        self.budget.day(), u["tokens"], self.budget.per_day, u["calls"], what)
        self.stopped = True

    def judge(self, task):
        try:
            self.budget.check()
        except BudgetExhausted:
            self._stop(f"stopping before {task.key}")
            raise
        try:
            return self.inner.judge(task)
        finally:
            if not self.metered:
                self.budget.record(None)

    def judge_many(self, tasks, on_result=None):
        tasks = list(tasks)
        n = self.budget.fits(len(tasks), by_tokens=self.metered)
        if n < len(tasks):
            self.deferred += len(tasks) - n
            self._stop(f"{len(tasks) - n} of {len(tasks)} tasks left for a later cycle")
        if n == 0:
            return {}
        send = tasks[:n]

        def counted(key, result):
            if not self.metered:
                self.budget.record(None)
            if on_result is not None:
                on_result(key, result)

        return self.inner.judge_many(send, on_result=counted)
