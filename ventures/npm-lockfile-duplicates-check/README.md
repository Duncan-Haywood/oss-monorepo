# npm Lockfile Duplicates Check

A free tool that reads an npm `package-lock.json` and lists every package installed
at more than one version, who requires each copy, and the likely fix. **Same-major**
copies (2.0.0 and 2.1.3) come first because `npm dedupe` can usually collapse them;
**cross-major** copies (3.9.0 and 4.3.4) follow with an `overrides` suggestion.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/npm-lockfile-duplicates-check/

[`index.html`](index.html) runs it in a browser: paste the lockfile, read the table.
Nothing is uploaded and the page makes no network requests.
[`duplicate-packages-npm-guide.html`](duplicate-packages-npm-guide.html) is a checklist.

## CLI / CI gate

```
node dupes-check.mjs                          # ./package-lock.json
node dupes-check.mjs --max 25                 # exit 1 if more than 25 packages are duplicated
node dupes-check.mjs --max-same-major 0       # exit 1 if npm dedupe would still remove something
node dupes-check.mjs --ignore react --no-dev --json
```

Exit 2 means the file could not be read or parsed. Node 18+, no dependencies; the
only file it reads is the lockfile you name.

## Limits

A lockfile records versions, not sizes, so this counts copies and does not measure
bytes. Some duplicates are harmless. Review the list; it is not a finding that
anything is broken. No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
