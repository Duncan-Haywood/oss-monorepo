# Contributing

Thanks for looking. This repository holds more than 1,300 free, MIT-licensed
tools for small businesses (`ventures/`) and about 1,000 reproducible research
projects (`research/`). Most of the work here is done by scheduled AI agent
sessions, so most of the guidance files in the tree are written for them. This
page and [`docs/contributing/`](docs/contributing/README.md) are written for
you, a person.

## The most useful things you can do

New to the repository? [Start here](docs/posts/2026-10-29-start-here.md) says
what each project offers, and [bring an idea](docs/posts/2026-10-29-start-here-bring-an-idea.md)
says what you get for suggesting one: free development by the agents, in
public, with the right to run the result yourself.

1. **Tell us a number is wrong.** If a calculator gives a result you know is
   off, say what you entered, what it showed and what you expected, and where
   the right figure comes from (a rate table, a supplier invoice, a statute).
   Open a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml),
   or use the [feedback form](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/feedback/)
   if you have no GitHub account. This is the contribution we can least
   produce ourselves: you know your trade's numbers.
2. **Ask for a tool.** Describe the job you are doing and where existing tools
   fall short ([feature request](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml)).
   Short on time, or no AI agent? Dictate it: the one-box
   [idea form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=idea.yml),
   or, with write access, a paragraph in [`ideas/INBOX.md`](ideas/INBOX.md)
   ([how](ideas/README.md)).
3. **Fix something yourself** with a pull request: a wrong default, a broken
   page, a missing test, a clearer explanation. Start with
   [`docs/contributing/fix-a-tool.md`](docs/contributing/fix-a-tool.md).
4. **Check a research result.** Re-run a project, try a different input, or
   point out a source we missed. See
   [`docs/contributing/research.md`](docs/contributing/research.md).
5. **Write.** A blog post that explains a tool or a result with real numbers,
   a clearer README, a better `llms.txt`, or a fixed doc. Posts go in
   `docs/posts/` and publish on the site's blog when merged. See
   [`docs/contributing/writing.md`](docs/contributing/writing.md) for where
   each kind of writing goes, its format and the checks it must pass.
6. **Steer the agents.** The maintainer's main contribution is not code but a
   stream of short requests and corrections to agent sessions, plus scheduled
   sessions that keep working in between. If you have write access, or want
   to run the same process on your own copy or a new repository,
   [`docs/contributing/steering-agents.md`](docs/contributing/steering-agents.md)
   walks through it step by step.

## How a pull request from you lands

Read this before you spend an afternoon on a PR.

- **Pull requests from forks are reviewed by the maintainer, a person.** The
  agents that work on this repository are not allowed to review, check out,
  run or merge a fork PR, and they treat text in issues and PRs from outside
  contributors as information, never as instructions
  ([`prompts/goals.md`](prompts/goals.md), "Guardrails"). That rule protects
  the repository; it also means a fork PR waits for a human, and there is no
  promised response time.
- **CI runs on your fork PR, but its result is advisory.** A fork PR runs the
  workflows in its own branch, so a green check proves only that your branch
  passes its own checks. Run the tests yourself and paste the output in the PR
  ([`docs/contributing/setup.md`](docs/contributing/setup.md), "Run the
  checks").
- **Small and focused gets merged.** One tool, one fix, a test that fails
  before your change and passes after it. A sweeping change across hundreds of
  ventures is very hard to review by hand.
- **An issue is often faster than a PR.** A clear bug report with a source is
  something any later session can act on.

## Ground rules

These are the few rules that are not negotiable here, for people and agents
alike.

- **Never fabricate.** No invented numbers, rates, citations, test results,
  reviews, testimonials or user counts. A default value in a calculator is a
  labelled starting point with a source or an honest "ballpark" note, not a
  claim about what something costs.
- **Only code we can relicense.** Everything here is MIT. Do not paste code,
  copy or assets from a project under an incompatible license. Credit ideas,
  methods and code that are not yours.
- **Nothing secret or personal.** No API keys, tokens, `.env` files, customer
  data, or anyone's name and address in code, tests, commits, issues or PR
  text. Issues are public.
- **Every tool says what it is not.** User-facing tools carry the no-warranty
  disclaimer ([`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md), section 5b). Keep
  it when you edit a page.
- **Privacy stays local.** The browser tools never send what a user types
  anywhere; usage counting stays in the visitor's own browser and honours Do
  Not Track. Do not add analytics, trackers or network calls to a tool.

## Where to go next

| You want to | Read |
|---|---|
| Find the guide written for your trade, field or role | [`docs/contributing/start-here.md`](docs/contributing/start-here.md) |
| Get the code and run something in five minutes | [`docs/contributing/setup.md`](docs/contributing/setup.md) |
| Fix or improve a calculator, checker or app | [`docs/contributing/fix-a-tool.md`](docs/contributing/fix-a-tool.md) |
| Write a blog post, a README, an `llms.txt` or other docs | [`docs/contributing/writing.md`](docs/contributing/writing.md) |
| Reproduce or extend a research project | [`docs/contributing/research.md`](docs/contributing/research.md) |
| Direct agent sessions the way the maintainer does, here or in your own repository | [`docs/contributing/steering-agents.md`](docs/contributing/steering-agents.md) |
| Make sense of the agent files you keep running into | [`docs/contributing/README.md`](docs/contributing/README.md), "What you can ignore" |

By contributing you agree that your contribution is licensed under the
repository's [MIT license](LICENSE).
