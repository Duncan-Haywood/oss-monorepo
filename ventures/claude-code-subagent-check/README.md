# Claude Code Subagent Check

A free tool that checks a pasted Claude Code subagent definition
(`.claude/agents/*.md`) for the structural mistakes that stop the orchestrator
from delegating to it — a name that isn't kebab-case or doesn't match the
filename, a missing or too-vague `description` (the one field delegation is
matched against), a `tools` entry that's empty, duplicated, or unrecognized, a
`model` alias this tool doesn't know, and a missing or near-empty system
prompt.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/claude-code-subagent-check/

After using this, you can now **catch a subagent that will never get
delegated to, before you find out the hard way** — which used to mean
noticing only when you expected the orchestrator to reach for a specialist
subagent and it just... didn't.

**What it is not:** a test of Claude Code's actual delegation decisions at
runtime, or a claim that a clean result means the orchestrator will pick this
subagent for any given request. It never uploads anything and never calls an
AI model — it only looks at the text you paste and flags structural patterns
in it. A finding is something worth a look, not a verdict.

## Why this exists

A subagent's `description` is the only thing the orchestrator matches a real
request against to decide whether to delegate — not the `name`, not the body.
A description that's too short, has no concrete trigger cue ("use when...",
"use PROACTIVELY", "MUST BE USED"), or is built almost entirely from generic
filler ("helps with various tasks") gives the orchestrator nothing reliable to
match on, and the failure is silent: no error, no log line, just a subagent
that quietly never gets reached for. The `tools` and `model` fields have their
own quiet failure modes too — a stray trailing comma leaves an empty entry, a
typo'd tool name is easy to miss in a comma-separated list, and neither one
raises a parse error on its own.

This tool exists for the same reason
[Claude Code Settings Check](../claude-code-settings-check/),
[Skill Manifest Check](../skill-manifest-check/), and
[MCP Config Risk Check](../mcp-config-risk-check/) do — a different
AI-agent-tooling file, checked for the shapes that fail silently, entirely
client-side.

## What gets flagged

- **A malformed or mismatched `name`** — not kebab-case (lowercase letters,
  digits, single hyphens), or not matching the filename you optionally give.
- **A missing or too-vague `description`** — absent entirely, too short (fewer
  than 8 words), missing a concrete trigger cue, or built mostly from generic
  filler words with too little distinctive vocabulary left after removing
  them.
- **A malformed `tools` list** — an empty entry from a stray or trailing
  comma, a name duplicated in the list, a name with characters no tool name
  (built-in or MCP) uses, or a name outside this tool's documented built-in
  list as a caution (never an error — MCP and custom tool names are
  open-ended).
- **An unrecognized `model` value** — outside the documented short aliases
  (`sonnet`, `opus`, `haiku`, `inherit`) and not shaped like a full model id,
  as a dated caution.
- **A missing or near-empty system-prompt body** — the subagent has (almost)
  no instructions to run with, beyond its name and description.

**On the tools/model checks specifically:** these are cautions dated against
this tool's own documented reference, not an authoritative, exhaustive list
asserted on Anthropic's behalf. A name outside the list is worth a second
look, not proof of a mistake. Everything else — frontmatter parsing, kebab-case
shape, word counts, exact-string duplication — is a fact about the text pasted
in, independent of any Claude Code version.

## Try it without installing anything

[`index.html`](index.html) runs the exact same logic as
[`calc.mjs`](calc.mjs) entirely in the browser. Paste your subagent
definition, or load the built-in broken example, and see every finding
immediately — nothing is uploaded, and the page makes no network requests.

```sh
cd ventures/claude-code-subagent-check
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a guarantee of how Claude Code will
delegate to or run this subagent, and it does not replace testing the
subagent in the agent you actually run it in. **You are responsible for
reviewing and verifying its output before relying on it**, and for checking
any finding against Claude Code's current documentation. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Privacy.** Everything runs client-side in your browser. The subagent text
you paste, and every finding this tool produces, never leaves your device —
there is no upload, no server-side processing, and no third-party analytics
vendor. Usage logging is opt-in, stays in `localStorage` on your device, and
records only that a check ran or a summary was copied — never the pasted
content or the findings themselves. Do Not Track and Global Privacy Control
disable it automatically.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and does not change what the tool does.
