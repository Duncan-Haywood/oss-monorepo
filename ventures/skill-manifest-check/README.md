# Skill Manifest Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/skill-manifest-check/>

A free tool that checks one or more pasted `SKILL.md` files — the
frontmatter-plus-Markdown format Claude Code and similar agent systems use
for an agent "Skill" — for the authoring mistakes that most often keep a
skill from triggering reliably: missing or malformed YAML frontmatter, a
`description` too vague to match against, overlapping triggers between two
or more skills, and an instruction body large enough to be worth a
context-budget caution.

After using this, you can now **catch the frontmatter and description
mistakes that keep a skill silent before you ship it**, which used to mean
publishing the skill, using it for a while, and eventually noticing it never
fires.

**What it is not:** a semantic reviewer of your skill's quality, a live
trigger test inside a real agent, or a call to any AI model. It never
uploads anything and never runs the skill — it only looks at the text you
paste and flags structural patterns in it. A finding is something worth a
look, not a verdict; a clean result is not a guarantee the skill will
trigger correctly either, only that none of this tool's mechanical checks
fired.

## Why this exists

A `SKILL.md`'s `description` field is the one thing an agent matches a real
request against to decide whether to load the skill at all — there is no
second chance and no manual override in the ordinary case. A description
that "sounds right" to the author (too short, too generic, or missing a
concrete cue for *when* to use it) can leave a working skill effectively
invisible, and the failure is silent: nothing errors, the skill just never
fires. The same shape shows up across multiple skills — two descriptions
sharing enough distinctive vocabulary compete for the same request even
when neither file is individually wrong.

## What gets flagged

- **Missing/malformed required frontmatter** — no `name`, no `description`,
  a `name` that isn't kebab-case, or a frontmatter block that isn't
  parseable at all (missing/malformed `---` delimiters, an unparseable
  line, unexpected indentation).
- **A description too vague to trigger reliably** — under a word-count
  floor, missing a concrete trigger cue (no "use when…", no example
  phrasing, no quoted sample request), or built almost entirely from
  generic filler words with too little distinctive vocabulary left after
  removing them.
- **Overlapping triggers across pasted skills** — when you paste two or
  more `SKILL.md` files at once, pairs whose descriptions share enough
  distinctive vocabulary that an agent choosing between them on a real
  request is plausibly a toss-up.
- **Body-size / context-budget caution** — a rough token estimate for the
  instruction body against a documented (not vendor-asserted) caution
  line. This is always a caution, never a hard fail — a long body can be
  entirely justified by the job the skill does.

**On the vagueness and overlap heuristics specifically:** these are
pattern-matching signals against known failure shapes — word count, a
fixed list of trigger-cue phrasings, and shared vocabulary after removing a
fixed filler-word list — not a semantic understanding of what your
description says. A description that reads perfectly well to a human can
still trip a heuristic, and a description that clears every heuristic can
still fail to trigger inside a real agent session. Read every finding as
worth a second look, never as a guarantee either way.

## Try it without installing anything

[`index.html`](index.html) runs the exact same logic as
[`calc.mjs`](calc.mjs) entirely in the browser. Paste your `SKILL.md`, or
load the built-in example bundle, and see every finding immediately —
nothing is uploaded, and the page makes no network requests.

```sh
cd ventures/skill-manifest-check
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a guarantee that a skill will or
will not trigger correctly in any particular agent runtime, and it does not
replace testing the skill inside the agent you actually run it in. **You
are responsible for reviewing and verifying its output before relying on
it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

**Privacy.** Everything runs client-side in your browser. The `SKILL.md`
text you paste, and every finding this tool produces, never leaves your
device — there is no upload, no server-side processing, and no
third-party analytics vendor. Usage logging is opt-in, stays in
`localStorage` on your device, and records only that a lint ran or a
summary was copied — never the pasted content or the findings themselves.
Do Not Track and Global Privacy Control disable it automatically.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and does not change what the tool does.
