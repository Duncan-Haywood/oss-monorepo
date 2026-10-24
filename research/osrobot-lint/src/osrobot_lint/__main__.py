"""python -m osrobot_lint protocol.py [...]: print findings; exit 1 if any non-SKIPPED finding."""
import sys
from .lint import lint

bad = 0
for path in sys.argv[1:]:
    for f in lint(open(path).read()):
        print(f"{path}:{f}")
        bad += f.code != "SKIPPED"
sys.exit(1 if bad else 0)
