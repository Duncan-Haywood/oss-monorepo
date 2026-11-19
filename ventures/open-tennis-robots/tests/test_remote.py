"""`tennisbots serve`: drills sent from the page, run on the simulated feeder (the real firmware), and the HTTP gate."""

import base64
import json
import os
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from feeder_sim import SimFeeder
from tennisbots import host, remote
from tennisbots import protocol as P

HERE = os.path.dirname(__file__)


def example():
    with open(os.path.join(HERE, "..", "drill.example.json")) as f:
        return json.load(f)


def sim_server(sim, **kw):
    return remote.DrillServer(lambda: host.FeederLink(sim, sim.clock), sim.sleep, **kw)


def wait_for(cond, timeout=120.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.01)
    return False


class DrillServerTest(unittest.TestCase):
    def test_plan_matches_the_runner(self):
        srv = sim_server(SimFeeder())
        plan = srv.plan(example())
        want = host.plan_drill(example())
        self.assertEqual([(s["rpm_top"], s["rpm_bottom"]) for s in plan["shots"]],
                         [(p.rpm_top, p.rpm_bottom) for p in want])
        self.assertFalse(plan["calibration"])

    def test_unreachable_ball_is_refused_before_anything_moves(self):
        sim = SimFeeder()
        srv = sim_server(sim)
        bad = {"shots": [{"x": 9, "y": 0, "speed": 22, "topspin": 1200}, {"x": 30, "y": 0, "speed": 10}]}
        with self.assertRaises(ValueError):
            srv.plan(bad)
        with self.assertRaises(ValueError):
            srv.start(bad)
        with self.assertRaises(ValueError):
            srv.start({"shots": []})
        self.assertEqual(srv.status()["state"], "idle")
        self.assertEqual(sim.released, [])

    def test_a_page_drill_runs_clean(self):
        sim = SimFeeder()
        srv = sim_server(sim)
        srv.start(example(), "example")
        with self.assertRaises(RuntimeError):            # one drill at a time
            srv.start(example())
        srv.join(300)
        st = srv.status()
        self.assertEqual(st["state"], "done", st)
        self.assertEqual(st["fed"], 4)
        self.assertEqual(len(sim.released), 4)
        self.assertIn("4 balls fed", st["result"]["message"])
        self.assertFalse(sim.ctl.estop)

    def test_stop_mid_drill_sends_estop_and_clear_needs_the_button_up(self):
        sim = SimFeeder()
        srv = sim_server(sim)
        srv.start(example())
        self.assertTrue(wait_for(lambda: len(sim.released) >= 1), "first ball never released")
        self.assertTrue(srv.stop())
        srv.join(60)
        st = srv.status()
        self.assertEqual(st["state"], "stopped", st)
        self.assertLess(len(sim.released), 4)
        sim.run_ms(20)                                   # the board reads the ESTOP frame on its next loop
        self.assertTrue(sim.ctl.estop)                   # latched: the page's stop is an ESTOP, not a pause
        n = len(sim.released)
        sim.run_ms(3000)
        self.assertEqual(len(sim.released), n)           # nothing queued rides out after the stop
        sim.estop_button = True                          # the physical button wins over a software clear
        self.assertFalse(srv.clear()["cleared"])
        self.assertTrue(sim.ctl.estop)
        sim.estop_button = False
        sim.run_ms(50)
        r = srv.clear()                                  # the board's stop clears, but the motors stay unpowered
        self.assertTrue(r["cleared"])
        self.assertFalse(r["powered"])
        self.assertIn("RESET on the feeder", r["message"])
        sim.press_reset()                                # until RESET at the machine (2026-11-18)
        sim.run_ms(300)
        r = srv.clear()
        self.assertTrue(r["cleared"] and r["powered"], r)
        self.assertFalse(sim.ctl.estop)
        srv.start(example())                             # and it runs again after the clear
        srv.join(300)
        self.assertEqual(srv.status()["state"], "done", srv.status())

    def test_no_telemetry_aborts_and_reports(self):
        class Silent:
            def write(self, data):
                pass

            def read(self):
                return b""
        t = [0.0]

        def sleep(s):
            t[0] += s
        srv = remote.DrillServer(lambda: host.FeederLink(Silent(), lambda: t[0]), sleep)
        srv.start(example())
        srv.join(30)
        st = srv.status()
        self.assertEqual(st["state"], "aborted")
        self.assertIn("no telemetry", st["result"]["message"])
        self.assertIsNone(srv.clear()["cleared"])

    def test_host_names(self):
        ok = ["192.168.1.20:8080", "raspberrypi.local:8080", "localhost:8080", "[fe80::1]:8080", "10.0.0.5"]
        for h in ok:
            self.assertTrue(remote.host_allowed(h), h)
        for h in ["evil.example:8080", "", None, "attacker.com"]:
            self.assertFalse(remote.host_allowed(h), h)
        self.assertTrue(remote.host_allowed("feeder.lan:8080", ("feeder.lan",)))


