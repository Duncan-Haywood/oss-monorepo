#!/usr/bin/env python3
"""Tests for host_routes_state.py.

The tool exists to stop an owner spending the one session this recovery gets on
something knowable beforehand, so the tests that matter are the ones pinning
where its report must *not* drift:

  - it must read the box, the installer and the preflight tool list out of the
    drivers rather than restating them, because a restated constant is exactly
    how this repository has twice shipped a claim that went quietly wrong when
    the thing it described moved (CLAUDE.md records both);
  - a driver that is absent, or a tool this machine lacks, has to make
    `--require-local-ready` exit non-zero -- a gap that only prints is a gap
    found during the outage;
  - and it must never imply it measured whether a box answers. No session can
    make that request, and a non-reading dressed as a reading is the specific
    failure the whole "MEASURED" correction in CLAUDE.md is about.
"""

import io
import unittest
import unittest.mock
from pathlib import Path

import host_routes_state as hrs


class ReadsFromTheDriversRatherThanRestating(unittest.TestCase):
    """The parse must track the real scripts, not a copy of their values."""

    def test_every_route_parses_its_box_installer_and_tools(self):
        for route in hrs.ROUTES:
            with self.subTest(driver=route.driver):
                facts = route.read()
                self.assertTrue(
                    facts["exists"],
                    f"{route.driver} is missing from bootstrap/scripts -- if it "
                    "was renamed, update ROUTES in the same commit",
                )
                self.assertRegex(
                    facts["box"] or "",
                    r"^\d+\.\d+\.\d+\.\d+$",
                    f"{route.driver}: BOX_IP default did not parse as an address",
                )
                self.assertTrue(
                    (facts["installer"] or "").startswith("install-"),
                    f"{route.driver}: on-box installer did not parse",
                )
                self.assertIn(
                    "ssh",
                    facts["tools"],
                    f"{route.driver}: preflight tool list did not parse",
                )

    def test_the_two_agent_routes_and_the_site_route_target_the_boxes_they_do(self):
        """Codex and the runner share the agent box; the site is on the other.

        Pinned because it is the one fact a reader is most likely to assume
        rather than check -- and being wrong about it sends the owner to a box
        that cannot do the thing they came to do.
        """
        boxes = {r.driver: r.read()["box"] for r in hrs.ROUTES}
        self.assertEqual(
            boxes["setup-runner-from-laptop.sh"],
            boxes["setup-codex-host-from-laptop.sh"],
            "the runner and Codex drivers no longer share a box -- the report "
            "says they do only because they did when it was written",
        )
        self.assertNotEqual(
            boxes["setup-portfolio-site-from-laptop.sh"],
            boxes["setup-codex-host-from-laptop.sh"],
            "the site driver now targets the agent box; that is either a real "
            "change worth reading or a regression in the driver",
        )

    def test_a_renamed_driver_is_reported_not_crashed_on(self):
        route = hrs.Route(
            driver="setup-nothing-from-laptop.sh",
            unblocks="x", credential="y", starts="z", installed_hint="w",
        )
        facts = route.read()
        self.assertFalse(facts["exists"])
        self.assertFalse(facts["executable"])
        report, ready = hrs.render(routes=[route])
        self.assertIn("MISSING", report)
        self.assertFalse(ready, "an absent driver must not report locally ready")


