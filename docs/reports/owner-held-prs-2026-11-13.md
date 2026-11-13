---
kind: note
topics: [process, control-plane]
date: 2026-11-13
---
# Owner-held PRs: the queue on 2026-11-13 (process run)

- **Tool.** `python3 platform/ci/owner_held_prs.py` (about 20 s, read-only) lists the open same-repo PRs that touch a CODEOWNERS path, oldest first. It also lists owned files that several held PRs change, PRs whose owned change main already carries, and mixed PRs. Fetch main first (`git fetch --depth=1 origin main`): the already-on-main test reads `origin/main` locally.
- **Before opening a control-plane PR**, run it with `--grep <file or word>`. If a held PR already makes your change, extend it or name it in your record rather than opening another. Duplicates found today: P063 ventures-tests sparse checkout x4 (#13748, #13868, #14240, #14251); the `ideas.py` gh-api fallback x3 (#13112, #13395, #13824); the prompt.md step 0 wording x3 (#12885, #12939, #12975). Main already has #12885 word for word, and the other two say the same thing in other words (read by hand).
- **Snapshot.** 102 open PRs, 56 held, median age 9 days (33 over 7, 9 over 14), 36 share an owned file, 37 mixed, 19 pure.
- **Not done here.** No PR was closed: choosing a survivor needs each diff read (`portfolio/ledger/supersede_check.py`). The tests are not wired into a workflow, because that is a `.github/` edit and would be held PR 57. They run with `cd platform/ci && python3 -m unittest test_owner_held_prs`.

## Shared files at the time of writing

- `prompt.md`: #12026, #12272, #12885, #12939, #12975, #14434
- `.github/workflows/portfolio-validate.yml`: #12516, #14808, #14877, #14911, #15248
- `.github/workflows/ventures-tests.yml`: #13748, #13868, #14240, #14251, #14894
- `CLAUDE.md`: #8592, #8700, #10052, #12926
- `prompts/process/backlog/P063-ventures-tests-sparse-checkout.json`: #13748, #13868, #14240, #14251
- `prompts/experiments.md`: #12026, #12272, #12367
- `prompts/ideas.py`: #13112, #13395, #13824
- `prompts/promptctl.py`: #12926, #13906, #14686
- `prompts/redteam.py`: #12296, #12917, #14612
- `prompts/routing.json`: #12272, #12367, #14434
- `prompts/test_redteam.py`: #12296, #12917, #14612
- `.github/workflows/prompts-ci.yml`: #12738, #12926
- `.github/workflows/sibling-links-ci.yml`: #12946, #13582
- `platform/agents/tools.mjs`: #14428, #14674
- `platform/agents/tools.test.mjs`: #14428, #14674
- `prompts/goals.md`: #11655, #11986
- `prompts/redteam/prompt-0.md`: #12296, #12917
- `prompts/test_promptctl.py`: #14434, #14686

