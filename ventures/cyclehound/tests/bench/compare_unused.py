"""Compare cyclehound --unused-exports with ts-unused-exports on the same files.

usage: python3 compare_unused.py TUE_OUTPUT CYCLEHOUND_OUTPUT BASE_DIR [--show N]

TUE_OUTPUT is `ts-unused-exports tsconfig.json --showLineNumber` text
("/abs/path/file.mjs[line,col]: a, b"); CYCLEHOUND_OUTPUT is
`cyclehound --unused-exports --entries` text ("rel/path.mjs:line: name").
Prints the agreement on (file, name) pairs and the first N of each
difference.
"""
import os, re, sys

tue_path, ch_path, base = sys.argv[1:4]
show = int(sys.argv[sys.argv.index("--show") + 1]) if "--show" in sys.argv else 10
base = os.path.abspath(base)

tue = set()
for line in open(tue_path):
    m = re.match(r"^(/.+?)(?:\[\d+,\d+\])?: (.+)$", line.strip())
    if not m:
        continue
    f = os.path.relpath(m.group(1), base)
    for name in m.group(2).split(", "):
        tue.add((f, name.strip()))

ch = set()
for line in open(ch_path):
    m = re.match(r"^(.+?):(\d+): (.+)$", line.strip())
    if m:
        ch.add((m.group(1), m.group(3)))

both = tue & ch
print(f"ts-unused-exports {len(tue)}, cyclehound {len(ch)}, both {len(both)}, "
      f"only ts-unused-exports {len(tue - ch)}, only cyclehound {len(ch - tue)}")
union = len(tue | ch)
print(f"agreement (Jaccard) {len(both) / union:.4f}" if union else "both empty")
for label, s in (("only ts-unused-exports", tue - ch), ("only cyclehound", ch - tue)):
    for f, n in sorted(s)[:show]:
        print(f"  {label}: {f}: {n}")
