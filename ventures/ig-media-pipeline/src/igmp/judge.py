"""Where Claude's judgment comes from. Two interchangeable backends:

  claude-code  runs `claude -p` headlessly on your Claude plan, and refuses to start when the CLI is
               signed in any other way (a Console login or an API key bills every call per token)
  api          calls the Anthropic API; bulk work goes through the Message Batches API (half price)

Both take the same JudgeTask and return a validated pydantic object. The style guide is the system
prompt for every call, so it is cached once and shared by every stage.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Generic, Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from .config import Config
from .models import strict_schema

log = logging.getLogger(__name__)
M = TypeVar("M", bound=BaseModel)

PREAMBLE = (
    "You are the photo editor and taste-maker for one photographer's Instagram account. "
    "Judge only by the style guide below and by what you can see. Answer with the requested "
    "JSON and nothing else.\n\n"
)


@dataclass
class JudgeTask(Generic[M]):
    key: str
    instructions: str
    output: type[M]
    images: list[Path] = field(default_factory=list)
    effort: str = "medium"
    max_tokens: int = 8000


class JudgeError(RuntimeError):
    pass


class UsageLimit(JudgeError):
    """The plan's usage limit was reached; the run should pause and resume later."""


class NotOnPlan(JudgeError):
    """Headless Claude Code would bill API usage instead of the Claude plan."""


OnResult = Callable[[str, "BaseModel | JudgeError"], None]


class Backend(Protocol):
    def judge(self, task: JudgeTask[M]) -> M: ...
    def judge_many(self, tasks: list[JudgeTask[M]], on_result: OnResult | None = None
                   ) -> dict[str, M | JudgeError]: ...


def system_prompt(cfg: Config) -> str:
    return PREAMBLE + cfg.style_guide_text()


class InvalidAnswer(JudgeError):
    """The answer didn't fit the schema; worth one retry that says what was wrong."""

    def __init__(self, key: str, error: Exception):
        self.problem = str(error).replace("\n", " ")[:600]
        super().__init__(f"{key}: unusable answer: {self.problem}")


def _parse(task: JudgeTask[M], text: str) -> M:
    try:
        return task.output.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as e:
        raise InvalidAnswer(task.key, e) from e


# --- Anthropic API -------------------------------------------------------------------------------

class ApiBackend:
    FALLBACK_BETA = "server-side-fallback-2026-07-01"
    BATCH_BYTES = 180 * 1024 * 1024        # stay under the 256 MB batch limit

    def __init__(self, cfg: Config, client=None):
        import anthropic
        self.cfg = cfg
        self.client = client or anthropic.Anthropic()
        self.system = [{"type": "text", "text": system_prompt(cfg), "cache_control": {"type": "ephemeral"}}]

    def _content(self, task: JudgeTask) -> list[dict]:
        blocks = [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                               "data": base64.standard_b64encode(Path(p).read_bytes()).decode()}}
                  for p in task.images]
        return blocks + [{"type": "text", "text": task.instructions}]

    def _params(self, task: JudgeTask) -> dict:
        return {
            "model": self.cfg.model,
            "max_tokens": task.max_tokens,
            "system": self.system,
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": task.effort,
                              "format": {"type": "json_schema", "schema": strict_schema(task.output)}},
            "messages": [{"role": "user", "content": self._content(task)}],
        }

    @staticmethod
    def _text(message) -> str:
        if message.stop_reason == "refusal":
            raise JudgeError(f"declined: {getattr(message.stop_details, 'category', None)}")
        return next(b.text for b in message.content if b.type == "text")

    def judge(self, task: JudgeTask[M]) -> M:
        # Single calls opt into server-side fallback; the Batches API rejects that parameter.
        message = self.client.beta.messages.create(
            **self._params(task), betas=[self.FALLBACK_BETA], extra_body={"fallbacks": "default"})
        return _parse(task, self._text(message))

    def judge_many(self, tasks: list[JudgeTask[M]], on_result: OnResult | None = None
                   ) -> dict[str, M | JudgeError]:
        from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
        from anthropic.types.messages.batch_create_params import Request

        out: dict[str, M | JudgeError] = {}
        by_key = {t.key: t for t in tasks}
        chunk, size = [], 0
        chunks = []
        for t in tasks:
            est = sum(Path(p).stat().st_size for p in t.images) * 4 // 3 + 20_000
            if chunk and size + est > self.BATCH_BYTES:
                chunks.append(chunk); chunk, size = [], 0
            chunk.append(t); size += est
        if chunk:
            chunks.append(chunk)
        for part in chunks:
            batch = self.client.messages.batches.create(requests=[
                Request(custom_id=t.key, params=MessageCreateParamsNonStreaming(**self._params(t))) for t in part])
            log.info("batch %s: %d requests", batch.id, len(part))
            while (batch := self.client.messages.batches.retrieve(batch.id)).processing_status != "ended":
                time.sleep(30)
            for r in self.client.messages.batches.results(batch.id):
                t = by_key[r.custom_id]
                try:
                    if r.result.type != "succeeded":
                        raise JudgeError(f"batch result {r.result.type}")
                    out[t.key] = _parse(t, self._text(r.result.message))
                except JudgeError:
                    try:                       # one interactive retry, with fallback enabled
                        out[t.key] = self.judge(t)
                    except JudgeError as e:
                        out[t.key] = e
                if on_result:
                    on_result(t.key, out[t.key])
        return out


