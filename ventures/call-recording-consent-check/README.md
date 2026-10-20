# Call Recording Consent Check

A free tool that looks up whether a US state requires **all-party** consent
to record a phone call or follows the federal **one-party-consent**
baseline, checks a call between two (possibly different) states, cites the
governing statute, and generates a ready-to-read call-opening disclosure
script.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/call-recording-consent-check/

**What it is not:** legal advice, a substitute for a licensed attorney, or a
guarantee about how a specific court would rule on a specific call. It is a
reference lookup against a fixed table of each state's *default* rule — see
the disclaimers below and [the explainer
page](why-call-recording-consent-laws-differ-by-state.html) for exactly what
is and isn't modeled.

After using this, you can now **know in one step whether a call between two
states needs everyone's spoken consent, and have the words to ask for it**,
instead of running two separate state-law searches and writing the script
yourself under time pressure.

## Why this exists

Any sales, support, recruiting, or telehealth team that calls people in more
than one state runs into this eventually: fourteen states plus DC require
every party's consent to record a call, the rest follow the federal
one-party baseline, and two of the fourteen (Nevada, Michigan) have a real,
commonly-missed ambiguity between what their statute says and how it is
applied. None of that is exotic legal territory — it is a well-documented,
repeatedly-searched compliance question ("call recording laws by state",
"is [state] one-party or two-party consent") with plenty of existing free
content answering the single-state case and very little addressing the
interstate one, which is exactly the case a distributed or remote team
actually has.

## Try it without installing anything

[`index.html`](index.html) looks everything up entirely in the browser from
a fixed table shipped with the page. Nothing you pick is uploaded.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. No network call, ever.

```sh
node cli.mjs check California Texas                                   # full names
node cli.mjs check CA TX --json                                       # abbreviations, JSON
node cli.mjs states                                                   # all 51 jurisdictions
node cli.mjs script all-party --company "Acme Inc." --purpose "training purposes"
```

`check` exits 1 when the pair requires all-party consent, 0 when one-party
consent is sufficient, and 2 on an unrecognized state — so it doubles as a
one-line reminder in a new-market onboarding checklist or CI step.

More, including the two states with a disclosed ambiguity and what this
tool deliberately does not check: [the explainer
page](why-call-recording-consent-laws-differ-by-state.html).

## What's covered

| Check | Source |
|---|---|
| Per-state default classification | 50 states + DC, each labeled one-party or all-party; the fourteen all-party jurisdictions carry their specific statute citation |
| Interstate combining rule | Conservative all-party guidance whenever either state requires it, citing *Kearney v. Salomon Smith Barney* as the precedent behind that reading |
| Disclosure script | A ready-to-read call-opening line matching the determined requirement, with your company name and stated purpose filled in |

Not covered: in-person conversations, 911/emergency calls, law-enforcement
recording, a parent's vicarious consent for a minor's calls, and any
industry-specific notice rule layered on top of the wiretap statute. Not a
verification that any state's statute hasn't been amended since this table
was built.

## Disclaimers

**Not legal advice.** This tool reports a fixed table's default
classification and a conservative combined reading for interstate calls —
nothing more. It does not know the facts of your specific call and does not
replace a lawyer licensed in the relevant state. State statutes are amended
and renumbered without notice; verify the current text before relying on
this for an actual call.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`requirement_checked`,
`script_generated`, `example_loaded`) in `localStorage` only — never
transmitted, never tied to the states you looked up. Do Not Track and
Global Privacy Control are honoured, and a button on the page turns it off
entirely. The CLI records nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The engine, CLI, and
browser page are built and tested; no external user contact has happened
yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
