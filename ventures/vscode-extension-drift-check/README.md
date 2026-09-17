# VS Code Extension Drift Check

A free tool that snapshots which VS Code (or Cursor, Windsurf, VSCodium)
extensions are installed and tells you exactly which ones changed their
**activation surface** — a new startup-activation trigger, a new extension
dependency, or a changed entry point — since an earlier snapshot. A separate,
CLI-only command checks a snapshot against the live VS Code Marketplace to
flag an extension that no longer resolves there.

**What it is not:** a malware scanner, a security audit, or a verdict on any
specific extension. It answers narrow, deterministic questions from the
snapshots and the Marketplace's own public listing — did this extension's
declared surface just change, and does it still exist where it came from —
with no model and no guessing.

## Why this exists

Neither VS Code nor the extension marketplaces notify you when an extension
you already trust and have installed changes what triggers it, or is later
pulled for being malicious. Auto-update just quietly stops offering a new
version; nothing tells you the one you have is now flagged, and nothing
uninstalls it for you.

| Campaign | Marketplace | Since | What happened |
|---|---|---|---|
| GlassWorm | Open VSX | 2026-01-31 | Self-propagating campaign that has abused at least 72 extensions, mimicking widely used linters, formatters, code runners, and AI-coding-assistant tools. |
| Nx Console | VS Code Marketplace | 2026-05-18 | A trojanized build was live for roughly 18 minutes before takedown, distributing a credential stealer that harvested 1Password vaults, Claude Code configuration, and npm/GitHub/AWS tokens from anyone who updated during that window. |

Sources: [The Hacker News on GlassWorm](https://thehackernews.com/2026/03/glassworm-supply-chain-attack-abuses-72.html),
[The Hacker News on the Nx Console breach](https://thehackernews.com/2026/05/github-internal-repositories-breached.html).

`vscode-extension-drift-check` is the editor-extension sibling of
[`npm-lifecycle-script-check`](../npm-lifecycle-script-check/) and
[`license-drift-check`](../license-drift-check/): same "paste two
point-in-time snapshots, get a deterministic diff" shape, a different
supply-chain surface.

## Try it without installing anything

[`index.html`](index.html) diffs a pasted snapshot entirely in the browser.
Paste your current one alone for a right-now inventory of anything that
activates unconditionally on startup, or add an older snapshot for a diff
that names exactly what changed. No fetch happens from the page itself, so
nothing you paste ever leaves your device — that also means the browser page
cannot check the live Marketplace; that command is CLI-only, on your own
machine. See "What each command touches" below.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+.

```sh
node cli.mjs snapshot --out baseline.json     # scans your extensions dir, commit this once after review
# ...time passes; an extension auto-updates...
node cli.mjs snapshot --out current.json
node cli.mjs diff baseline.json current.json  # exits 1 only if something's surface changed
node cli.mjs diff baseline.json current.json --json
node cli.mjs diff baseline.json current.json --ignore ms-python.python   # accept a reviewed change
node cli.mjs check current.json               # live Marketplace lookup, per extension
node cli.mjs check current.json --fail-on-not-found
```

`snapshot` auto-detects the first of `~/.vscode/extensions`,
`~/.cursor/extensions`, `~/.windsurf/extensions`, `~/.vscode-server/extensions`,
or `~/.vscode-oss/extensions` that exists, or takes `--dir` explicitly. You
can also paste the output of `code --list-extensions --show-versions` (or the
Cursor/Windsurf equivalent) directly — id and version only, no surface data,
so a diff against that kind of snapshot can tell you what was added or
removed but not whether a surface changed.

### What each command touches

- **`snapshot` and `diff` make no network call, ever.** They read local
  `package.json` manifests already on disk, or files you name.
- **`check` does call the network**, from your own machine, only when you run
  it: it queries the same public VS Code Marketplace lookup the editor's own
  Extensions view uses, with no API key and no account. This is a
  **best-effort, third-party API this project does not control** — it can
  change shape or rate-limit without notice, and a failed lookup for one
  extension is reported as `Lookup failed`, never as a false claim about
  that extension being safe or missing.

**Not found is a reason to check by hand, not a verdict.** An extension can
be absent from the exact id `check` queried because it was removed or
delisted — or simply because it was only ever installed from a different
source: a `.vsix` sideload, a private registry, or (for the many extensions
that are Marketplace-only and never published to Open VSX, or vice versa) a
different marketplace than the one being queried. `check` only queries the
VS Code Marketplace; it does not also query Open VSX, so an extension
installed from Open VSX will correctly show as not found there without that
meaning anything was pulled.

More, including wiring this into CI as a gate:
[the docs page](why-vs-code-does-not-warn-you-when-an-extension-is-delisted.html).

## Disclaimers

This tool reports a structural difference between two snapshots of an
extension's declared manifest fields, and a factual "does this id currently
resolve on the VS Code Marketplace" lookup. It is **not a malware scanner or
a security audit**, and neither an unflagged surface nor a resolved id is
thereby proven safe. Verify by reading the extension's source yourself, the
same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
your installed extensions. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns it off entirely. The CLI's
`snapshot` and `diff` commands record nothing and make no network call;
`check` makes only the Marketplace lookups you asked for, to Microsoft's own
API, never to this project.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The diff engine and CLI
are built and tested; no external user contact has happened yet — that is the
next, non-code step (see `kill_criteria` in `VENTURE.yaml`).
