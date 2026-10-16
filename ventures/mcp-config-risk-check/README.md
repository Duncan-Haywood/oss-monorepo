# MCP Config Risk Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mcp-config-risk-check/>

A free tool that checks a pasted Model Context Protocol (MCP) server config
— `mcp.json`, `claude_desktop_config.json`, a VS Code `.vscode/mcp.json`, or
any list of server entries — for structural risk patterns: a server granted
broad filesystem or shell access, an API key or token hardcoded in the
config instead of referenced from an environment variable, a launched
package or image with no version pin, and a tool name shadowed across two
or more connected servers.

After using this, you can now **spot a risky server entry in a pasted
config in seconds**, which used to take reading every `command`/`args`/`env`
block by hand and knowing the version-pin syntax for `npx`, `uvx`, `pipx`,
and `docker` off the top of your head.

**What it is not:** a security audit, a scanner of the server's actual code,
or a compliance attestation. It never contacts a server, a package registry,
or a vulnerability database — it only looks at the text you paste and flags
structural patterns in it. A finding is something worth a human look, not a
verdict; a clean result is not a safety guarantee either, only that none of
this tool's mechanical checks fired.

## Why this exists

MCP server configs are trust decisions written in a syntax nobody reviews
carefully: `command`/`args`/`env` blocks that grant a server a shell, a root
filesystem path, or a literal API key sitting in plain JSON. None of that is
inherently malicious — a lot of it is completely intentional — but it is
exactly the kind of thing worth a second look before approving a new server
or reviewing an existing one, and doing that by eye across a config with a
dozen servers is slow and easy to get wrong.

This is a different question from the one
[`mcp-supply-chain-watch`](../mcp-supply-chain-watch/) answers. That tool
diffs two *captured tool manifests* over time to show what changed since a
server was approved — an added tool, a removed one, a description that now
contains model-directed instruction language. This tool looks at a single,
current *launch config* — the file your client reads to start each server —
and flags risk patterns in it right now, before any drift has had a chance
to happen. The two are complementary and cross-linked in each tool's footer.

## What gets flagged

- **Broad filesystem/shell access** — the server's `command` is a shell
  interpreter (`bash`, `powershell`, …) launched directly, an argument is
  exactly `/`, `~`, or another root/home path, or an argument matches a
  known broad-permission flag (`--dangerously-skip-permissions`,
  `--allow-all`, `--no-sandbox`, and similar).
- **Hardcoded secrets** — an `env` or header value matches a known token
  shape (an OpenAI/Anthropic-style `sk-…` key, a GitHub token, a Slack
  token, an AWS access key ID, a Google OAuth token, a bearer token) no
  matter what the key is named, or a key named like a secret
  (`token`/`key`/`secret`/`password`/`credential`) holds a plain literal
  instead of an environment-variable reference such as `"${MY_API_KEY}"`.
- **No version pin** — the config launches `npx`, `uvx`, `pipx run`, or
  `docker run` against a package or image with no explicit version, so the
  server that runs today may not be the server that runs tomorrow.
- **Duplicate/shadowing tool names** — when the pasted data happens to
  include each server's own tool list (not present in an ordinary launch
  config, but common in a captured manifest export), a tool name exposed by
  more than one connected server, so a client's name resolution silently
  shadows one of them.

## Try it without installing anything

[`index.html`](index.html) runs the exact same logic as
[`calc.mjs`](calc.mjs) entirely in the browser. Paste your config, or load
the built-in example, and see every finding immediately — nothing is
uploaded, and the page makes no network requests.

```sh
cd ventures/mcp-config-risk-check
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a security audit, and it does not
replace reviewing your own config and each server's source before trusting
it. **You are responsible for reviewing and verifying its output before
relying on it**, and for meeting any obligation it helps you prepare for.
To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Privacy.** Everything runs client-side in your browser. The config you
paste, and every finding this tool produces, never leaves your device —
there is no upload, no server-side processing, and no third-party analytics
vendor. Usage logging is opt-in, stays in `localStorage` on your device, and
records only that an audit ran or a summary was copied — never the config
contents or the findings themselves. Do Not Track and Global Privacy
Control disable it automatically.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and does not change what the tool does.
