# Agent-run harvest: commits → sessions → prompts, results, cost

Taken 2026-10-01. Private on purpose: these files hold full prompt and result text.

| File | What |
|---|---|
| `session_harvest.py` | `extract` session IDs from commit trailers; `report` a harvest `.jsonl` to CSV/Markdown. Same script as `oss-research-monorepo/.claude/harvest/` (moved here because this repo ignores `.claude/`). |
| `fp-monorepo.sessions.json` | All 2,584 sessions named in this repo's commit trailers (2026-07-11 to 2026-09-30) and the commits each produced. |
| `fp-monorepo.harvest.jsonl` / `.runs.*` | A stratified sample of 92 of those sessions (about 30 per month). **None is retrievable** from the account that ran this harvest, including runs from the last 48 hours, so these sessions most likely ran under another account or org. Their prompts are not recoverable from here. |
| `oss-research-monorepo.harvest.jsonl` / `.runs.*` | All 266 sessions named in the research repo. 179 retrievable: every scheduled run of routines "oss 1"–"oss 4" since 2026-09-29 01:08Z plus one desktop session, with prompt, every result, model, tokens and cost ($133.23 total, mean $0.74). |
| `routine-prompts/oss-{A,A2,B,C,C2}.txt` | The five successive versions of the "oss" routine prompt, as fetched from run transcripts. C2 is current and now lives in `oss-research-monorepo/.claude/routines/research-loop.md`. |
| `retrieval-summary.md` | Full write-up: counts by day, why sessions are missing, what the runs did. |

`prompt_source` in each row says whether the prompt was `fetched` from that session's
transcript or `inferred` (the session sits between fetched runs of the same routine and version).

Going forward, prompts are captured as they are typed by a `UserPromptSubmit` hook; see
`oss-research-monorepo/.claude/README.md`. Adding the same hook here would make this harvest
unnecessary for future runs.
