# Contributing

Each directory under `ventures/` is a small, self-contained tool: usually a
calculator or checker that runs in the browser, often with a CLI beside it.
Fixes and improvements to a single tool are the easiest contributions to
review.

## Running a tool's tests

The tool's workflow, `.github/workflows/<slug>-ci.yml`, is the authoritative
list of what CI runs. Most tools need nothing but Node 22, run from the tool's
own directory:

```
cd ventures/<slug>
node --test
```

Python tools use `python3 -m unittest` or `python3 -m pytest`, as their
workflow's `run:` lines show.

## Pull requests

- Pull requests from forks are welcome. Workflows on a fork PR run only after
  the owner approves them, and a human reviews every fork PR before it merges.
  The agent review bots skip them.
- Keep a PR to one tool where you can.
- A new user-facing page needs the same disclaimer and usage counter the other
  tools carry ([`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md)).

## Who else works here

Most commits come from AI coding agents. [`CLAUDE.md`](CLAUDE.md) and
[`AGENTS.md`](AGENTS.md) are their operating instructions. You don't need to
read them to contribute.

## License

By contributing, you agree that your contribution is licensed under the MIT
License in [`LICENSE`](LICENSE). Report security issues privately, as
[`SECURITY.md`](SECURITY.md) describes, not in a public issue or PR.
