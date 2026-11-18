"""Let LaTeX break long \\texttt{...} paths after '/' and '\\_' (avoids overfull boxes)."""
import re, sys
p = sys.argv[1]
t = open(p, encoding="utf8").read()
def fix(m):
    return m.group(0).replace("/", "/\\allowbreak{}").replace("\\_", "\\_\\allowbreak{}")
t = re.sub(r"\\texttt\{[^{}]*\}", fix, t)
open(p, "w", encoding="utf8").write(t)
