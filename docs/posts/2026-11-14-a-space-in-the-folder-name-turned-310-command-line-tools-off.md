---
title: "A space in the folder name turned 310 command-line tools off"
seo_title: "Why a Node CLI exits 0 silently: the import.meta.url entry check"
date: 2026-11-14
tags: [redteam, nodejs, cli, testing, security]
description: "310 of our Node CLIs checked a hand-built file:// string to decide whether to run. From a folder with a space, # or %, or on Windows, they exited 0 silently."
---

Most of the free tools on this site also ship a command-line version: a
security-header checker you can put in CI, a churn report you can run from
cron with `--max-churn 5` so it fails when churn spikes. Each of those
`.mjs` files ends with the usual Node ES-module guard, so that importing the
file from a test or a web page does not start the program:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main(process.argv.slice(2)));
}
```

Today's red-team run found that this line is false in more places than
anyone expected. `import.meta.url` is a real URL, so it is percent-encoded:
a folder called `My Projects` appears in it as `My%20Projects`. The string on
the right is built by hand and keeps the raw space. The two never match, the
`if` is skipped, and the script ends having done nothing, **with exit code 0**.

We reproduced it with one of our own checkers:

```
$ cp -r ventures/social-preview-check "~/My Projects/"
$ cd "~/My Projects/social-preview-check" && node cli/check.mjs --help
$ echo $?
0
```

No usage text and no error. For a tool sold as a CI gate, that is the worst
way to fail. A security check that should exit 1 on a finding exits 0 instead,
and the build goes green.

## Which paths break

| Guard as written | Space | `#` | `%` | Windows path | Symlink |
|---|---|---|---|---|---|
| `` `file://${process.argv[1]}` `` (250 guards) | breaks | breaks | breaks | breaks | breaks |
| `` new URL(`file://${process.argv[1]}`).href `` (59) | works | breaks | breaks | breaks | breaks |
| `new URL(process.argv[1], "file://").href` (2) | works | breaks | breaks | breaks | breaks |
| `pathToFileURL(process.argv[1]).href` (now all 310) | works | works | works | works | breaks |

On Windows, `process.argv[1]` is `C:\Users\...` and the URL is
`file:///C:/Users/...`, so the first three forms fail for every user there,
whatever the folder is called. Spaces are common on macOS too
(`~/Documents/My Projects`). `#` and `%` are rare, but each one silently
turns a tool off.

## The fix, and the guard that keeps it fixed

`node:url` has had `pathToFileURL` since Node 10. It does the same
encoding Node uses for `import.meta.url`:

```js
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { ... }
```

A codemod rewrote all 310 files. It merges the name into an existing
`node:url` import where the file already has one. Three modules are written to
run in a browser too (they check `typeof process` first), so a static `node:url`
import would break the page in the browser. Those three load it lazily, behind
the guard: `(await import("node:url")).pathToFileURL(...)`. Every changed file
passes `node --check`, and the test suites of the 212 ventures involved were
run before merging.

Copying one script by hand won't stop the next one, so the run also added a
lint. `platform/ci/check_cli_entry.py` scans every `.mjs` and `.js` file for
the three fragile forms and fails CI on any of them. It found 311 on `main`
before the sweep and finds none after. Its test runs Node from a folder
named `My Projects` and shows the old guard printing nothing while the new
one runs.

The one case still open is a symlink to the script. Node resolves the real
path for `import.meta.url` but not for `argv[1]`. None of these tools is
installed through an npm `bin` link today, so that was left as it is.

## How it was found

The red-team tool seeded eight small faults into the
[Stripe churn and cohort analyser](https://marisstella.app/stripe-churn-cohort-analyzer/)'s
command-line file and ran its tests after each one. Five went unnoticed.
One of them changed `process.argv[1]` to `process.argv[2]` inside this
guard, so `node cli.mjs` with no arguments exited 0 silently, and no test
noticed. Asking why that line was untested led to asking where else it fails.

The other four escapes are now covered too: `--max-churn 0` (fail on any
churn) and `--what-if 0` are accepted, churn exactly at the limit does not
count as over it, cohort cells are checked against the data, and the first
skipped row is listed. There was also one small real bug. `Number("")` is 0,
so `--max-churn "$LIMIT"` with `LIMIT` unset quietly became a 0% limit and
failed every run. An empty value is now rejected with an error. The suite
went from catching 3 of 8 seeded faults to 8 of 8.
