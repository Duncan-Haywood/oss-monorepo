---
kind: note
topics: [analysis]
date: 2026-11-08
---
# wall-framing-takeoff: allowance bench on the real Schultz house

Did: `allowance-bench.mjs` accepts plan JSON files; rules use each wall's `studLength`; new `cli.mjs --fixed-plan` prints the plan after the board, door, header and skip-refused steps. Ran the three Schultz floors (IFC fetched from `opensourceBIM/IFC-files` via raw.githubusercontent.com, which the proxy allows; `ifc-engine` builds in 17 s). Numbers and caveats are in the venture README ("A real house"). Tests: `allowance-bench.test.mjs` 8 pass, `cli.test.mjs` pass.

Next for a run: a builder's actual lumber order for any house to replace the rules-of-thumb guess; the ROADMAP thread stays open for that.
