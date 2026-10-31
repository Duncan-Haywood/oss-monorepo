# flagships.yaml carried merge-conflict markers (2026-10-31)

`portfolio/flagships.yaml` on main held `<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main`
lines in the wall-framing-takeoff `next:` text (PRs #12042 and #12043 both edited
that line). `yaml.safe_load` failed ("could not find expected ':'"), which breaks
anything reading flagships (`portfolio/router/allocate.py`). Resolved by keeping both
sentences: the trimmer joist check and the page-card header field. Verified:
`yaml.safe_load` returns 10 flagships; `allocate.py` runs.

Lesson: after merging a flagships edit, `python3 -c "import yaml;yaml.safe_load(open('portfolio/flagships.yaml'))"`.
