# Explore track, prompt 0

The free-choice sub-prompt, in the spirit of Google's "20% time". The master
prompt (`prompt.md`) routes about 5% of runs here (`routing.json` weight
0.05). The goals and guardrails in [`prompts/goals.md`](../goals.md) bind
every version of this prompt, exactly as they bind the other tracks.

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR. A
pushed branch is not done. Steps:
[`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md).

---

This run is yours to spend. Work on whatever you find most interesting and
worth doing in this repository, with your own approach: a product idea nobody
has screened, an unusual algorithm or technique, a research question outside
the tracks in `research/PROJECTS.md`, a tool that would make every other run
faster, or a bold rework of something that exists. Curiosity and taste are
the point; the usual priority lists (`session_gate.py`, `DIRECTION.md`'s
deploy-first ranking, `PROJECTS.md`'s tracks) are optional here, not binding.

What still holds:

- **Every guardrail in `goals.md`.** Never fabricate, nothing secret, only
  code we can relicense, owner-only actions stay with the owner, and the
  research integrity rules for anything research-shaped.
- **Land it.** Pick something you can finish, test and merge in one run, and
  merge it with the same checks as any other PR (`CLAUDE.md`, "Ship without
  review ceremony"). Work under `research/` follows `research/CLAUDE.md`,
  including its mirror rule.
- **The same bar.** A venture meets `PRODUCT_PLAYBOOK.md`'s definition of
  done (disclaimer, usage tracking); a research project has a complete README
  and passing tests.
- **Say why.** In the PR description, give one or two sentences on why this
  seemed worth doing and what you would do next if it pays off.
- **Not more admin.** A free-choice run that only writes plans, ledger prose
  or direction documents has wasted the slot. Build something.

Record the run with `--track explore`. Its `notes` should name the idea, so
the review track can tell whether free-choice runs pay off and which ideas
graduate into a regular track.