# --- Claude Code on the user's plan --------------------------------------------------------------

# `claude auth status` methods that run on a Claude subscription. Everything else - the API key a
# Console login keeps, ANTHROPIC_API_KEY, an apiKeyHelper, a gateway - bills per token.
PLAN_AUTH = {"claude.ai"}
PAID_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")
PLAN_LIMIT = re.compile(r"hit your (?:\w+ )?limit\s*[·-]\s*resets ([^\n\"]+)", re.I)
TRANSIENT = re.compile(r"\b(429|529|overloaded|temporary capacity)\b", re.I)


def seconds_until(reset_text: str, now: datetime | None = None) -> float:
    """'3:45pm' or 'Mon 12:00am' (local time) -> seconds to wait, plus a minute of slack.
    Unparseable text waits 30 minutes and lets the next attempt find out."""
    now = now or datetime.now()
    text = reset_text.strip().split("(")[0].strip().lower()
    for fmt in ("%a %I:%M%p", "%a %I%p", "%I:%M%p", "%I%p"):
        try:
            t = datetime.strptime(text, fmt)
        except ValueError:
            continue
        target = now.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0)
        if fmt.startswith("%a"):
            target += timedelta(days=(t.weekday() - now.weekday()) % 7)
        if target <= now:
            target += timedelta(days=7 if fmt.startswith("%a") else 1)
        return (target - now).total_seconds() + 60
    return 1800.0


