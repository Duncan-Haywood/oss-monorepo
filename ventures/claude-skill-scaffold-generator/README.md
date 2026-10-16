# Claude Skill Scaffold Generator

A free tool that turns a plain-language description of a Claude Agent
Skill — what it does, when Claude should use it, and any scripts,
references, or assets it bundles — into a starter `SKILL.md` with valid
YAML frontmatter and a suggested folder layout. It also flags the
authoring mistakes that keep a skill from ever triggering: a name that
isn't a clean slug, a description written in the first person, a missing
trigger condition, or a name/description outside the practical length
this tool documents.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/claude-skill-scaffold-generator/

After using this, you can now **start a new skill from a checked,
correctly-shaped `SKILL.md`** instead of copy-pasting a sibling skill's
frontmatter and hoping the description reads the way this one was
supposed to.

**What it is not:** a writer of the skill's actual instructions, or a
test of whether Claude will load and invoke the finished skill correctly.
It never uploads anything and never calls an AI model — it assembles the
frontmatter and body from the fields you type by a fixed template. The
generated body is a placeholder; write the real instructions yourself,
then actually try the skill before relying on it.

## Why this exists

Claude decides whether to load a skill from its `description` field
alone, before reading anything else in it. A description with no
concrete trigger condition ("when the user asks about X"), or one
written in the first person as if the skill were speaking ("I will help
you with..."), is the most common reason a skill exists in a repository
but never actually fires. None of this produces an error — the skill
just sits there unloaded. This tool catches the shape of that mistake
before you find out the hard way, and gets the mechanical parts (a valid
slug name, correctly quoted YAML frontmatter, a folder layout for the
files you said you'd bundle) right the first time.

## What gets flagged

- **An empty name, what-it-does, or when-to-use field** — the three
  inputs the generated frontmatter is built from.
- **A name that isn't already a clean, lowercase, hyphenated slug** — this
  tool slugifies it for you, but the mismatch is worth noticing before you
  name the folder something else.
- **A first-person description** ("I will...", "I can help with...")
  instead of third person, per public skill-authoring guidance.
- **A generated description that's too short** to plausibly tell the
  skill apart from a similar one, or **too long** for the practical
  length this tool documents.
- **A name over the practical length this tool documents.**

**On the length checks specifically:** these are cautions dated against
this tool's own documented reference, not a live-verified claim about
Anthropic's current skill-authoring spec, which can change. Everything
else — an empty field, a non-slug name, a first-person opening — is a
fact about the text you typed, independent of any spec version.

## Try it without installing anything

[`index.html`](index.html) runs the exact same logic as
[`calc.mjs`](calc.mjs) entirely in the browser. Fill in the fields, or
load the built-in example, and copy the generated `SKILL.md` and folder
layout — nothing is uploaded, and the page makes no network requests.

```sh
cd ventures/claude-skill-scaffold-generator
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty
of any kind, express or implied. It is not a guarantee that Claude will
load or invoke the generated skill correctly at runtime, and it does not
replace testing the skill in the agent you actually run it in. **You are
responsible for reviewing and verifying its output before relying on
it**, and for checking the frontmatter length guidance against
Anthropic's current skill-authoring documentation. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Privacy.** Everything runs client-side in your browser. The fields you
type, and every SKILL.md this tool generates, never leave your device —
there is no upload, no server-side processing, no AI model call, and no
third-party analytics vendor. Usage logging is opt-in, stays in
`localStorage` on your device, and records only that a SKILL.md was
generated or copied — never the skill name, description, or file paths.
Do Not Track and Global Privacy Control disable it automatically.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and does not change what the tool does.
