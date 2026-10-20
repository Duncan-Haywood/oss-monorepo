# Obsidian Plugin Review Checker

A free tool for Obsidian plugin developers: scans your **`manifest.json`**,
**`versions.json`**, and **JavaScript/TypeScript source** for the patterns
behind common Obsidian community-plugin review delays, before a reviewer
finds them for you:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/obsidian-plugin-review-check/

- **Missing `versions.json` entry** -- the current `manifest.json` `version`
  has no matching key in `versions.json`. Obsidian's release mechanism reads
  `versions.json` to decide which installed app versions can see a given
  release; the two files live separately with nothing forcing them to move
  together, so this is one of the easiest release-blocking mistakes to
  introduce by accident.
- **Sample-plugin template placeholders** -- `manifest.json` still carries the
  official `obsidian-sample-plugin` template's own default values: id
  `"sample-plugin"`, name `"Sample Plugin"`, or author `"Your Name"`. A
  submission that still carries any of these has not customized the template
  it was generated from.
- **Missing required manifest fields** -- `id`, `name`, `version`,
  `minAppVersion`, `description`, `author`. `authorUrl`, `fundingUrl`, and
  `isDesktopOnly` are reported as recommended-but-not-required when absent.
- **`innerHTML`/`outerHTML`/`insertAdjacentHTML` usage** -- Obsidian's own
  developer guidelines name this pattern as a cross-site-scripting risk and
  recommend the DOM API or Obsidian's own `createEl`/`createSpan`/`createDiv`
  helpers instead.
- **Informational notes**: a direct `document.addEventListener`/
  `window.addEventListener` call (Obsidian's `Component` API's
  `registerDomEvent` removes a listener automatically on plugin unload; a
  direct call needs its own manual cleanup), and a leftover `console.log`
  call.

After using this, you can find the exact field, version, or line to fix
before you submit or update a community plugin -- instead of guessing from
the guidelines or waiting for a reviewer to comment on it.

Two ways to run it, sharing the same detection logic (`scan.mjs`):

## Browser

Open `index.html`. Select your plugin's project folder with the folder
picker and click **Check plugin**. Nothing is uploaded -- the files are read
locally with the File API.

## CLI

```
node check.mjs [path] [--manifest <file>] [--versions <file>] [--json]
```

Defaults to the current directory, recursing into it while skipping `.git`,
`node_modules`, and `.obsidian`. Finds the first `manifest.json` and
`versions.json` in the tree (overridable with `--manifest`/`--versions`) and
every `.js`/`.ts`/`.jsx`/`.tsx` source file (excluding `.d.ts` declaration
files). Exits `0` when both files were found and valid JSON, no required
manifest field is missing, no sample-plugin placeholder is left in place, the
manifest's version has a matching `versions.json` entry, and no source file
assigns `innerHTML`/`outerHTML` or calls `insertAdjacentHTML`; `1` otherwise --
usable directly as a CI gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your data
- run: node check.mjs .
```

## What this is, and isn't

**Evidence, not a determination.** This is pattern-matching against known
`manifest.json`/`versions.json` field names and known risky DOM API calls in
the files you point it at. The `innerHTML`/`outerHTML`/`insertAdjacentHTML`
check and the informational notes are **line-level heuristics, not data-flow
or runtime analysis**: it cannot confirm a flagged value is actually
attacker-controlled, that a direct event listener really leaks across
reloads, or that a field spelled non-standardly is really absent rather than
just unrecognized. A clean report is not a guarantee your plugin will be
approved for the community plugin list -- verify against
[Obsidian's current plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
before you submit.

**Optional fields are reported, never counted against a clean result.**
`authorUrl`, `fundingUrl`, and `isDesktopOnly` are listed as missing when
absent but do not fail the check. **The two informational checks
(`document`/`window.addEventListener`, `console.log`) never fail the check
either** -- they are common review notes, not documented rejection causes on
their own.

The field names and the manifest/`versions.json` mechanism in `scan.mjs` are
reproduced from Obsidian's own published developer documentation as of
2026-09. They are data, not advice, and can go stale if Obsidian changes
them.

## Privacy

Everything runs locally. The browser tool reads the folder you select with
the File API and never uploads it. The CLI never makes a network call. The
only thing stored is an anonymous local count (`localStorage`, browser only)
of which features were used and the day -- no file names, no file contents,
no account, no tracking cookies, no analytics vendor, honouring Do Not Track
and Global Privacy Control automatically. Turn it off with the checkbox in
the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not legal or security advice, and it does not replace
Obsidian's own plugin-review process. You are responsible for reviewing and
verifying its output before relying on it, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency -- it's a script you run yourself.

Not affiliated with, endorsed by, or sponsored by Obsidian or Dynalist Inc.
Obsidian is a product of Dynalist Inc., named here only to describe what
this tool checks.

## Who this is for

Independent Obsidian plugin developers preparing a first submission or a
version update to the community plugin list -- searching things like
"obsidian plugin versions.json missing entry", "obsidian plugin review
guidelines", "obsidian sample plugin id not changed", or "obsidian plugin
innerHTML security" after a stalled review, or before one. The real, active
places this audience already discusses exactly these problems: r/ObsidianMD
on Reddit, the official Obsidian Discord's plugin-development channels, and
the `obsidianmd/obsidian-releases` GitHub repository's own pull-request
review comments, where every community-plugin submission is reviewed.

## License

[MIT](LICENSE). Free and open source --
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/obsidian-plugin-review-check && node --test
```

Assertions across the detection/parsing logic (`scan.test.mjs`), the CLI's
file-walking and reporting (`check.test.mjs`), the usage counter
(`usage.test.mjs`), and both pages' structure and disclaimers
(`page.test.mjs`).
