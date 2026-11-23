"""Builds tiny projects with real backends to check what this checker says they do.

    python -m venv v && v/bin/pip install setuptools hatchling flit_core
    v/bin/python eval/backend_claims.py > eval/backend-claims.json

For each case and backend: "error" (the build stopped, first line of the message),
"warning" (built, with a deprecation or warning line on stderr) or "ok".
"""
import json, os, subprocess, sys, tempfile, importlib.metadata as md

BASE = 'name = "demo"\nversion = "1.0"\ndescription = "Demo."\n'  # flit_core requires a description
CASES = {
    "license-classifier-conflict": 'license = "MIT"\nclassifiers = ["License :: OSI Approved :: MIT License"]\n',
    "license-table-deprecated": 'license = { text = "MIT" }\n',
    "unknown-project-key": 'homepage = "https://example.org"\n',
    "dynamic-and-static": 'dynamic = ["version"]\n',
    "description-multiline": None,  # replaces the description
    "flit-no-description": None,  # no description at all
    "authors-comma": 'authors = [{ name = "Ada, Bob", email = "ada@example.org" }]\n',
    "authors-email": 'authors = [{ name = "Ada", email = "ada@example" }]\n',
    "readme-extension": 'readme = "README.txt"\n',
    "readme-content-type-missing": 'readme = { file = "README.md" }\n',
    "license-files-no-match": 'license = "MIT"\nlicense-files = ["NOPE*"]\n',
    "license-expression-invalid": 'license = "MIT License"\n',
    "license-files-with-table": 'license = { text = "MIT" }\nlicense-files = ["LICENSE"]\n',
    "requires-python-invalid": 'requires-python = "^3.8"\n',
    "classifier-unknown": 'classifiers = ["Topic :: Nope :: Nope"]\n',
    "version-invalid": None,  # replaces the version
    "control-ok": "",
}
TAIL = {"entry-points-scripts": '[project.entry-points.console_scripts]\nx = "demo:main"\n'}

BACKENDS = {
    "setuptools": ('["setuptools"]', "setuptools.build_meta", "prepare_metadata_for_build_wheel"),
    "hatchling": ('["hatchling"]', "hatchling.build", "build_wheel"),
    "flit_core": ('["flit_core"]', "flit_core.buildapi", "prepare_metadata_for_build_wheel"),
}
RUN = """
import sys, importlib, os
mod = importlib.import_module(sys.argv[1])
out = sys.argv[3]
getattr(mod, sys.argv[2])(out)
"""

def run(backend, project_text, tail=""):
    req, mod, hook = BACKENDS[backend]
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "pyproject.toml"), "w") as f:
            f.write(f'[build-system]\nrequires = {req}\nbuild-backend = "{mod}"\n\n[project]\n{project_text}{tail}')
        for name, body in {"README.md": "# demo\n", "README.txt": "demo\n", "LICENSE": "MIT\n", "demo.py": '"""Demo."""\n__version__ = "1.0"\ndef main(): pass\n'}.items():
            with open(os.path.join(d, name), "w") as f:
                f.write(body)
        os.makedirs(os.path.join(d, "out"))
        p = subprocess.run([sys.executable, "-c", RUN, mod, hook, os.path.join(d, "out")], cwd=d, capture_output=True, text=True)
        err = [l for l in p.stderr.splitlines() if l.strip()]
        if p.returncode:
            msg = next((l for l in reversed(err) if "Error" in l or "error" in l), err[-1] if err else "")
            return {"result": "error", "message": msg.strip()[:300]}
        warn = [l.strip() for l in err if "arning" in l or "deprecat" in l.lower()]
        return {"result": "warning" if warn else "ok", "message": (warn[0][:300] if warn else "")}

results = {"versions": {b: md.version(b if b != "flit_core" else "flit_core") for b in BACKENDS}, "cases": {}}
for case, extra in CASES.items():
    text = {
        "version-invalid": 'name = "demo"\nversion = "v1.0-final-x"\ndescription = "Demo."\n',
        "description-multiline": 'name = "demo"\nversion = "1.0"\ndescription = "one\\ntwo"\n',
        "flit-no-description": 'name = "demo"\nversion = "1.0"\n',
    }.get(case) or BASE + extra
    results["cases"][case] = {b: run(b, text) for b in BACKENDS}
for case, tail in TAIL.items():
    results["cases"][case] = {b: run(b, BASE, "\n" + tail) for b in BACKENDS}
json.dump(results, sys.stdout, indent=1)
print()
