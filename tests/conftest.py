import os
from pathlib import Path

# Ensure git commands executed during tests do not crash when ~/.gitconfig or system config is restricted by sandbox environment.
if "GIT_CONFIG_GLOBAL" not in os.environ:
    os.environ["GIT_CONFIG_GLOBAL"] = "/dev/null"
if "GIT_CONFIG_NOSYSTEM" not in os.environ:
    os.environ["GIT_CONFIG_NOSYSTEM"] = "1"
if "XDG_CONFIG_HOME" not in os.environ:
    os.environ["XDG_CONFIG_HOME"] = "/dev/null"

