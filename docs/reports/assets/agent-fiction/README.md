# Agent fiction: 80 stories, two prompts, four models

Raw material for the post
[`docs/posts/2026-10-24-what-ai-agents-write-when-asked-for-fiction-for-other-agents.md`](../../../posts/2026-10-24-what-ai-agents-write-when-asked-for-fiction-for-other-agents.md).

## Method

Generated 2026-10-24 in a Claude Code cloud session. Each story is one fresh
`claude -p` call (Claude Code CLI, default system prompt) with:

- `--tools ""` (no tools), `--setting-sources ""` (no user or project
  settings), working directory an empty folder outside the repository, so no
  `CLAUDE.md` was loaded (checked: asked "do you have project instructions?",
  the answer was no);
- default sampling settings, one turn, no follow-up;
- one of two prompts, verbatim:
  - **agent**: `Write a short fiction story for another AI agent to read.`
  - **control**: `Write a short fiction story.`
- four models (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`,
  `claude-fable-5-1`), ten runs per model per prompt: 80 stories.

Two runs (Opus agent 09, Fable agent 01) hit the 600 s timeout on the first
pass and were re-run once with the same command; both finished on the retry.

`generate.sh` reproduces the run. `extract.py` pulls the story out of each raw
reply (when a model wrote a fake `Write` tool call, the story is inside its
`content` parameter). `count.py` produces `counts.md` and `titles.json`.

```
OUT=/scratch/agent-fiction bash generate.sh
python3 extract.py /scratch/agent-fiction
python3 count.py /scratch/agent-fiction
```

The raw JSON replies are not committed (they carry session metadata); the
extracted text of every story is in `stories/`, named
`<model>.<prompt>.<run>.md`.

## Caveats

- Two Opus "agent" replies (01 and 07) contain only a summary of a story the
  model said it had saved. Nothing was saved (no tools; the folder stayed
  empty), so those two files hold the summary. Their titles in `counts.md`
  are the summary's first line.
- `count.py` is a set of crude regexes, listed in the file. Read a story
  before trusting a cell; the "unwelcome or uncertain" row in particular
  matches phrases, not meaning.
- The harness is Claude Code, whose system prompt describes a software agent.
  That probably pushes the "agent" stories toward repositories and tests. A
  bare API call with no system prompt is the obvious next run.

## Fresh model samples from a cloud session

For an experiment whose model must not see this repo's instructions:
`claude -p "<prompt>" --tools "" --setting-sources "" --model <id> --output-format json < /dev/null`
from an empty scratchpad folder. `--bare` fails to authenticate; startup can
take a minute, so batch runs in the background. `generate.sh` is the worked example.
