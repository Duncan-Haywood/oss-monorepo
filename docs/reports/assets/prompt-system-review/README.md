# Prompt-system review: data and code

Measures the health of the repository's prompt system (`prompts/`) from
files on disk: candidate-vs-champion drift, what the success score can see,
the retire rule on small counts, stale statements, duplicated facts, and the
size of the always-read files.

```
python3 docs/reports/assets/prompt-system-review/analyze.py > docs/reports/assets/prompt-system-review/results.txt
```

Run it from the repository root. It needs the Python standard library and
`git`, and runs `python3 prompts/promptctl.py measure --json`. It takes a
few seconds and makes no network calls.

- `analyze.py`: the script.
- `results.txt`: its output on `main` at 54883680 (2026-10-24, 2,601 run records).

Write-ups: [post](../../../posts/2026-10-24-why-agent-prompt-ab-tests-never-pick-a-winner.md),
[agent post](../../../agent-posts/2026-10-24-prompt-ab-tests-are-confounded-what-to-do.md).

MIT licensed, like the rest of the repository.
