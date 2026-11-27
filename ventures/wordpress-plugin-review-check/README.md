# WordPress Plugin Review Checker

A free tool for WordPress plugin developers: scans your **`readme.txt`** and
**PHP source** for the patterns behind common wordpress.org Plugin Directory
review rejections and notes, before a reviewer -- or the automated
[Plugin Check](https://wordpress.org/plugins/plugin-check/) tool -- finds
them for you:

**Live tool:** https://marisstella.app/wordpress-plugin-review-check/

- **Stable tag / Version mismatch** -- `readme.txt`'s `Stable tag` line
  doesn't match the main plugin file's `Version` header. The directory serves
  whichever version `Stable tag` names, so a stale tag ships an old build
  even after you've shipped a new one. This is one of the most common review
  notes and one of the easiest to introduce by accident, because the two
  numbers live in two different files with nothing forcing them to move
  together.
- **Missing required fields** -- `readme.txt`'s `Stable tag` and `License`,
  and the plugin header's `Plugin Name`, `Version` and `License` (Plugin Check
  errors on a missing licence in either file). Several more fields are
  checked and reported as recommended-but-not-required (`License URI`,
  `Contributors`, `Tags`, `Requires at least`, `Tested up to`, header
  `Requires at least`, `Requires PHP`, `Text Domain`).
- **Licence problems** -- the three errors Plugin Check's licence rules raise
  (our own implementation of the same outcomes; the GPL-compatible families
  follow the FSF licence list): a readme `License` that is
  not an SPDX-style identifier (`invalid_license`), a header `License` that is
  not GPL-compatible (`plugin_header_invalid_license`, e.g. `Proprietary`),
  and readme and header naming different licences (`license_mismatch`, e.g.
  `GPLv2` against `GPL-3.0`).
- **Unescaped superglobal output** -- a `$_GET`/`$_POST`/`$_REQUEST`/
  `$_COOKIE`/`$_SERVER` value printed with `echo`/`print`/`printf` and no
  escaping function (`esc_html`, `esc_attr`, `esc_url`, `sanitize_text_field`,
  `absint`, and others) on the same line.
- **Missing nonce checks** -- a file that reads `$_POST` with no
  nonce-verification call (`check_admin_referer`, `check_ajax_referer`,
  `wp_verify_nonce`) anywhere in it. Plugin Check's own rule (WPCS
  `NonceVerification`) is stricter: it works per function and also covers
  `$_GET` and `$_REQUEST`, so treat a pass here as necessary, not sufficient.

After using this, you can find the exact field, line, or file to fix before
you submit or update a plugin -- instead of guessing from the guidelines or
waiting for review to reject the build and tell you.

Two ways to run it, sharing the same detection logic (`scan.mjs`):

## Browser

Open `index.html`. Select your `.php` source files and your `readme.txt`
with the file picker (Cmd/Ctrl-click, or select-all in the project folder)
and click **Check plugin**. Nothing is uploaded -- the files are read locally
with the File API.

## CLI

```
node check.mjs [path] [--readme <file>] [--plugin-file <file>] [--json]
```

