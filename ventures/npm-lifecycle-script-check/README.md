# npm Lifecycle Script Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/npm-lifecycle-script-check/>

A free tool that lists every package in a `package-lock.json` that runs a
`preinstall`, `install`, `postinstall`, or `prepare` script at install time —
and, given an older lockfile, tells you exactly which packages **gained**
one since then.

**What it is not:** a malware scanner, a security audit, or a verdict on any
specific package. It answers two narrow, deterministic questions — does this
package run code when `npm install` touches it, and did that just change —
from the snapshots themselves, with no model, no malware database, and no
guessing.

After using this, you can now **catch a dependency that just started
running code at install time, in the same review where the version bump
happened**, which used to take **nobody noticing until credentials were
already stolen or a machine was already mining someone else's coin.**

## Why this exists

`npm audit` matches installed versions against a database of known,
publicly reported vulnerabilities. That is the right tool for "is there a
known bug in this version" and the wrong shape for a lifecycle script: a
malicious script has no CVE to look up until someone has already found it,
reported it, and gotten it published — and by then it has already run on
everyone who installed the package in between. Four dated, widely reported
incidents used exactly this mechanism:

| Package | Date | Script | What happened |
|---|---|---|---|
| ua-parser-js | 2021-10-22 | `preinstall` | npm account hijacked; for about four hours, malicious versions installed an XMRig cryptominer and a Windows password-stealing trojan. ~8M weekly downloads. |
| coa & rc | 2021-11-04 | `postinstall` | Two unrelated packages (8.8M and 14.2M weekly downloads) hijacked the same day, carrying an identical malicious postinstall payload. |
| Shai-Hulud | 2025-09-15 | `postinstall` | Self-propagating worm: harvested npm/GitHub credentials, then republished a trojanized version of every package the stolen token could reach. |
| Shai-Hulud 2.0 | 2025-11 | `preinstall` | Second wave, moved to preinstall to run before scanners' own install-time checks. 700+ packages, 27,000+ malicious repos. |

Sources: [Rapid7](https://www.rapid7.com/blog/post/2021/10/25/npm-library-ua-parser-js-hijacked-what-you-need-to-know/)
and [BleepingComputer](https://www.bleepingcomputer.com/news/security/popular-npm-library-hijacked-to-install-password-stealers-miners/)
on ua-parser-js; [The Record](https://therecord.media/malware-found-in-coa-and-rc-two-npm-packages-with-23m-weekly-downloads)
and [Rapid7](https://www.rapid7.com/blog/post/2021/11/05/new-npm-library-hijacks-coa-and-rc/)
on coa/rc; [Unit 42](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/),
[Sysdig](https://www.sysdig.com/blog/shai-hulud-the-novel-self-replicating-worm-infecting-hundreds-of-npm-packages),
and [Datadog Security Labs](https://securitylabs.datadoghq.com/articles/shai-hulud-2.0-npm-worm/)
on Shai-Hulud and its second wave.

**`--ignore-scripts` removes the risk outright, at a cost this tool exists to
make cheap to pay only where it's needed.** Some packages genuinely need
their install script — a native addon compiling on install, a CLI fetching a
platform-specific binary — so a blanket policy breaks them, and auditing
which packages are in that set by hand is the tedious step most teams skip.
Knowing which packages run a script, and whether that just changed, is what
this tool answers.

`npm-lifecycle-script-check` is the install-time-execution sibling of
[`license-drift-check`](../license-drift-check/): same "paste two
point-in-time snapshots, get a deterministic diff" shape, a different
supply-chain signal.

## Try it without installing anything

[`index.html`](index.html) parses a pasted `package-lock.json` entirely in
the browser. Paste your current one alone for a right-now inventory of every
package that runs a script, or add an older copy for a diff that names
exactly what's new. No fetch happens from the page itself, so nothing you
paste ever leaves your device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. `snapshot` reads only local
`package.json` files already on disk; `lockfile` and `diff` read only the
files you name. None makes a network call.

```sh
node cli.mjs snapshot --out baseline.json          # commit this once, after review
# ...time passes; npm install / npm update / a Dependabot PR merges...
node cli.mjs snapshot --out current.json
node cli.mjs diff baseline.json current.json       # exits 1 only if something newly gained a script
node cli.mjs diff baseline.json current.json --json
node cli.mjs diff baseline.json current.json --ignore node-sass,esbuild   # accept a reviewed script
node cli.mjs lockfile package-lock.json            # or: just list what runs a script right now
```

**Scope, stated plainly.** `snapshot` reads the flat, top-level
`node_modules` layout npm produces for direct and hoisted dependencies (one
level, plus one level into `@scope/` directories) — the same documented
limit as `license-drift-check`'s snapshot. `lockfile`/the browser page read a
`package-lock.json`'s `hasInstallScript` flag (npm 7+, lockfileVersion 2 or
3 only) — real, but it records only *that* a script exists, never its text,
because the lockfile format doesn't carry lifecycle-script contents. Only
`snapshot`'s local `node_modules` read sees the actual script and can apply
the risk-keyword classification. The risk flags themselves
(`pipes-a-download-to-a-shell`, `makes-a-network-call`,
`obfuscated-or-encoded`) are a keyword match against patterns the incidents
above used — not exhaustive, and not a verdict: a legitimate installer can
also fetch a prebuilt binary.

More, including wiring this into CI as a gate:
[the docs page](why-npm-audit-does-not-catch-a-malicious-install-script.html).

## Disclaimers

This tool reports which packages declare an install-time script and flags a
small set of keyword patterns in that script's text. It is **not a malware
scanner or a security audit**, and an unflagged script is not thereby proven
safe. Verify by reading the script yourself, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
your dependency tree or a repository. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns it off entirely. The
CLI records nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The diff engine and
CLI are built and tested; no external user contact has happened yet — that
is the next, non-code step (see `kill_criteria` in `VENTURE.yaml`).
