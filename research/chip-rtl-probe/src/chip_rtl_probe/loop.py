"""Feedback loop: a proposer writes RTL, the checker scores it, the failure text goes back."""
import json
import os
import random
import tempfile
import urllib.request
from pathlib import Path

from .check import ROOT, TASKS, evaluate
from .mutate import mutants

MAX_ROUNDS = 5


class Replay:
    """Deterministic stub: replays attempts/<task>/round<k>.v written earlier (by the session agent)."""
    name = "replay"

    def propose(self, task, history):
        f = ROOT / "attempts" / task / f"round{len(history)}.v"
        return f.read_text() if f.exists() else None


class RandomMutation:
    """Non-LLM baseline: start from a given broken design, apply one random single-point mutation
    to it per round, ignoring the feedback text. Same checker, same evaluation budget."""
    name = "random-mutation"

    def __init__(self, start_src, seed):
        self.start, self.rng = start_src, random.Random(seed)
        self.cands = [s for _, s in mutants(start_src)]

    def propose(self, task, history):
        if not history:
            return self.start
        return self.rng.choice(self.cands) if self.cands else None


class Anthropic:
    """LLM proposer. Needs ANTHROPIC_API_KEY and CHIP_RTL_MODEL. NOT exercised in this repository's
    results (no key in the build environment); the request shape follows the public Messages API."""
    name = "anthropic"

    def propose(self, task, history):
        key, model = os.environ["ANTHROPIC_API_KEY"], os.environ["CHIP_RTL_MODEL"]
        prompt = (TASKS / task / "spec.md").read_text() + "\nReply with one Verilog module only, no prose.\n"
        for h in history:
            prompt += f"\nPrevious attempt:\n{h['source']}\nChecker feedback ({h['stage']} stage): {h['feedback']}\n"
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            json.dumps({"model": model, "max_tokens": 2000, "messages": [{"role": "user", "content": prompt}]}).encode(),
            {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        text = json.load(urllib.request.urlopen(req, timeout=120))["content"][0]["text"]
        return text.replace("```verilog", "").replace("```", "").strip() + "\n"


def run_task(task, proposer, max_rounds=MAX_ROUNDS):
    """Return the per-round history; stops at the first full pass or when the proposer gives up."""
    history = []
    with tempfile.TemporaryDirectory() as tmp:
        for k in range(max_rounds):
            src = proposer.propose(task, history)
            if src is None:
                break
            f = Path(tmp) / f"r{k}.v"
            f.write_text(src)
            r = evaluate(task, f)
            history.append({"round": k, "source": src, **r})
            if r["stage"] is None:
                break
    return history
