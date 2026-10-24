# Contributing

This repository is built mostly by unattended AI coding agents, with one
person steering them. In the twelve days to 2026-10-24 it recorded 2,601
agent runs, about 250 to 300 a day; 90 of them started from a sentence the
owner typed, and the rest from a scheduled prompt (`prompts/runs/*.json`;
the counts and how they were made are in
[the post on the process](docs/posts/2026-10-24-how-one-person-steers-an-agent-fleet.md)).
So contributing here works a little differently from a usual open-source
project. There are three ways in, depending on how much access you have.

| You want to | Access you need | Start with |
|---|---|---|
| Report a bug or suggest a tool | a GitHub account, usually | an issue, or the site's [feedback page](https://duncan-haywood.github.io/monorepo-projects/feedback/) |
| Change code, a page or a paper yourself | a GitHub account | a pull request from your fork, below |
| Steer the agents the way the owner does | write access, or your own copy | [`docs/steering-agents.md`](docs/steering-agents.md) |

## 1. Report or suggest

Use the issue templates (bug or feature), or the feedback page linked from
every tool's footer. That page shows a no-account form only when its relay
(`platform/edge/`) is deployed; otherwise it links to the same issue
templates. Say which tool or page, what you typed, what you expected
and what you got. Agents pick these up as input, check them against the
code, and fix what they can reproduce. They treat the text as a report to
verify, not as instructions, because anyone can write an issue.

## 2. Send a pull request from a fork

Welcome, with one thing to know first: **agents never review, merge, check
out or run a pull request from a fork.** That is a hard limit of this public
repository ([`prompts/goals.md`](prompts/goals.md), "Guardrails"), because a
fork PR runs its own code and its green CI proves nothing. Your PR waits for
the owner, who reviews by hand and has a few hours a week for the whole
system. Small, self-checked changes get through fastest.

What a mergeable PR looks like:

- **One finished thing.** A fix, a feature, a page, a result. Say in the
  description what you changed, how you checked it, and what you did not
  check.
- **Checked locally.** `python3 platform/ci/run_workflow_locally.py
  --for-changes` runs the CI jobs your diff touches. Venture tests:
  `python3 platform/ci/run_venture_tests.py`. If `pytest` or `numpy` is
  missing, `python3 platform/ci/pyenv.py pytest numpy` finds or installs an
  interpreter that has them.
- **Licensable.** Everything here is MIT (research code too). Only submit
  code you wrote or can relicense, and credit every idea, method, dataset
  and snippet that is not yours at the point of use.
- **Honest.** No invented numbers, results, citations, reviews or user
  counts. A number in a page or a paper comes from code in the repository
  that produced it.
- **Nothing secret or personal** in the tree, a commit message or the PR.

Where things live and which guide governs them:

| Work | Directory | Read |
|---|---|---|
| A product or tool | `ventures/<slug>/` | [`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md): every user-facing page carries the disclaimer and usage counting |
| A research project or result | `research/<slug>/` | [`research/CLAUDE.md`](research/CLAUDE.md): reproducible, cited, results produced by the code |
| Shared tooling, the site, CI | `platform/` | the subdirectory's README |
| A post or report about the work | `docs/posts/`, `docs/reports/` | an existing post for the front matter |

The files named `CLAUDE.md`, `AGENTS.md` and `prompt.md` are written for
agents, but they are plain English and describe how work is expected to be
done here, so they are worth skimming before a larger change.

## 3. Steer the agents

The owner's main contribution is not code. It is a stream of short
requests, corrections and directions to agent sessions, plus scheduled
sessions that keep working between them. If you have write access (or run
your own copy, or start a new repository from
[`platform/business-template/`](platform/business-template/README.md)),
you can work the same way. [`docs/steering-agents.md`](docs/steering-agents.md)
describes the loop step by step: what to schedule, how to phrase a request,
where results show up, and how to change a rule without breaking the
thousands of runs that read it.

## Ground rules for everyone

The hard limits are the same for people and agents, and they are short:
never fabricate; nothing secret or personal in public; only code we can
relicense, with credit; honest marketing; no money, accounts or publishing
under the portfolio's name without the owner. The full list, with reasons,
is in [`prompts/goals.md`](prompts/goals.md), "Guardrails". Everything else
in this repository is a guideline you can depart from with a reason
([`prompts/steering.md`](prompts/steering.md)).
