# Requirements Pin Check

A free tool that reads a Python `requirements.txt` and lists every line that lets
two installs differ or exposes the install to tampering: bare package names,
range versions, a second `--extra-index-url` (dependency confusion), plain-http
sources, unpinned git or URL dependencies, editable installs, duplicates and,
optionally, exact pins with no `--hash`.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/requirements-pin-check/

[`index.html`](index.html) runs it in a browser: paste the file, read the table.
Nothing is uploaded and the page makes no network requests.
[`pin-python-dependencies-guide.html`](pin-python-dependencies-guide.html) is a
checklist for fixing what it finds (pip-tools, uv, `--require-hashes`).

## CLI / CI gate

```
node requirements-check.mjs                         # ./requirements.txt
node requirements-check.mjs --fail-on high          # exit 1 on index/source/VCS risks
node requirements-check.mjs --fail-on medium        # ...and unpinned versions
node requirements-check.mjs --require-hashes --fail-on any
node requirements-check.mjs --json
```

Exit 2 means the file could not be read or held no requirements. Node 18+, no
dependencies; the only file it reads is the one you name.

## Limits

A line scan, not pip's resolver. It does not follow `-r` includes, read
transitive dependencies, or look up vulnerabilities, so a fully pinned file can
still contain a vulnerable release. Not security advice. No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
