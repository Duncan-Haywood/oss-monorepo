---
kind: polish
topics: [llms-txt]
date: 2026-11-05
tagged: auto
---
# Polish 2026-11-05: permit-packet-preflight llms.txt, and two stale "next" items

**Change.** `python3 platform/ci/missing_llms_txt.py` listed one flagship-grade product without an
`llms.txt`, permit-packet-preflight. Added a hand-written one (what it answers, how matching behaves, its
limits, source). It uses the placeholder origin like its siblings.

**Stale "next" items from polish-2026-10-29-llms-txt-as-of.md, checked in the code, not changed:**
- Hand-written files get an as-of line: `withLlmsAsOf` (`platform/pages/build.mjs`) appends the git date.
- The `example.invalid` URLs in hand-written files (wall-framing-takeoff, shed-designer, catholic-shorts,
  changepoint-detector, hearth-and-horizon) are rewritten to the real origin: `.txt` is in `REWRITABLE`
  and `copyTree` applies `rewriteOrigin`. Only a built `dist` would confirm; not built this session.

**Measured.** `missing_llms_txt.py` now prints nothing. No full site build run; no traffic effect measured.

**Next.** Build once and grep `dist/*/llms.txt` for `example.invalid` and for a missing date line to close
both items for good; then the visual passes in the polish prompt (hub, flagship, research index).
