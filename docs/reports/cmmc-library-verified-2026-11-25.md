# CMMC control library verified against the official text (2026-11-25)

For the next run on bet #4 (CMMC workspace) or the `machine-shop-guides` front door.

## What landed

- **private PR 27** (merged): `apps/cmmc`, the CMMC Level 1/2 self-assessment workspace, had sat open since
  2026-11-24 because its control library was transcribed while the official hosts were blocked. This run
  compared it with the sources, fixed three wording errors (FAR 52.204-21(b)(1)(xv) was paraphrased;
  3.13.14[a]/[b] abbreviated "Voice over Internet Protocol (VoIP)"), added
  `apps/cmmc/scripts/extract_official_text.py` plus `src/shared/controls/official-text.json` and
  `official-text.test.ts` (fails on any drift), set the verification flags true, and switched the default
  model from `claude-opus-5-5` to `claude-haiku-5-5` (repo rule) with grants' current adapter.
- **private PR 140** (merged): Level 1 objectives now read FCI for CUI, as 32 CFR 170.15(c)(1)(i) requires
  (3.1.22[b], [d], [e]; 3.8.3[a], [b]). The Level 1 mapping matches Table 2 to 170.15(c)(1)(ii).
- **This repo**: `machine-shop-guides/sprs.test.mjs` pins each of the 110 SPRS weights to the 5- and 3-point
  lists in 32 CFR 170.24(c)(2)(i)(B) (all already matched); `SOURCES.md` there marks the weights and the
  170.21 POA&M list as read directly; the SPRS post gained a section on the check.

## Results

| Data | Source | Match |
|---|---|---|
| 110 requirements, basic/derived | NIST `sp800-171r2-security-reqs.xlsx` | 110/110 |
| 320 objectives | NIST SP 800-171A PDF | 318/320 before the fix |
| 15 Level 1 items | FAR 52.204-21(b)(1), eCFR | 14/15 before the fix |
| 110 weights (app and public calculator) | 32 CFR 170.24(c)(2)(i)(B) | 110/110 in both |
| POA&M rules | 32 CFR 170.21 | match |

## Hosts, from this container on 2026-11-25

Reachable: `csrc.nist.gov`, `nvlpubs.nist.gov`, `www.ecfr.gov/api/renderer/v1/content/enhanced/current/...`
(the versioner `full` endpoint gave 406 without `Accept-Encoding: gzip`), `www.law.cornell.edu`,
`www.govinfo.gov`, `www.federalregister.gov`. Refused: `dodcio.defense.gov` (403), `acq.osd.mil` (no
answer). So the DoD Assessment Methodology PDF and class deviation 2024-O0013 are still unread; the
codified rules they feed into are verified.

## Next for `apps/cmmc`

No ROADMAP yet. Launch blockers are in `apps/cmmc/docs/SECURITY.md` (email verification and invitations,
MFA, LLM spend caps, org export/deletion, a deploy workflow), and there is no billing. Private Actions jobs
were getting no runner (`ci_starvation.py --repo Duncan-Haywood/private-monorepo` exit 0, all jobs
`runner_id: 0`), so both PRs merged on local checks: typecheck, biome, 144 unit and 13 worker tests, build.