Defaults to the current directory, recursing into it while skipping `.git`,
`node_modules`, `vendor`, `dist`, `build`, `.wordpress-org`, `languages`, and
dotfiles/dotdirs. Finds every `readme.txt` in the tree (reads the first;
`--readme` overrides which one) and the first PHP file carrying a
`Plugin Name:` header line (`--plugin-file` overrides which one). Exits `0`
when a readme and a plugin header were found, `Stable tag` matches `Version`
(and is not `trunk`, which Plugin Check reports as an error), every required field is present, no line
echoes a superglobal with no escaping function, and no file reads `$_POST`
with no nonce check anywhere in it; `1` otherwise -- usable directly as a CI
gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your data
- run: node check.mjs .
```

## What this is, and isn't

**Evidence, not a determination.** This is pattern-matching against known
`readme.txt`/plugin-header field names and known WordPress escaping/nonce
function names in the files you point it at. The unescaped-output and
missing-nonce checks are **line-level and file-level heuristics, not
data-flow analysis**: it cannot confirm an escaping function found on the
same line actually applies to the printed value (rather than, say, a
different variable on the same line), that a nonce check found anywhere in
the file actually runs before the specific `$_POST` read it's meant to
guard, or that a field spelled non-standardly is really absent rather than
just unrecognized. A clean report is not a guarantee wordpress.org Plugin
Review will pass -- verify against
[the Plugin Directory's current guidelines](https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/)
before you submit.

**"Recommended" fields are reported, never counted against a clean result.**
`License URI`, `Contributors`, `Tags`, `Requires at least`, and `Tested up to` in
`readme.txt`, and header `Requires at least`, `Requires PHP`, and
`Text Domain` are listed as missing when absent but do not fail the check --
their absence is a common first-review note, not a documented rejection
cause on its own.

The field names and function lists in `scan.mjs` are reproduced from
WordPress.org's own published plugin-developer documentation as of 2026-09.
They are data, not advice, and can go stale if WordPress changes them.

## Known gaps

From the quality audit of 2026-11-26
([`portfolio/quality/audits/2026-11-26-wordpress-plugin-review-check.json`](../../portfolio/quality/audits/2026-11-26-wordpress-plugin-review-check.json)),
measured against Plugin Check's source and the WordPress Coding Standards:

- `sanitize_text_field`, `sanitize_email`, `sanitize_file_name` and `boolval`
  count as escaping here; WPCS does not accept them as output escaping.
- Header parsing departs from core `get_file_data()`: `#`-prefixed and
  `<?php /* ... */` one-line headers are missed, a trailing `*/` is kept, there
  is no 8 KB window, and the first header file in any subdirectory wins.
- The nonce check is file-level and textual (a nonce call in a comment or
  another function counts) and reads `$_POST` only, where WPCS works per
  function.
- Not checked yet: the 5-tag limit, the 150-character short description, an
  outdated `Tested up to`, and a plugin-name mismatch between readme and
  header.
- Fixed since that audit: the licence rules (any `License` value used to
  pass; now Plugin Check's `invalid_license`, `plugin_header_invalid_license`
  and `license_mismatch` fail the check, and a missing header `License`
  fails it), and `License URI` is no longer treated as required.
- Fixed in PR #19370: `Stable tag: trunk` now fails, as Plugin Check errors on it.

## Privacy

Everything runs locally. The browser tool reads files with the File API and
never uploads them. The CLI never makes a network call. The only thing
stored is an anonymous local count (`localStorage`, browser only) of which
features were used and the day -- no file names, no file contents, no
account, no tracking cookies, no analytics vendor, honouring Do Not Track and
Global Privacy Control automatically. Turn it off with the checkbox in the
page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not legal or security advice, and it does not replace
wordpress.org's own review process. You are responsible for reviewing and
verifying its output before relying on it, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency -- it's a script you run yourself.

Not affiliated with, endorsed by, or sponsored by the WordPress Foundation,
Automattic Inc., or WordPress.org. WordPress® is a registered trademark of
the WordPress Foundation, named here only to describe what this tool checks.

## Who this is for

Independent and small-team WordPress plugin developers preparing a first
submission or a version update for the wordpress.org Plugin Directory --
searching things like "wordpress plugin stable tag mismatch", "readme.txt
stable tag not updating", "wordpress plugin nonce verification missing", or
"wordpress plugin unescaped output security" after a review note, or before
one. The real, active places this audience already discusses exactly these
problems: r/WordPress and r/ProWordPress on Reddit, the wordpress.org
support forums' own "Plugins and Themes" / developer sections, the
Advanced WordPress Facebook group, and WPTavern's comment threads on
plugin-review posts.

## License

[FSL-1.1-MIT](LICENSE). Free to use and source available --
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/wordpress-plugin-review-check && node --test
```

Assertions across the detection/parsing logic (`scan.test.mjs`), the CLI's
file-walking and reporting (`check.test.mjs`), the usage counter
(`usage.test.mjs`), and both pages' structure and disclaimers
(`page.test.mjs`).
