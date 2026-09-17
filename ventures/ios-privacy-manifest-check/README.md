# iOS Privacy Manifest Checker

A free tool for iOS/macOS developers: scans your Swift and Objective-C source
for Apple's **Required Reason API** usage and cross-checks it against your
`PrivacyInfo.xcprivacy` manifest. It names the exact category, file, and line
behind the two most common App Store Connect rejections for this:

- **ITMS-91061** ("Missing privacy manifest") -- your code uses a Required
  Reason API and no manifest entry declares it.
- **ITMS-91055** ("Invalid API reason declaration") -- your manifest declares
  a reason code that Apple doesn't recognise for that category, often because
  a code was copy-pasted from the wrong category's example.

After using this, you can find the missing or wrong manifest entry before you
submit, which used to mean either guessing from Apple's documentation or
waiting for App Review to reject the build and tell you.

Two ways to run it, sharing the same detection logic (`scan.mjs`):

## Browser

Open `index.html`. Select your `.swift`/`.m`/`.mm`/`.h` files and your
`PrivacyInfo.xcprivacy` with the file picker (Cmd/Ctrl-click, or select-all in
the project folder) and click **Check for undeclared APIs**. Nothing is
uploaded -- the files are read locally with the File API.

## CLI

```
node check.mjs [path] [--manifest <file>] [--json]
```

Defaults to the current directory, recursing into it while skipping
`Pods/`, `Carthage/`, `.build/`, `DerivedData/`, `.xcodeproj`/`.xcworkspace`
bundles, and dotfiles/dotdirs. Finds every `PrivacyInfo.xcprivacy` in the
tree (reads the first; `--manifest` overrides which one). Exits `0` when
every detected category is declared with a recognised reason code, `1`
otherwise -- usable directly as a CI gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your data
- run: node check.mjs .
```

## What this is, and isn't

**Evidence, not a determination.** This is pattern-matching against known API
symbol names in the source you point it at. It cannot see reflection,
dynamically loaded code, or the internals of a third-party SDK's compiled
binary, and Apple can add categories or reason codes at any time. A clean
report is not a guarantee App Review will pass -- verify against
[Apple's current documentation](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api)
before you submit, and pick the reason code that actually matches *why* your
code uses the API; this tool lists the valid choices per category but never
picks on your behalf, since only you know the real justification.

The category IDs and reason codes in `scan.mjs` are reproduced from Apple's
public developer documentation as of 2026-09 and cross-checked against three
independent sources. They are data, not advice, and they can go stale if
Apple changes the list.

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
or implied. It is not legal advice, and it does not replace Apple's own
review process. You are responsible for reviewing and verifying its output
before relying on it, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency -- it's a script you run yourself.

Not affiliated with, endorsed by, or sponsored by Apple Inc. Apple, Xcode,
App Store, and PrivacyInfo.xcprivacy are trademarks of Apple Inc., named here
only to describe what this tool checks.

## License

[MIT](LICENSE). Free and open source --
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/ios-privacy-manifest-check && node --test
```

39 assertions across the detection/parsing logic (`scan.test.mjs`), the CLI's
file-walking and reporting (`check.test.mjs`), the usage counter
(`usage.test.mjs`), and the page's structure and disclaimers
(`page.test.mjs`).
