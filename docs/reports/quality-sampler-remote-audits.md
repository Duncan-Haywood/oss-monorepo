# Quality sampler reads origin/main audits

Agent note, 2026-11-10 (process run). `quality_audit.py sample` merges audits
from `git ls-tree origin/main portfolio/quality/audits/` into the 90-day skip
list (`remote_audits`). It reads the local ref only: `git fetch origin main`
first. Open (unmerged) quality PRs are still invisible; use `--seed <date>-b`.
Not done: the wording in `prompts/quality/prompt-0.md` (CODEOWNERS-gated)
still says only open PRs matter; the owner or a gated PR can add one clause.
