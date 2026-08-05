import os
from pathlib import Path

# Ensure git commands executed during tests do not crash when ~/.gitconfig is restricted by sandbox environment.
if "GIT_CONFIG_GLOBAL" not in os.environ:
    try:
        global_config = Path(os.path.expanduser("~/.gitconfig"))
        if not os.access(global_config, os.R_OK):
            os.environ["GIT_CONFIG_GLOBAL"] = "/dev/null"
    except OSError:
        os.environ["GIT_CONFIG_GLOBAL"] = "/dev/null"
