# Claude Code Settings Check

A free tool that checks a pasted Claude Code `settings.json` — and,
optionally, its sibling `settings.local.json` — for the structural mistakes
that fail silently: a hook whose matcher regex can't compile, a hook entry
with no command to run, an event or hook-type name that doesn't match this
tool's documented list, a permission rule with unbalanced parentheses or an
empty specifier, a rule duplicated across `allow`/`deny`/`ask`, and a rule
that contradicts itself across the project file and your own local
overrides.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/claude-code-settings-check/

After using this, you can now **catch a hook that will never fire, or a
permission rule that will never match, before you find out the hard way** —
which used to mean noticing only when the hook you expected never ran, or a
command you thought was blocked went through anyway.

**What it is not:** a test of Claude Code's actual runtime behaviour, or a
claim about which file or list wins when two rules disagree. It never
uploads anything and never calls an AI model — it only looks at the text
you paste and flags structural patterns in it. A finding is something
worth a look, not a verdict; a clean result is not a guarantee your hooks
and permissions behave the way you intend, only that none of this tool's
mechanical checks fired.

## Why this exists

A hook whose `matcher` is an invalid regular expression doesn't error —
it just never matches, so the hook silently never runs. A hook entry with
no `command` matches and runs nothing. A permission rule with an extra or
missing parenthesis doesn't warn you — it just doesn't match what you
meant it to. None of these produce a log line or an error message; the
first sign is usually "why didn't that hook run" or "why did that command
go through", days or weeks later. The two-file case compounds it: a `deny`
rule in the shared, committed `settings.json` and an `allow` for the exact
same rule in your own `settings.local.json` is an easy copy-paste mistake
to make and an easy one to miss, because neither file looks wrong read on
its own.

## What gets flagged

- **An invalid matcher regex** — a `hooks` entry's `matcher` string that
  does not compile as a regular expression, so the hook it's attached to
  never fires.
- **A hook with nothing to run** — a matcher group with an empty or missing
  `hooks` array, or a hook entry with an empty or missing `command`.
- **An event or hook-type name this tool doesn't recognise** — checked
  against a documented, dated list (`PreToolUse`, `PostToolUse`,
  `Notification`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `PreCompact`,
  `SessionStart`, `SessionEnd` for events; `command` for the hook type).
  Always a caution, never a hard error — Anthropic can add a new one at
  any time, and this only means "not one this tool knows about yet, so
  check it isn't a typo."
- **A malformed permission rule** — unbalanced parentheses, trailing text
  after the closing parenthesis, an empty `(specifier)`, or leading/trailing
  whitespace on the rule string.
- **A rule duplicated within one list**, or **appearing in more than one of
  `allow`/`deny`/`ask`** in the same file — flagged without asserting which
  list Claude Code would actually honour.
- **A rule that contradicts itself across `settings.json` and
  `settings.local.json`** — the same rule in one file's `deny` and the
  other's `allow` or `ask`.

**On the event/hook-type checks specifically:** these are cautions dated
against this tool's own documented reference, not an authoritative,
exhaustive list asserted on Anthropic's behalf. A name outside the list is
worth a second look, not proof of a mistake. Everything else — regex
validity, parenthesis balance, exact-string duplication — is a fact about
the text pasted in, independent of any Claude Code version.

## Try it without installing anything

[`index.html`](index.html) runs the exact same logic as
[`calc.mjs`](calc.mjs) entirely in the browser. Paste your `settings.json`,
or load the built-in broken example, and see every finding immediately —
nothing is uploaded, and the page makes no network requests.

```sh
cd ventures/claude-code-settings-check
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a guarantee of how Claude Code will
behave at runtime, and it does not replace testing your configuration in
the agent you actually run it in. **You are responsible for reviewing and
verifying its output before relying on it**, and for checking any finding
against Claude Code's current documentation. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Privacy.** Everything runs client-side in your browser. The settings
text you paste, and every finding this tool produces, never leaves your
device — there is no upload, no server-side processing, and no
third-party analytics vendor. Usage logging is opt-in, stays in
`localStorage` on your device, and records only that a check ran or a
summary was copied — never the pasted content or the findings themselves.
Do Not Track and Global Privacy Control disable it automatically.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and does not change what the tool does.
