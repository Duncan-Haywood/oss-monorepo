# Android Data Safety Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/android-data-safety-check/>

Two free, related checkers for Android developers preparing a Google Play
submission, sharing one venture, one license, and one usage counter -- see
[Target API level checker](#target-api-level-checker) below for the second.

## Data safety checker

A free tool for Android developers: scans your `AndroidManifest.xml`
permissions and Gradle dependencies for known SDKs, maps each one to a
**Google Play Data safety** category, and checks it against a plain list of
what you say you've already declared in Play Console's **App content > Data
safety** form. It names the exact permission or SDK, file, and line behind a
category your app looks like it collects but your declaration doesn't
mention -- the most common cause of a Play Console policy warning or a
listing pulled for an inaccurate disclosure.

After using this, you can find the missing Data safety declaration before you
publish, which used to mean either guessing from Google's documentation or
finding out from a policy warning (or a removed listing) after the fact.

Two ways to run it, sharing the same detection logic (`scan.mjs`):

## Browser

Open `index.html`. Select your `AndroidManifest.xml` and
`build.gradle`/`build.gradle.kts` files with the file picker, tick the
categories you've already declared in Play Console, and click **Compare**.
Nothing is uploaded -- the files are read locally with the File API.

## CLI

```
node check.mjs [path] [--declared <file>] [--json]
node check.mjs --list-categories
```

Defaults to the current directory, recursing into it while skipping
`.git/`, `.gradle/`, `.idea/`, `build/`, `node_modules/`, `captures/`, `.cxx/`
and dotfiles/dotdirs. `--declared <file>` reads a plain text file, one
category id per line (`--list-categories` prints the ids), blank lines and
`#` comments ignored -- this is **not** a Google file format; Play Console
has no public bulk-export schema this tool reads from, so it is a list you
maintain yourself, mirroring what you've already ticked in the Data safety
form. Exits `0` when every detected category is in your declared list and a
declared list was given, `1` otherwise -- usable directly as a CI gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your data
- run: node check.mjs . --declared data-safety-declared.txt
```

## What this is, and isn't

**Evidence, not a determination.** This is pattern-matching against known
Android permission names and Gradle dependency coordinates in the project
you point it at. It cannot see what a permission is actually used for,
dynamically loaded code, a Gradle version-catalog alias unresolved to its
real coordinate, or a compiled third-party library's real runtime behaviour
-- and Google can change its Data safety categories, or a listed SDK's
practices, at any time. A clean report is not a guarantee Play Console will
accept your submission -- verify against
[Google Play's current Data safety documentation](https://support.google.com/googleplay/android-developer/answer/10787469)
before you publish, and decide the actual collection purpose and sharing
status yourself; this tool never picks on your behalf.

The permission-to-category mapping and the known-SDK list in `scan.mjs` are
reproduced from Android's own permission groups, Google Play's public Data
safety data-type list, and each named SDK's own published privacy
documentation, as of 2026-09. They are data, not advice, and they are
deliberately not exhaustive: a permission or SDK with no clear one-to-one
category, or one this list doesn't yet recognise, is simply not flagged --
silence here is a gap in this list, not a clean bill of health.

## Target API level checker

A second free tool, same venture: reads your `AndroidManifest.xml` or Gradle
`targetSdkVersion`/`targetSdk` declaration and checks it against **Google
Play's target API level requirement** -- a different Play Console gate than
Data safety. Google requires an app to target a minimum API level per form
factor (phone/tablet, Wear OS, Android TV, Android XR, Android Automotive
OS) by a published deadline; an app below the floor for its form factor is
not removed, but stops being visible to and installable by new users on a
device running a newer Android version than it targets.

After using this, you can find out before a release whether your app is
about to lose visibility to new users on newer devices, which used to mean
either tracking the deadline by hand or finding out from a Play Console
warning after the fact.

### Browser

Open `target-api-level.html`. Select your `AndroidManifest.xml` and/or
`build.gradle`/`build.gradle.kts` files, pick your form factor, and click
**Check**. Nothing is uploaded.

### CLI

```
node target-sdk-check.mjs [path] [--form-factor <id>] [--json]
node target-sdk-check.mjs --list-form-factors
```

Exits `0` when the highest declared `targetSdkVersion` meets the
existing-app-update floor for the chosen form factor, `1` otherwise --
usable as a CI gate the same way as `check.mjs` above.

**Evidence, not a determination.** The deadline table in
`target-sdk-scan.mjs` is reproduced from
[Google's own target API level requirement page](https://developer.android.com/google/play/requirements/target-sdk)
as fetched 2026-09-23. Google revises these numbers and dates on its own
schedule, and an extension requested in Play Console is not visible to this
tool -- verify against the live page and your own Play Console before
relying on this for a release decision. A variable or version-catalog
reference (`targetSdk = libs.versions.targetSdk.get()`) is reported as
unresolved rather than guessed, the same principle as the Data safety
checker's Gradle-alias caveat above.

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
or implied. It is not legal advice, and it does not replace Google Play's own
policy review process. You are responsible for reviewing and verifying its
output before relying on it, and for meeting any obligation it helps you
prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency -- it's a script you run yourself.

Not affiliated with, endorsed by, or sponsored by Google LLC. Google Play,
Play Console, Android, and Data safety are trademarks of Google LLC, named
here only to describe what this tool checks.

## License

[MIT](LICENSE). Free and open source --
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/android-data-safety-check && node --test
```

Assertions across the detection/parsing logic (`scan.test.mjs`), the CLI's
file-walking and reporting (`check.test.mjs`), the usage counter
(`usage.test.mjs`), and the page's structure and disclaimers
(`page.test.mjs`) for the Data safety checker; and the target API level
detection logic (`target-sdk-scan.test.mjs`), its CLI
(`target-sdk-check.test.mjs`), and its page (`target-api-level.test.mjs`)
for the second tool.
