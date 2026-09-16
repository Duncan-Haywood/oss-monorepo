# Agent Instructions Drift Check

A free tool that checks an AI-coding-agent instruction file — `AGENTS.md`,
`CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, or similar —
for drift against the repo it actually describes: a markdown-link or
inline-code file reference that no longer points at a real path, an
`npm run <script>` reference not defined in `package.json`, and known
interpreter-mismatch shell footguns (a bare `pytest` or `mypy` that can
silently resolve to the wrong Python and waste an agent's whole turn chasing
a phantom failure).

**What it is not:** a style linter, a prompt-quality checker, or a judgment
about whether an instruction is good advice. It never evaluates tone or
completeness — only whether a thing the file points at still matches what
the repo actually has today.

After using this, you can now **catch a stale file reference or a renamed
npm script in the same pull request that broke it**, which used to take
**an agent (or a new human contributor) burning a turn on a command that no
longer exists, or worse, silently succeeding against the wrong tool.**

## Why this exists

AGENTS.md and CLAUDE.md are prose, so nothing mechanical keeps them in sync
with the repo the way a compiler keeps a type signature in sync with a call
site. This is not hypothetical: this very repository's own `CLAUDE.md` has,
across many dated entries, documented real sessions losing time to exactly
the interpreter-mismatch footgun this tool flags — a bare `pytest` or `mypy`
resolving to an isolated interpreter missing the repo's dependencies, which
reports a plausible-looking failure that has nothing to do with the code
being checked. `AGENTS.md`-style instruction files became a real,
multi-vendor convention across AI coding agents in 2025 (Codex, Claude Code,
Cursor, and others all read one), and none of the general-purpose tooling
around that convention checks for this specific failure shape.

`agent-instructions-drift-check` is the AI-agent-instructions sibling of
this portfolio's other zero-dependency drift checkers: the same
deterministic, no-network, no-verdict shape as
[`env-example-drift-check`](../env-example-drift-check/) and
[`structured-data-drift-check`](../structured-data-drift-check/), applied to
an instruction file and the repo it describes instead of a config file or a
page's own markup.

## Try it without installing anything

[`index.html`](index.html) parses everything entirely in the browser. Paste
your instructions file, optionally your `package.json`, and optionally pick
your repo folder (only file *names* are read from it, never contents, and
nothing is uploaded either way).

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the instructions file, an
optional `package.json`, and the local paths the instructions file itself
names — no network call, ever.

```sh
node cli.mjs check AGENTS.md                         # resolves refs from the current directory
node cli.mjs check AGENTS.md --root .                 # explicit root
node cli.mjs check CLAUDE.md --package package.json   # explicit package.json
node cli.mjs check AGENTS.md --json                   # machine-readable
```

Exits 1 if any file reference is broken, any named npm script is undefined,
or a known footgun is present. Exits 0 otherwise.

More, including wiring this into CI as a gate, and this tool's own named
limitations: [the docs page](why-ai-agent-instruction-files-rot.html).

## What's checked

| Check | Source |
|---|---|
| Broken file reference | A markdown link target or an inline `` `code span` `` that looks like a path (has a slash and a letter-led extension, or is a well-known bare filename like `README.md`) |
| Undefined npm script | `npm run <name>`, `npm test`, `npm start` |
| Interpreter-mismatch footgun | Bare `pytest` / `mypy` inside a fenced code block with no `python3 -m` prefix on the same line |

Restricted to markdown links and inline code spans, not ordinary prose —
that is how instruction files actually cite a path when they mean it
literally, and this repo's own `AGENTS.md`/`CLAUDE.md` follow exactly that
convention throughout. A shorthand reference that relies on nearby prose for
its directory ("the same `validate.py` as above") reports as not found even
when a fuller path exists elsewhere — a disclosed limitation, not a bug; see
the docs page.

## Disclaimers

This tool reports whether a referenced path, npm script, or known shell
pattern matches what it was told about your repo — nothing more. It is not
a judgment on whether your instructions are good advice, and a clean result
is not a guarantee they are correct or complete. Verify by reading the
actual files before relying on it.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`, `folder_selected`) in `localStorage` only — never
transmitted, never tied to the text you pasted or the folder you picked. Do
Not Track and Global Privacy Control are honoured, and a button on the page
turns it off entirely. The CLI records nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The parsing/diff
engine, CLI, and browser page are built and tested; no external user contact
has happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
