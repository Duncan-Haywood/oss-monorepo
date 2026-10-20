"""Optional model proposer. UNTESTED in this repository: the run environment has no API key.

Set ANTHROPIC_API_KEY (and optionally CHIP_LLM_MODEL) to use it. Without a key,
`stub_proposer` returns None and callers fall back to committed session attempts.
"""
import json
import os
import re
import urllib.request


def stub_proposer(task, spec_text, history):
    """Deterministic stand-in used by tests: never proposes anything."""
    return None


def llm_proposer(task, spec_text, history):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    prompt = (f"Write synthesizable Verilog-2001 for this spec. Reply with one module in a "
              f"```verilog block.\n\nSpec: {spec_text}\n")
    for src, fb in history:
        prompt += f"\nPrevious attempt:\n{src}\nChecker feedback: {fb}\n"
    body = json.dumps({"model": os.environ.get("CHIP_LLM_MODEL", "claude-sonnet-5-5"),
                       "max_tokens": 1500,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", body, {
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    text = json.load(urllib.request.urlopen(req, timeout=60))["content"][0]["text"]
    m = re.search(r"```verilog\n(.*?)```", text, re.S)
    return m.group(1) if m else None
