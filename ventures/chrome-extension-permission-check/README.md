# Chrome Extension Permission Checker

A free tool for Chrome/Edge extension developers: scans your JavaScript/TypeScript
source for **`chrome.*` API usage** and cross-checks it against your
`manifest.json`'s declared `permissions`, `optional_permissions`, and
`host_permissions`. It names the exact permission behind the two problems that
matter here:

- **Declared, not used** -- a permission sits in the manifest with no matching
  API call anywhere in the source you point it at. This is what Chrome Web
  Store's own troubleshooting documentation calls the single most common
  review rejection reason ("**Purple Potassium**": excessive or unused
  permissions).
- **Used, not declared** -- code calls a `chrome.*` API whose permission was
  never added to the manifest. This fails at **runtime**, independent of
  review.

It also flags a broad, all-sites `host_permissions` pattern (`<all_urls>`,
`*://*/*`) -- review asks for a specific justification for those too.

After using this, you can find the exact permission to remove, scope, or move
to `optional_permissions` before you submit -- instead of guessing from
Chrome's documentation or waiting for review to reject the build and tell you.

Two ways to run it, sharing the same detection logic (`scan.mjs`):

## Browser

Open `index.html`. Select your `.js`/`.mjs`/`.cjs`/`.ts`/`.tsx`/`.jsx` source
files and your `manifest.json` with the file picker (Cmd/Ctrl-click, or
select-all in the project folder) and click **Check permissions**. Nothing is
uploaded -- the files are read locally with the File API.

## CLI

```
node check.mjs [path] [--manifest <file>] [--json]
```

Defaults to the current directory, recursing into it while skipping
`node_modules/`, `dist/`, `build/`, `out/`, `coverage/`, `.output/`, `vendor/`,
and dotfiles/dotdirs. Finds every `manifest.json` in the tree (reads the
first; `--manifest` overrides which one). Exits `0` when a manifest was
found, every declared required permission with a checkable signature is
actually used, no detected API call is missing its permission, and no host
permission is a broad all-sites pattern; `1` otherwise -- usable directly as
a CI gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your data
- run: node check.mjs .
```

## What this is, and isn't

**Evidence, not a determination.** This is pattern-matching against known
`chrome.<namespace>.` symbol names (and a couple of web APIs -- clipboard,
geolocation) in the source you point it at. It cannot see a permission used
only inside a bundled third-party library's minified code, a dynamically
imported module, or reflection, and Chrome can add or rename permissions at
any time. A clean report is not a guarantee Chrome Web Store review will
pass -- verify against
[Chrome's current documentation](https://developer.chrome.com/docs/webstore/troubleshooting)
before you submit.

**Not every permission has a checkable code signature.** `activeTab`,
`background`, and `unlimitedStorage` change what another API is allowed to
do, or relax a limit, rather than opening a namespace of their own -- they
are listed separately as "declared, not automatically checkable" and are
never flagged as unused. A declared permission this tool has no mapping for
at all (mostly ChromeOS/enterprise-only ones) is named explicitly rather
than silently dropped or wrongly accused.

The permission-to-API map in `scan.mjs` is reproduced from Google's public
Chrome Extensions documentation as of 2026-09. It is data, not advice, and it
can go stale if Chrome changes the list.

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
or implied. It is not legal advice, and it does not replace Chrome Web
Store's own review process. You are responsible for reviewing and verifying
its output before relying on it, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency -- it's a script you run yourself.

Not affiliated with, endorsed by, or sponsored by Google LLC. Chrome, Chrome
Web Store, and Manifest V3 are trademarks of Google LLC, named here only to
describe what this tool checks.

## License

[MIT](LICENSE). Free and open source --
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/chrome-extension-permission-check && node --test
```

Assertions across the detection/parsing logic (`scan.test.mjs`), the CLI's
file-walking and reporting (`check.test.mjs`), the usage counter
(`usage.test.mjs`), and both pages' structure and disclaimers
(`page.test.mjs`).