class DriverFacts(unittest.TestCase):
    def test_a_driver_that_is_not_executable_is_reported_so(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / "driver.sh"
            script.write_text("#!/bin/sh\n")
            script.chmod(0o644)
            route = hrs.Route(driver="driver.sh", unblocks="x", credential="y",
                              starts="z", installed_hint="w")
            with unittest.mock.patch.object(hrs, "SCRIPTS", Path(tmp)):
                self.assertFalse(route.read()["executable"])
                script.chmod(0o755)
                self.assertTrue(route.read()["executable"])


class Wrap(unittest.TestCase):
    def test_lines_fill_to_exactly_the_width_and_no_further(self):
        # "aaaa bbbb" is 9 wide: fits width 9, breaks at width 8.
        self.assertEqual(hrs._wrap("aaaa bbbb", width=9, indent=2), "aaaa bbbb")
        self.assertEqual(hrs._wrap("aaaa bbbb", width=8, indent=2), "aaaa\n  bbbb")

    def test_a_long_run_of_words_wraps_each_line_within_width(self):
        out = hrs._wrap("one two three four five six", width=10, indent=0)
        self.assertEqual(out.split("\n"), ["one two", "three four", "five six"])

    def test_help_text_is_the_first_line_of_the_docstring(self):
        with self.assertRaises(SystemExit), unittest.mock.patch("sys.stdout", io.StringIO()) as out:
            hrs.main(["--help"])
        self.assertIn(hrs.__doc__.splitlines()[0][:30], out.getvalue().replace("\n", " "))


class LocalReadiness(unittest.TestCase):
    """The half that is knowable before the owner holds the key."""

    def _route(self):
        return hrs.ROUTES[0]

    def test_a_missing_tool_is_named_with_its_package(self):
        report, ready = hrs.render(
            routes=[self._route()],
            which=lambda tool: None if tool == "rsync" else f"/usr/bin/{tool}",
        )
        self.assertFalse(ready)
        self.assertIn("MISSING: rsync", report)
        self.assertIn("apt-get install -y rsync", report)

    def test_three_ssh_tools_from_one_package_are_one_install_line(self):
        """An owner missing all of openssh-client has one thing to install."""
        report, _ = hrs.render(
            routes=[self._route()],
            which=lambda tool: None if tool.startswith("ssh") else f"/usr/bin/{tool}",
        )
        self.assertEqual(
            report.count("openssh-client"),
            1,
            "the install hint repeated a package -- three binaries from one "
            f"package are one install:\n{report}",
        )

    def test_everything_present_reports_ready(self):
        report, ready = hrs.render(
            routes=[self._route()], which=lambda tool: f"/usr/bin/{tool}"
        )
        self.assertTrue(ready)
        self.assertIn("all present", report)
        self.assertNotIn("MISSING", report)

    def test_require_local_ready_exits_nonzero_only_when_something_is_missing(self):
        with unittest.mock.patch("sys.stdout", new=io.StringIO()):
            with unittest.mock.patch.object(
                hrs, "render", return_value=("", True)
            ):
                self.assertEqual(hrs.main(["--require-local-ready"]), 0)
            with unittest.mock.patch.object(
                hrs, "render", return_value=("", False)
            ):
                self.assertEqual(hrs.main(["--require-local-ready"]), 1)

    def test_a_bare_run_never_fails_however_bad_the_news(self):
        """Same split pages_state.py draws: reporting and gating are separate.

        Folding them together would make a green run mean two things.
        """
        with unittest.mock.patch("sys.stdout", new=io.StringIO()):
            with unittest.mock.patch.object(
                hrs, "render", return_value=("", False)
            ):
                self.assertEqual(hrs.main([]), 0)


class ClaimsNothingItDidNotMeasure(unittest.TestCase):
    def test_the_report_makes_no_network_claim(self):
        report, _ = hrs.render(which=lambda tool: f"/usr/bin/{tool}")
        lowered = report.lower()
        for forbidden in ("is reachable", "is serving", "answered", "responds"):
            self.assertNotIn(
                forbidden,
                lowered,
                f"the report claims {forbidden!r}, which it cannot measure -- "
                "no session can reach these boxes",
            )

    def test_the_module_makes_no_network_call_at_all(self):
        source = Path(hrs.__file__).read_text()
        for forbidden in ("urlopen", "requests.", "socket.", "subprocess."):
            self.assertNotIn(
                forbidden,
                source,
                f"host_routes_state.py reached for {forbidden!r}; this tool is "
                "local-only by design",
            )


class SurfacesThePreflightShape(unittest.TestCase):
    def test_a_serial_preflight_is_called_out(self):
        """Regression guard for the defect fixed alongside this tool.

        Not fatal -- the route still works -- but it decides whether a reader
        missing two tools learns that in one run or two, mid-outage.
        """
        fake = Path(hrs.SCRIPTS) / "setup-runner-from-laptop.sh"
        serial = (
            'BOX_IP="${BOX_IP:-10.0.0.1}"\n'
            "$repo_root/bootstrap/scripts/install-github-runner-host.sh\n"
            "for tool in ssh rsync; do\n"
            '  command -v "$tool" >/dev/null 2>&1 || die "$tool is not on PATH"\n'
            "done\n"
        )
        with unittest.mock.patch.object(Path, "read_text", return_value=serial):
            route = hrs.ROUTES[0]
            self.assertIs(route.read()["batched_preflight"], False)
            report, _ = hrs.render(
                routes=[route], which=lambda tool: f"/usr/bin/{tool}"
            )
        self.assertIn("SERIAL", report)
        self.assertTrue(fake.exists())

    def test_the_real_drivers_are_all_batched_today(self):
        for route in hrs.ROUTES:
            with self.subTest(driver=route.driver):
                self.assertIs(
                    route.read()["batched_preflight"],
                    True,
                    f"{route.driver} dies on the first missing tool again -- "
                    "see gitops/tests/test_laptop_installer_preflight.py",
                )


if __name__ == "__main__":
    unittest.main()
