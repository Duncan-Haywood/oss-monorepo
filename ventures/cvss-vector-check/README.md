# CVSS Vector Check

Does this advisory's CVSS score match its own vector? A free browser tool and
zero-dependency CLI for CVSS v3.1 and v3.0.

- **Score and explain** a vector: base, temporal and environmental scores,
  impact and exploitability sub-scores, every metric in words, and the score
  under the other v3 version beside it. Malformed vectors get a specific
  error (missing or repeated metric, bad value, empty field), and v2 or v4.0
  vectors are recognised and refused rather than mis-scored.
- **Compare two vectors**: every metric that differs, what that difference
  alone does to the first vector's score, and a note when the steps do not add
  up (CVSS multiplies its factors).
- **Sensitivity**: the base score with each single base metric set to each of
  its other values, marking changes that cross a severity band.
- **Audit a report**: paste text, a CSV, or NVD, OSV or scanner JSON. Every
  `CVSS:3.x` vector is rescored and the stated score and severity label next
  to it are checked. A mismatch is called *explained* when the stated number
  is the temporal or environmental score, the other version's base score, or
  the v3.0 score a floating-point `Math.ceil` Roundup gives.

Live: https://marisstella.app/cvss-vector-check/ · Guide:
[CVSS 3.0 vs 3.1: when do the scores actually differ?](cvss-3-0-vs-3-1-score-differences.html)

## CLI

```
node cli.mjs 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
node cli.mjs '<vector A>' --diff '<vector B>'
node cli.mjs --audit report.json            # or - for stdin
node cli.mjs --audit report.csv --strict    # exit 1 on a mismatched or invalid vector
```

`--json` prints the engine's result. Exit code 2 means the input could not be
read as a CVSS v3 vector.

## How the scores are checked

The formulas and weights are from FIRST's *Common Vulnerability Scoring System
v3.1: Specification Document* (section 7 and Appendix A, Roundup) and the
v3.0 specification. The code is this repository's own.

They are tested against an independent implementation, Red Hat Product
Security's [`cvss`](https://github.com/RedHatProductSecurity/cvss) Python
package (version 3.6, LGPL-3.0). It is used only as an oracle to build test
fixtures; none of its code is copied here.

| Check (2026-11-17) | Result |
| --- | --- |
| Every base + temporal vector (259,200), v3.1 | 0 differences from the oracle |
| Every base + temporal vector (259,200), v3.0 | 0 differences from the oracle |
| 200,000 random vectors with all environmental metrics, each version | 0 differences |
| `oracle/fixture-3.1.json`, `oracle/fixture-3.0.json` (3,000 each, committed) | checked by `cvss.test.mjs` on every run |

To rebuild a fixture: `pip install cvss==3.6`, then
`node oracle/gen-vectors.mjs 3.1 3000 1 | python3 oracle/score-with-oracle.py > oracle/fixture-3.1.json`
(seed 2 for 3.0). `oracle/all-base-temporal.mjs` prints the whole
base+temporal space for the same script.

### One decision: v3.0 Roundup

CVSS 3.0 defines Roundup in words: the smallest one-decimal number equal to or
above the input. This engine takes that mathematically, removing
floating-point noise before the ceiling, so 5.0 × 0.92 rounds to 4.6. A literal
`Math.ceil(x * 10) / 10` gives 4.7; across the 259,200 v3.0 base+temporal
vectors it differs on 228 temporal scores (all +0.1, none crossing a severity
band) and no base score. The oracle agrees with the exact reading. The naive
variant is kept as `roundup30Naive` so the audit can explain a stated score
that came from it.

### What differs between 3.0 and 3.1

Computed exactly, base and temporal scores are identical across versions for
the whole space. Environmental scores differ only when the modified scope is
Changed (v3.1 rewrote that Modified Impact formula): 12,623 of 200,000 random
full vectors (6.3%), always by 0.1, with 610 (0.3%) crossing a severity band.
The sample picks metric values uniformly, so it describes the formula space,
not published advisories.

## Limits

- CVSS v3.0 and v3.1 only. CVSS 4.0 scoring needs FIRST's macrovector lookup
  table and is a possible next step; v2 is not planned.
- The audit pairs a vector with a score by proximity: in JSON, keys in the same
  object (`baseScore`, `score`, `cvss_score`, `baseSeverity`, `severity`); in
  text, the nearest one-decimal number and the only severity word on the same
  line. A report that puts the score on another line is read without one.
- A CVSS score measures technical severity, not the risk to a given system.

## Files

- `cvss.mjs`: the engine (pure, no imports).
- `cli.mjs`: the command line.
- `index.html`, `cvss-3-0-vs-3-1-score-differences.html`: the pages.
- `usage.mjs`: local-only feature counters with an opt-out, honouring Do Not Track.
- `oracle/`: fixture generators and the oracle scoring script.

FSL-1.1-MIT licensed. Not affiliated with or endorsed by FIRST, NIST, the NVD, MITRE
or Red Hat. CVSS is owned and managed by FIRST.Org, Inc.