class HttpGateTest(unittest.TestCase):
    def setUp(self):
        self.sim = SimFeeder()
        self.srv = sim_server(self.sim)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), remote.make_handler(self.srv, "abc123"))
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.stop()
        self.srv.join(60)
        self.httpd.shutdown()
        self.httpd.server_close()

    def req(self, path, body=None, ctype="application/json", headers=None):
        data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        r = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, headers=dict(headers or {}))
        if data is not None:
            r.add_header("Content-Type", ctype)
        try:
            with urllib.request.urlopen(r, timeout=10) as resp:
                return resp.status, json.loads(resp.read()) if "json" in resp.headers["Content-Type"] else None
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_page_and_status(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/", timeout=10) as resp:
            page = resp.read().decode()
            self.assertIn("default-src 'none'", resp.headers["Content-Security-Policy"])
        self.assertIn("#drill=", page)
        self.assertIn("physical e-stop", page)
        code, st = self.req("/api/status")
        self.assertEqual((code, st["state"], st["key_required"]), (200, "idle", True))

    def test_start_needs_key_json_and_same_origin(self):
        d = example()
        self.assertEqual(self.req("/api/start", {"drill": d})[0], 401)
        self.assertEqual(self.req("/api/start", {"drill": d, "key": "nope"})[0], 401)
        # a cross-site form post arrives as text/plain or form data: refused before anything is read
        self.assertEqual(self.req("/api/start", json.dumps({"drill": d, "key": "abc123"}).encode(), "text/plain")[0], 415)
        self.assertEqual(self.req("/api/start", {"drill": d, "key": "abc123"},
                                  headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.req("/api/start", {"drill": d, "key": "abc123"},
                                  headers={"Host": "evil.example:8080"})[0], 421)
        self.assertEqual(self.sim.released, [])
        bad = {"shots": [{"x": 30, "y": 0, "speed": 10}]}
        code, err = self.req("/api/plan", {"drill": bad})
        self.assertEqual(code, 422)
        self.assertIn("shot 0", err["error"])
        code, st = self.req("/api/start", {"drill": d, "key": "abc123"},
                            headers={"Origin": f"http://127.0.0.1:{self.port}"})
        self.assertEqual((code, st["state"]), (202, "running"))
        self.assertEqual(self.req("/api/start", {"drill": d, "key": "abc123"})[0], 409)
        # stop needs no key
        self.assertTrue(wait_for(lambda: len(self.sim.released) >= 1))
        code, r = self.req("/api/stop", {})
        self.assertEqual((code, r["stopping"]), (200, True))
        self.srv.join(60)
        self.assertEqual(self.req("/api/status")[1]["state"], "stopped")

    def test_share_link_code_round_trips(self):
        # the page's encodeDrill is base64url of the JSON without padding; the Pi page decodes it the same way
        spec = example()
        code = base64.urlsafe_b64encode(json.dumps(spec).encode()).decode().rstrip("=")
        back = json.loads(base64.urlsafe_b64decode(code + "=" * (-len(code) % 4)))
        self.assertEqual(self.srv.plan(back), self.srv.plan(spec))


if __name__ == "__main__":
    unittest.main()
