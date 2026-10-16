# Lockfile License Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/lockfile-license-check/>

A free tool that reads an npm `package-lock.json` and lists every dependency
licence, worst first: strong-copyleft (GPL, AGPL, SSPL), unlicensed, weak-copyleft
(LGPL, MPL, EPL), unknown, then permissive. SPDX `OR` expressions score the most
permissive choice, `AND` the strictest.

[`index.html`](index.html) runs it in a browser: paste the lockfile, optionally a
deny list, read the table. Nothing is uploaded and the page makes no network
requests. [`npm-license-compliance-guide.html`](npm-license-compliance-guide.html)
is a checklist for acting on the result.

## CLI / CI gate

```
node license-check.mjs                                   # ./package-lock.json
node license-check.mjs --deny GPL-3.0-only,AGPL-3.0-only # exit 1 if any appear
node license-check.mjs --fail-on copyleft --no-dev       # exit 1 on strong copyleft / unlicensed
node license-check.mjs --json
```

`--fail-on` accepts `copyleft`, `unknown` (copyleft + unknown) or `any`. Exit 2
means the file could not be read or parsed. Node 18+, no dependencies; the only
file it reads is the lockfile you name.

## Limits

It reads the `license` field package authors declared. It does not read LICENSE
files, detect copied code, or see licences npm did not record; lockfileVersion 1
records none. Not legal advice. No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
