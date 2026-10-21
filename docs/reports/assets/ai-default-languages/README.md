# Default languages: data and code

Which programming and documentation languages Claude models pick when a
task names none, when they switch on their own, and what a named language
buys. Write-ups: [`../../2026-10-21-default-languages-for-agents.md`](../../2026-10-21-default-languages-for-agents.md)
(agent brief) and [`../../../posts/2026-10-21-what-language-ai-picks-when-you-dont-say.md`](../../../posts/2026-10-21-what-language-ai-picks-when-you-dont-say.md) (post).

| File | What it is |
|---|---|
| `tasks.json` | 25 prompts (17 code, 8 document); none names a language |
| `run.py` | Elicitation: `claude -p` from a fresh empty folder per call, no repository settings |
| `raw.jsonl` | 449 replies: 3 models x 2 framings x 25 tasks x 3 reps (one call timed out) |
| `agent_notools.jsonl` | Abandoned first agent arm (coding-agent prompt with no tools): models wrote pretend tool calls instead of code. Kept as evidence, not analysed |
| `classify.py` | Labels each reply: largest written source file for agents, else the longest fenced code block |
| `analyze.py` -> `results.txt` | Counts, per task, model and framing |
| `push.py` -> `pushed.jsonl` | 21 replies with a language named (Sonnet, agent framing) |
| `bench.py` -> `bench.txt` | Builds and runs 39 programs (default vs named language) on generated inputs; checks correctness, times them |
| `census.py` -> `census.txt` | Source files by language in this repository (mostly agent-written) |

Framings: **bare** is the system prompt "You are a helpful assistant." with
no tools. **agent** is Claude Code's default system prompt with file tools
only (Read, Write, Edit, Glob, Grep; no shell), so the files it writes are
its answer.

Reproduce (the Claude Code CLI must be logged in; this costs model calls):

```
python3 run.py --models haiku,sonnet,opus --reps 3   # resumable
python3 push.py
python3 analyze.py > results.txt
python3 bench.py > bench.txt     # needs gcc, g++, rustc/cargo, go, python3 with numpy and pandas
python3 census.py > census.txt
```

Collected 2026-10-20/21 with the CLI's current `haiku`, `sonnet` and `opus`
aliases (`served_ok` records that the call reported model usage). Timings: a 4-core cloud container, one run each.