class ClaudeCodeBackend:
    """`claude -p` in headless mode on the logged-in Claude plan. Images are passed as files Claude
    reads with its Read tool; the answer is validated against the same schema the API path uses.
    Plan limits ("You've hit your session limit · resets 3:45pm") pause the run until the reset."""

    def __init__(self, cfg: Config, runner=subprocess.run, sleep=time.sleep):
        self.cfg = cfg
        self.run = runner
        self.sleep = sleep
        self.system = system_prompt(cfg)
        # In print mode an API key always wins over the plan login, so keep it out of the child.
        self.env = {k: v for k, v in os.environ.items() if k not in PAID_ENV}

    def check_plan_login(self) -> None:
        """Refuse to start unless headless Claude Code is signed in to a Claude subscription. The
        desktop app's sign-in does not carry over to the CLI, and a Console login keeps an API key
        that print mode bills per token, so this is checked rather than assumed."""
        proc = self.run([self.cfg.claude_cli, "auth", "status"], capture_output=True, text=True,
                        timeout=60, env=self.env)
        try:
            status = json.loads(proc.stdout)
        except json.JSONDecodeError:
            status = {}
        method = status.get("authMethod")
        if method not in PLAN_AUTH:
            how = status.get("apiKeySource") or method or "no login"
            raise NotOnPlan(
                f"headless Claude Code is signed in with {how}, which bills API usage per token, not your "
                f"Claude plan. Sign it in to the plan with `{self.cfg.claude_cli} auth login --claudeai` "
                "(check with `claude auth status`: authMethod must be \"claude.ai\"), or set "
                "backend = \"api\" to use the API on purpose.")

    def _args(self, task: JudgeTask) -> list[str]:
        # Not --bare: bare mode only accepts an API key, and this path exists to use the plan login.
        dirs = sorted({str(Path(p).resolve().parent) for p in task.images})
        return [
            self.cfg.claude_cli, "-p", self._prompt(task),
            "--model", self.cfg.model,
            "--effort", task.effort,
            "--output-format", "json",
            "--json-schema", json.dumps(strict_schema(task.output)),
            "--system-prompt", self.system,
            "--tools", "Read",
            "--allowedTools", "Read",
            "--permission-mode", "dontAsk",
            "--disable-slash-commands",
            "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
            "--no-session-persistence",
            *(a for d in dirs for a in ("--add-dir", d)),
        ]

    @staticmethod
    def _prompt(task: JudgeTask) -> str:
        files = "\n".join(f"- {p}" for p in task.images)
        look = f"Look at these image files with the Read tool before answering:\n{files}\n\n" if files else ""
        return look + task.instructions

    def _once(self, task: JudgeTask[M]) -> M:
        # Run from the output folder so no repository CLAUDE.md is picked up as context.
        # (the state disk while the output drive is away: never mkdir under a missing /Volumes/<drive>)
        from .outputs import work_cwd
        cwd = work_cwd(self.cfg)
        cwd.mkdir(parents=True, exist_ok=True)
        proc = self.run(self._args(task), capture_output=True, text=True, timeout=900,
                        cwd=cwd, env=self.env)
        blob = proc.stdout.strip()
        try:
            result = json.loads(blob) if blob else {}
        except json.JSONDecodeError:
            result = {"result": blob}
        text = f'{result.get("result", "")} {proc.stderr}'
        failed = proc.returncode != 0 or result.get("is_error") or result.get("subtype", "success") != "success"
        if failed:
            if m := PLAN_LIMIT.search(text):
                raise UsageLimit(m.group(1))
            raise JudgeError(f"{task.key}: claude exited {proc.returncode}: {text.strip()[:300]}")
        structured = result.get("structured_output")
        if structured is not None:
            try:
                return task.output.model_validate(structured)
            except ValidationError as e:
                raise InvalidAnswer(task.key, e) from e
        return _parse(task, result.get("result", ""))

    def judge(self, task: JudgeTask[M]) -> M:
        retried = False
        for attempt in range(6):
            try:
                return self._once(task)
            except InvalidAnswer as e:
                if retried:
                    raise
                # one retry with the exact problem, then give up on this item
                retried = True
                task = replace(task, instructions=f"{task.instructions}\n\nYour previous answer was rejected: "
                                                  f"{e.problem}. Answer again with every field the schema requires.")
            except UsageLimit as e:
                wait = seconds_until(str(e))
                log.warning("plan limit reached; resuming in %.0f min (resets %s)", wait / 60, e)
                self.sleep(wait)
            except JudgeError as e:
                if not TRANSIENT.search(str(e)) or attempt == 5:
                    raise
                self.sleep(min(600, 15 * 2 ** attempt))
        raise JudgeError(f"{task.key}: gave up after repeated limits")

    def judge_many(self, tasks: list[JudgeTask[M]], on_result: OnResult | None = None
                   ) -> dict[str, M | JudgeError]:
        """Answers in parallel. on_result(key, answer or error) runs in this thread as each one
        arrives, so a caller can save every answer the moment it exists."""
        def one(t):
            try:
                return self.judge(t)
            except JudgeError as e:
                return e

        out: dict[str, M | JudgeError] = {}
        with ThreadPoolExecutor(self.cfg.parallel) as pool:
            futures = {pool.submit(one, t): t.key for t in tasks}
            for f in as_completed(futures):
                out[futures[f]] = f.result()
                if on_result:
                    on_result(futures[f], out[futures[f]])
        return out


def backend(cfg: Config) -> Backend:
    if cfg.backend == "api":
        return ApiBackend(cfg)
    if cfg.backend == "claude-code":
        judge = ClaudeCodeBackend(cfg)
        judge.check_plan_login()
        return judge
    raise ValueError(f"unknown backend {cfg.backend!r}; use 'claude-code' or 'api'")
