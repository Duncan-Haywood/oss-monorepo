"""Write experiments/season.svg: mean build time by start month, two assumed climates, parsed from results.txt.

    python experiments/figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
text = (HERE / "results.txt").read_text()
text = re.sub(r"^(%s)\b" % "|".join(MONTHS), lambda m: str(MONTHS.index(m.group(1)) + 1), text, flags=re.M).splitlines()
cold = table(text, "climate: cold", 0, [1], 12)
mild = table(text, "climate: mild", 0, [1], 12)
write_lines(HERE, "season.svg", "House build time by start month (assumed climates)",
            "Line plot of mean working days to build a house against the month the build starts. "
            "The cold-winter climate runs from about 211 days for a July start to 231 for December; the mild climate varies by under 4 days.",
            "start month (1 = Jan)", "mean working days",
            [("cold winters", cold[0], cold[1][0]), ("mild", mild[0], mild[1][0])])
