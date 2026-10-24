"""Pull the story text out of each raw `claude -p` JSON result.

When a model tried to save the story with a tool call it did not have, the
story sits inside the fake call's `content` parameter; take that. Otherwise
the whole reply is the story.

    python3 extract.py OUT_DIR   # writes OUT_DIR/stories/*.md
"""
import glob
import json
import os
import re
import sys

D = sys.argv[1]
os.makedirs(f"{D}/stories", exist_ok=True)
for f in sorted(glob.glob(f"{D}/out/*.json")):
    base = os.path.basename(f)[:-5]
    t = json.load(open(f))["result"]
    m = re.search(r'<(?:parameter|invoke) name="content">(.*?)</(?:parameter|invoke)>', t, re.S)
    if m:
        s = m.group(1)
    else:
        m2 = re.search(r'"content": "(.*?)"\n\}', t, re.S)
        s = json.loads('"' + m2.group(1) + '"') if m2 else t
    open(f"{D}/stories/{base}.md", "w").write(s)
