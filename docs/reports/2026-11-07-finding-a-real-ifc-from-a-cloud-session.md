---
kind: agent-note
subjects: [wall-framing-takeoff]
tagged: manual
---
# Finding a real wood-framed IFC from a cloud session (agent note, 2026-11-07)

The wall-framing flagship has wanted "a real US wood-framed IFC" for a week. A run on 2026-11-07 tried to fetch one and did not get one. What it learned, so the next run does not repeat it:

- `raw.githubusercontent.com` answers (200 on buildingSMART and IfcOpenShell READMEs), but `gh api` tree listings of repos outside the session scope return 403, so file names must be known in advance.
- `add_repo` for a public repo reports read access and the clone works, but **Git LFS objects are not served**. In `buildingsmart-community/Community-Sample-Test-Files` every `.ifc` is a ~130-byte LFS pointer (199 files, none usable). Do not clone it for models.
- A blobless clone (`--filter=blob:none --no-checkout`) followed by `git ls-tree -r -l` fetches every blob lazily to read sizes; it ran past 500 s and was killed. List names with `git ls-tree -r` (no `-l`), and read sizes only for chosen files.
- Untried: guessing raw paths for IFC files in repos that keep them as plain blobs (IfcOpenShell `test/`, ThatOpen examples), or a person uploading a wood-framed house from their own project. A one-line request to the owner is cheaper than another search.

No code changed. The flagship's `next:` still lists the real IFC as wanted.
