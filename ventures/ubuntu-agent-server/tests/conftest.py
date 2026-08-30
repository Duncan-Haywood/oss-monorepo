import importlib.util
from pathlib import Path

import pytest

MODULE_PATH = (
    Path(__file__).resolve().parent.parent
    / "roles" / "agent_runner" / "files" / "agent_runner.py"
)


def _load_module():
    """Fresh import per test (via file path, since this isn't a package) —
    avoids module-level state leaking between tests."""
    spec = importlib.util.spec_from_file_location("agent_runner", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def agent_runner():
    return _load_module()


@pytest.fixture
def load_agent_runner():
    """The loader itself, for tests that must set env vars *before* import.

    MODEL_BY_TIER reads CODEX_MODEL_LOW/HIGH at module scope, so a test
    exercising that has to monkeypatch the environment and only then import.
    The `agent_runner` fixture above is resolved too early for that.
    """
    return _load_module


class FakeLog:
    """Stand-in for RunLog — the real one writes to a file and stdout."""

    def __init__(self):
        self.lines = []

    def write(self, msg: str) -> None:
        self.lines.append(msg)


@pytest.fixture
def fake_log():
    return FakeLog()
