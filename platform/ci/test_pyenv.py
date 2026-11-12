"""Tests for pyenv.py with a fake subprocess runner."""
import os
import stat
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

import pyenv


class Result:
    def __init__(self, code):
        self.returncode = code


class FakeRun:
    """Interpreters in `has` import anything; pip on `pip_ok` adds them to `has`."""

    def __init__(self, has=(), pip_ok=(), apt_gives=()):
        self.has, self.pip_ok, self.apt_gives, self.calls = set(has), set(pip_ok), set(apt_gives), []

    def __call__(self, cmd, **kw):
        self.calls.append(cmd)
        if cmd[0] == "apt-get":
            if cmd[1] == "install":
                self.has |= self.apt_gives
            return Result(0 if self.apt_gives or cmd[1] == "update" else 100)
        if cmd[1] == "-c":
            return Result(0 if cmd[0] in self.has else 1)
        if cmd[1:3] == ["-m", "pip"]:
            if cmd[0] in self.pip_ok:
                self.has.add(cmd[0])
                return Result(0)
            return Result(1)
        raise AssertionError(cmd)


quiet = lambda m: None


class T(unittest.TestCase):
    def test_prefers_one_that_already_imports(self):
        run = FakeRun(has={"/usr/bin/python3"})
        self.assertEqual(pyenv.find(["pytest"], ["/usr/local/bin/python3", "/usr/bin/python3"], run, quiet),
                         "/usr/bin/python3")
        self.assertFalse(any("pip" in c for c in run.calls))

    def test_pip_installs_into_the_interpreter_it_returns(self):
        run = FakeRun(pip_ok={"/usr/local/bin/python3"})
        py = pyenv.find(["pytest"], ["/usr/local/bin/python3", "/usr/bin/python3"], run, quiet)
        self.assertEqual(py, "/usr/local/bin/python3")
        pip = [c for c in run.calls if c[1:3] == ["-m", "pip"]]
        self.assertEqual(pip[0][0], py)

    def test_trying_line_names_pip_packages_not_import_names(self):
        logs = []
        pyenv.find(["cv2"], ["/usr/bin/python3"], FakeRun(pip_ok={"/usr/bin/python3"}), logs.append)
        trying = [m for m in logs if "trying" in m]
        self.assertIn("opencv-python-headless", trying[0])
        self.assertNotIn(" cv2", trying[0])

    def test_install_notice_mentions_background(self):
        logs = []
        pyenv.find(["pytest"], ["/usr/bin/python3"], FakeRun(pip_ok={"/usr/bin/python3"}), logs.append)
        self.assertTrue(any("run_in_background" in m for m in logs))

    def test_apt_result_found_on_another_interpreter(self):
        # the 2026-10-16 case: pip fails everywhere, apt installs for /usr/bin/python3 only
        run = FakeRun(apt_gives={"/usr/bin/python3"})
        orig = pyenv.shutil.which
        pyenv.shutil.which = lambda name, path=None: "/usr/bin/apt-get" if name == "apt-get" else orig(name, path=path)
        try:
            py = pyenv.find(["numpy"], ["/usr/local/bin/python3", "/usr/bin/python3"], run, quiet)
        finally:
            pyenv.shutil.which = orig
        self.assertEqual(py, "/usr/bin/python3")
        self.assertIn(["apt-get", "install", "-y", "-qq", "--no-install-recommends", "python3-numpy"], run.calls)

    def test_venv_fallback_when_system_pip_fails(self):
        with tempfile.TemporaryDirectory() as d:
            venv = os.path.join(d, "v")
            vpy = os.path.join(venv, "bin", "python")
            run = FakeRun()
            inner = run.__call__

            def wrapped(cmd, **kw):
                if cmd[1:3] == ["-m", "venv"]:
                    os.makedirs(os.path.dirname(vpy))
                    Path(vpy).write_text("")
                    run.pip_ok.add(vpy)
                    return Result(0)
                return inner(cmd, **kw)

            orig = pyenv.shutil.which
            pyenv.shutil.which = lambda name, path=None: None if name == "apt-get" else orig(name, path=path)
            try:
                self.assertEqual(pyenv.find(["skfem"], ["/a/python3"], wrapped, quiet, venv_dir=venv), vpy)
            finally:
                pyenv.shutil.which = orig

    def test_none_when_nothing_works(self):
        run = FakeRun()
        orig = pyenv.shutil.which
        pyenv.shutil.which = lambda name, path=None: None if name == "apt-get" else orig(name, path=path)
        try:
            self.assertIsNone(pyenv.find(["pytest"], ["/a/python3"], run, quiet))
        finally:
            pyenv.shutil.which = orig

    def test_heavy_packages_get_a_longer_pip_timeout(self):
        os.environ.pop("PYENV_PIP_TIMEOUT", None)
        self.assertEqual(pyenv.pip_timeout(["numpy"]), 300)
        self.assertEqual(pyenv.pip_timeout(["torch", "numpy"]), 1800)
        os.environ["PYENV_PIP_TIMEOUT"] = "42"
        try:
            self.assertEqual(pyenv.pip_timeout(["torch"]), 42)
        finally:
            del os.environ["PYENV_PIP_TIMEOUT"]

    def test_package_names(self):
        run = FakeRun(pip_ok={"/p/python3"})
        pyenv.find(["sklearn", "yaml"], ["/p/python3"], run, quiet)
        pip = [c for c in run.calls if c[1:3] == ["-m", "pip"]][0]
        self.assertEqual(pip[-2:], ["scikit-learn", "pyyaml"])

    def test_import_names_map_to_pip_names(self):
        run = FakeRun(pip_ok={"/p/python3"})
        pyenv.find(["skfem", "bs4"], ["/p/python3"], run, quiet)
        pip = [c for c in run.calls if c[1:3] == ["-m", "pip"]][0]
        self.assertEqual(pip[-2:], ["scikit-fem", "beautifulsoup4"])

    def test_pip_failure_is_logged(self):
        class Run(FakeRun):
            def __call__(self, cmd, **kw):
                r = super().__call__(cmd, **kw)
                if cmd[1:3] == ["-m", "pip"]:
                    r.stderr = b"x\nERROR: no matching distribution"
                return r
        seen = []
        pyenv.find(["nope"], ["/p/python3"], Run(), seen.append)
        self.assertTrue(any("no matching distribution" in m for m in seen), seen)

    def test_torch_installs_from_the_cpu_index(self):
        run = FakeRun()
        pyenv.pip_install("/p/python3", ["torch", "numpy"], run, quiet, lambda: True)
        pip = [c for c in run.calls if c[1:3] == ["-m", "pip"]][0]
        self.assertIn(pyenv.TORCH_CPU_INDEX, pip)
        run = FakeRun()
        pyenv.pip_install("/p/python3", ["numpy"], run, quiet)
        self.assertNotIn("--extra-index-url", [c for c in run.calls if c[1:3] == ["-m", "pip"]][0])

    def test_unreachable_cpu_index_is_warned_about(self):
        seen = []
        pyenv.pip_install("/p/python3", ["torch"], FakeRun(), seen.append, lambda: False)
        self.assertTrue(any("unreachable" in m for m in seen), seen)
        seen = []
        pyenv.pip_install("/p/python3", ["torch"], FakeRun(), seen.append, lambda: True)
        self.assertFalse(any("unreachable" in m for m in seen), seen)

    def test_distro_owned_package_stops_retrying_pip_flags(self):
        class Run(FakeRun):
            def __call__(self, cmd, **kw):
                r = super().__call__(cmd, **kw)
                if cmd[1:3] == ["-m", "pip"]:
                    r.stderr = b"ERROR: Cannot uninstall packaging 24.0, RECORD file not found. Hint: The package was installed by debian."
                return r
        run = Run()
        pyenv.pip_install("/p/python3", ["numpy"], run, quiet)
        self.assertEqual(len([c for c in run.calls if c[1:3] == ["-m", "pip"]]), 1)

    def test_candidates_dedupes_and_skips_config(self):
        with tempfile.TemporaryDirectory() as d:
            for name in ("python3", "python3.11", "python3.11-config", "python3-foo"):
                p = Path(d, name)
                p.write_text("#!/bin/sh\n")
                p.chmod(p.stat().st_mode | stat.S_IEXEC)
            os.symlink(Path(d, "python3.11"), Path(d, "python3.99"))
            got = pyenv.candidates(path=d, extra_globs=(os.path.join(d, "python3*"),))
            names = [os.path.basename(p) for p in got if os.path.dirname(p) == d]
        self.assertEqual(names[0], "python3")
        self.assertNotIn("python3.11-config", names)
        self.assertNotIn("python3-foo", names)
        self.assertEqual(len([n for n in names if n in ("python3.11", "python3.99")]), 1)

    def test_candidates_skips_non_executable_file(self):
        with tempfile.TemporaryDirectory() as d:
            plain = Path(d) / "python3.9"
            plain.write_text("")
            plain.chmod(0o644)
            good = Path(d) / "python3.8"
            good.write_text("")
            good.chmod(0o755)
            found = pyenv.candidates(path="", extra_globs=(f"{d}/python3*",))
            self.assertIn(str(good), found)
            self.assertNotIn(str(plain), found)

    def test_apt_update_output_is_captured(self):
        seen = []

        def run(cmd, **kw):
            seen.append((cmd[1], kw.get("capture_output")))
            return Result(0)

        orig = pyenv.shutil.which
        pyenv.shutil.which = lambda name, path=None: "/usr/bin/apt-get" if name == "apt-get" else orig(name, path=path)
        try:
            self.assertTrue(pyenv.apt_install(["numpy"], run))
        finally:
            pyenv.shutil.which = orig
        self.assertEqual(seen, [("update", True), ("install", True)])

    def test_venv_rejected_when_pip_succeeds_but_import_still_fails(self):
        with tempfile.TemporaryDirectory() as d:
            vpy = os.path.join(d, "bin", "python")
            os.makedirs(os.path.dirname(vpy))
            Path(vpy).write_text("")

            def run(cmd, **kw):
                return Result(0 if cmd[1:3] == ["-m", "pip"] else 1)

            self.assertIsNone(pyenv.venv_install("/usr/bin/python3", ["numpy"], d, run, quiet))

    def test_main_skips_the_install_lock_when_a_candidate_already_imports(self):
        import fcntl, tempfile, io, contextlib
        with tempfile.TemporaryDirectory() as d:
            venv = os.path.join(d, "venv")
            with open(os.path.join(d, ".pyenv.lock"), "w") as held:
                fcntl.flock(held, fcntl.LOCK_EX)  # another install holds it
                old = os.environ.get("PYENV_VENV")
                os.environ["PYENV_VENV"] = venv
                try:
                    out = io.StringIO()
                    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
                        rc = pyenv.main(["json"])  # would block forever if it waited
                finally:
                    if old is None:
                        os.environ.pop("PYENV_VENV")
                    else:
                        os.environ["PYENV_VENV"] = old
        self.assertEqual(rc, 0)
        self.assertTrue(out.getvalue().strip())

    def test_real_interpreter_imports_stdlib(self):
        self.assertTrue(pyenv.imports(sys.executable, ["json"]))
        self.assertFalse(pyenv.imports(sys.executable, ["no_such_module_xyz"]))

    def test_version_specifiers_are_not_part_of_the_import_name(self):
        self.assertEqual(pyenv.import_name("pillow>=9"), "PIL")
        self.assertEqual(pyenv.import_name("scikit-learn==1.4"), "sklearn")
        self.assertEqual(pyenv.import_name("numpy"), "numpy")

    def test_pip_names_map_to_import_names(self):
        self.assertEqual(pyenv.import_name("scikit-learn"), "sklearn")
        self.assertEqual(pyenv.import_name("pyyaml"), "yaml")
        self.assertEqual(pyenv.import_name("scikit-fem"), "skfem")
        self.assertEqual(pyenv.import_name("numpy"), "numpy")
        self.assertEqual(pyenv.import_name("my-mod"), "my_mod")
        self.assertEqual(pyenv.import_name("OpenDSSDirect.py"), "opendssdirect")
        self.assertEqual(pyenv.PIP_NAMES["opendssdirect"], "OpenDSSDirect.py")
        self.assertEqual(pyenv.import_name("some-pkg:somemod"), "somemod")
        self.assertEqual(pyenv.PIP_NAMES["somemod"], "some-pkg")

    def test_requirements_file_expands(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write("# c\nnumpy==2.4.6\ntorch==2.1  # cpu\n-e .\ncadquery[x]>=2 ; python_version>'3'\n\npytest\n")
        try:
            self.assertEqual(pyenv.read_requirements(f.name), ["numpy", "torch", "cadquery", "pytest"])
            self.assertEqual(pyenv.expand_args(["scipy", "-r", f.name]),
                             ["scipy", "numpy", "torch", "cadquery", "pytest"])
        finally:
            os.unlink(f.name)

    def test_for_dir_lists_third_party_imports_only(self):
        # 2026-11-12: runs named too few modules by hand (numpy, scikit-learn missing)
        with tempfile.TemporaryDirectory() as repo:
            proj = Path(repo, "research", "proj")
            (proj / "pkg").mkdir(parents=True)
            (proj / "pkg" / "__init__.py").write_text("")
            Path(repo, "research", "_shared").mkdir()
            Path(repo, "research", "_shared", "linefig.py").write_text("")
            (proj / "run.py").write_text(
                "import os, json\nimport numpy as np\nfrom sklearn.linear_model import Ridge\n"
                "from . import x\nimport pkg.sub\nfrom linefig import write\n"
                "try:\n    import torch\nexcept ImportError:\n    torch = None\n"
                "def f():\n    import scipy.stats\n")
            (proj / "broken.py").write_text("def (:\n")
            self.assertEqual(pyenv.project_imports(str(proj), stop=repo), ["numpy", "scipy", "sklearn"])

    def test_for_dir_expands_with_pytest_once(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, "t.py").write_text("import pytest\nimport numpy\n")
            with unittest.mock.patch.object(pyenv, "project_imports", return_value=["numpy", "pytest"]):
                self.assertEqual(pyenv.expand_args(["--for", d]), ["pytest", "numpy"])
        self.assertEqual(pyenv.expand_args(["--for", "/no/such/dir"]), ["--for"])

    def test_install_starts_with_the_interpreter_missing_fewest(self):
        # 2026-11-10: pip ran on PATH's python3 and 3.12 for 10+ min while 3.13 lacked one module
        lacks = {"/usr/local/bin/python3": "numpy scipy pytest", "/usr/bin/python3.12": "numpy scipy",
                 "/usr/bin/python3.13": "scipy"}
        calls = []

        def run(cmd, **kw):
            calls.append(cmd)
            if cmd[1] == "-c" and len(cmd) > 3:
                r = Result(0)
                r.stdout = lacks[cmd[0]].encode()
                return r
            if cmd[1] == "-c":
                return Result(0 if not lacks[cmd[0]] else 1)
            if cmd[1:3] == ["-m", "pip"]:
                lacks[cmd[0]] = ""
                return Result(0)
            raise AssertionError(cmd)

        py = pyenv.install(["numpy", "scipy", "pytest"], list(lacks), run, quiet, None)
        self.assertEqual(py, "/usr/bin/python3.13")
        pip = [c for c in calls if c[1:3] == ["-m", "pip"]]
        self.assertEqual(len(pip), 1)
        self.assertEqual(pip[0][-1:], ["scipy"])

    def test_missing_probes_a_real_interpreter(self):
        self.assertEqual(pyenv.missing(sys.executable, ["json", "no_such_module_xyz"]),
                         ["no_such_module_xyz"])

    def test_heartbeat_logs_until_stopped(self):
        logs = []
        stop = pyenv.heartbeat(logs.append, every=0.01)
        import time
        time.sleep(0.1)
        stop.set()
        self.assertTrue(any("still installing" in m for m in logs))


if __name__ == "__main__":
    unittest.main()
