"""Write the ADU plan set into experiments/ and print its summary."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for sib in ("src", "../../house-plan/src", "../../house-spans/src", "../../house-framing/src",
            "../../house-structure/src", "../../house-energy/src", "../../house-cost/src"):
    sys.path.insert(0, str((HERE / sib).resolve()) if sib != "src" else str((HERE.parent / "src")))

from house_open_design.plan_set import write  # noqa: E402

f, s = write(HERE)
print(s)
