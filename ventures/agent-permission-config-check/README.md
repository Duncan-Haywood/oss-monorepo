# Agent Permission Config Check

A free tool that statically lints an AI-coding-agent's permission and
MCP-server configuration — Claude Code's `.claude/settings.json`
(`permissions.allow` / `.deny` / `.ask`) and the `mcpServers` block shared,
in the same JSON shape, by `.mcp.json` (Claude Code project scope),
`.cursor/mcp.json` (Cursor), and `.vscode/mcp.json` (VS Code / Copilot) — for
a blanket `Bash` allow-all rule, an unscoped destructive-command allow with
no matching deny rule, an MCP server reached over plain `http://`, and a
hardcoded-looking secret in a server's `env` or `headers` instead of an
environment-variable reference.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/agent-permission-config-check/

**What it is not:** a runtime guard, a secret-verification service, or a
judgment that a config is safe. It never launches a server's command, never
contacts a server's `url`, and never checks whether a flagged value is a
real, live credential — only whether the config's shape matches one of four
named, risky patterns.

After using this, you can now **catch an allow-all Bash rule or a hardcoded
API key in the same pull request that added it**, which used to take
**noticing a stray permission edit or a copy-pasted example config days or
weeks later, usually after it was already committed.**

## Why this exists

Claude Code, Cursor, and VS Code's Copilot agent mode all read a
project-level config that decides what an AI coding agent is allowed to do
without asking first, and which external MCP servers it can reach. That
config is typically written once, during setup, by whoever got the agent
running fastest, and then edited by hand whenever a permission prompt
becomes annoying — the same unforced-drift shape this portfolio's
[`agent-instructions-drift-check`](../agent-instructions-drift-check/)
documents for instruction files, applied here to what the agent is allowed
to *do* rather than what it is told. Nothing mechanical currently checks it
the way a linter checks application code.

## Try it without installing anything

[`index.html`](index.html) parses everything entirely in the browser. Paste
your `settings.json` or MCP server config; nothing is uploaded.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the config file(s) it
finds or is told about, plus a best-effort local `git ls-files` check on the
same file — no network call, ever.

```sh
node cli.mjs check                            # auto-discovers config files under .
node cli.mjs check --root .                   # explicit root
node cli.mjs check --file .mcp.json           # check specific file(s)
node cli.mjs check --json                     # machine-readable
```

Exits 1 if any high- or medium-severity finding is present in any checked
file. Exits 0 otherwise (an informational-only finding, such as "no deny
rules at all", does not fail the run).

More, including wiring this into CI as a gate and this tool's own named
limitations: [the docs page](why-ai-agent-permission-configs-need-a-linter.html).

## What's checked

| Check | Severity | Source |
|---|---|---|
| Blanket Bash allow-all | high | A `permissions.allow` entry of bare `"Bash"` or `"Bash(*)"` |
| Unscoped destructive command | medium | An unscoped `allow` entry for `sudo`, `rm`, `curl`, `wget`, `chmod`, `eval`, `dd`, `mkfs`, `shutdown`, or `reboot`, with no matching `deny` rule for the same command |
| Plain-http MCP server | high | An `mcpServers` entry's `url` starting with `http://` |
| Hardcoded-looking secret | high (known token format) / medium (generic) | An `mcpServers` entry's `env`/`headers` value that is a literal instead of an `${VAR}`-style reference |
| No deny rules at all | info | `allow` is non-empty and `deny` is completely empty |

Restricted to these four risky-shape checks on purpose, not a full policy
review — see [the docs page](why-ai-agent-permission-configs-need-a-linter.html)
for what is deliberately out of scope for v0 and why.

## Disclaimers

This tool reports whether your config contains one of a fixed, named set of
risky shapes — nothing more. It is not security advice, and a clean result
is not a guarantee that your configuration is safe. Verify by reading the
actual values before relying on it, and rotate any credential you have
reason to believe was exposed.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
the JSON you pasted. Do Not Track and Global Privacy Control are honoured,
and a button on the page turns it off entirely. The CLI records nothing and
makes no network call except the local, best-effort `git ls-files` check.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The parsing/rule
engine, CLI, and browser page are built and tested; no external user contact
has happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
