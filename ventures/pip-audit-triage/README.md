# pip-audit Triage

`pip-audit` lists every vulnerable package in an environment, with no severity
and no way to tell whether your code imports it. This tool takes
`pip-audit -f json` plus your Python source and ranks the findings by
reachability:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pip-audit-triage/

| bucket | meaning |
| --- | --- |
| `imported` | runtime code imports the vulnerable package |
| `test-only` | only tests, docs, `conftest.py`, `noxfile.py` or scripts import it |
| `not-referenced` | nothing scanned imports it (it may still be a dependency of something that is) |

Distribution names are mapped to import names (`PyYAML` -> `yaml`, `Pillow` ->
`PIL`, `scikit-learn` -> `sklearn`, ...), names are PEP 503 normalised, and
`import`, `from ... import`, `importlib.import_module("x")` and `__import__("x")`
are read. Comments and docstrings are ignored. More advisories on one package
rank it a little higher.

[`index.html`](index.html) runs it in a browser: paste the audit JSON and source.
Nothing is uploaded and the page makes no network requests.
[`how-to-triage-pip-audit-findings.html`](how-to-triage-pip-audit-findings.html)
is the order of operations for acting on the result.

## CLI / CI gate

```
pip-audit -f json | node pip-audit-triage.mjs - src
pip-audit -f json | node pip-audit-triage.mjs - src --fail-on-imported   # exit 1 if a runtime-imported package is vulnerable
node pip-audit-triage.mjs audit.json . --json
```

Exit 1 = an imported vulnerable package (with `--fail-on-imported`); exit 2 =
unreadable input. Node 18+, no dependencies. `.venv`, `site-packages`, `.git`,
`__pycache__`, `build` and `dist` are skipped.

## Limits

A static text scan. It cannot see computed imports, plugin entry points, the
dependency graph (a package reached only through another package is reported
`not-referenced`), or whether the vulnerable function is called. The alias table
is incomplete: an unlisted distribution whose import name differs from its
install name will read as `not-referenced`. "Not imported" lowers urgency; it is
not proof of safety. Not a security audit or advice. No warranty.

MIT licence. Sponsor: https://github.com/sponsors/Duncan-Haywood
