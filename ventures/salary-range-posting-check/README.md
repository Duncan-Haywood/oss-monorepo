# Salary Range Posting Check

A free tool that scans pasted job-posting text for a stated **dollar range**,
and cross-references a chosen set of US states against a fixed table of
which ones currently require a posted pay range — citing the law, effective
date, and employer-size threshold.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/salary-range-posting-check/

**What it is not:** legal advice, a substitute for a licensed employment
attorney, or a guarantee that a specific posting is compliant. It is a
literal text-pattern scan plus a reference lookup against a fixed table —
see the disclaimers below and [the explainer
page](why-pay-range-laws-differ-by-state.html) for exactly what is and
isn't modeled.

After using this, you can now **paste a draft posting once and see, for
every state it could be filled from, whether the wording already states a
range and which of those states currently require one** — instead of
searching each state's law separately and re-reading your own draft against
each answer by hand.

## Why this exists

Fourteen states and DC now require a job posting itself to state a
good-faith pay range, and the list has grown every year since Colorado's
2021 law — Virginia and Maine both add a state-wide requirement effective
July 2026. Any team hiring remotely, or across state lines, hits this
question on every requisition: does this specific draft satisfy the states
it could be filled from? That is a well-documented, repeatedly-published
compliance topic ("pay transparency laws by state," "does [state] require a
salary range in job postings") with plenty of free content answering the
single-state legal question and none of it looking at the posting you
actually wrote.

## Try it without installing anything

[`index.html`](index.html) scans your pasted text and looks up the state
table entirely in the browser. Nothing you paste is uploaded.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. No network call, ever.

```sh
node cli.mjs scan "$60,000 - $80,000 per year" --states CO,NY
node cli.mjs scan --file posting.txt --states California,Texas --json
node cli.mjs states                                                   # all 51 jurisdictions
```

`scan` exits 1 when a selected state requires a range and none was detected
in the text, 0 otherwise, and 2 on an unrecognized state or missing file —
so it doubles as a one-line reminder in a posting-review checklist or an ATS
template's CI step.

More, including what this tool deliberately does not check (city/county
ordinances, disclose-at-a-different-point laws): [the explainer
page](why-pay-range-laws-differ-by-state.html).

## What's covered

| Check | Source |
|---|---|
| Posting-text range scan | Literal pattern match: two dollar figures close together joined by a dash, en dash, or "to"/"through" |
| Per-state posting-range requirement | 14 jurisdictions with a state-wide law, each with its law name, effective date, and size threshold (flagged when this build's confidence in the threshold is lower) |

Not covered: disclose-at-a-different-point laws (Connecticut, Nevada, Rhode
Island, and others), city/county ordinances (Cincinnati, Toledo, Columbus,
Jersey City), industry-specific exemptions, and whether your employer meets
a given threshold. Not a verification that any state's law hasn't changed
since this table was built (last checked 2026-09-24).

## Disclaimers

**Not legal advice.** This tool reports a literal text scan and a fixed
table's state-level classification — nothing more. It does not know your
employer's size, whether a role is exempt, or your specific state's current
statute text, and state law changes without notice. Verify against your
state's labor agency or an employment attorney before relying on this.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`posting_scanned`,
`example_loaded`, `link_shared`, `link_loaded`) in `localStorage` only —
never transmitted, never tied to the text you pasted. Do Not Track and
Global Privacy Control are honoured, and a button on the page turns it off
entirely. The "Copy shareable link" button carries only your selected
states — never the posting text. The CLI records nothing and makes no
network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs usage.test.mjs share.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The engine, CLI, and
browser page are built and tested; no external user contact has happened
yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
