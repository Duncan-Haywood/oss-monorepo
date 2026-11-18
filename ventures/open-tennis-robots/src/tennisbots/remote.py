"""Run drills on the feeder from a phone: `tennisbots serve` (2026-11-18).

The drill builder on the project page (index.html, `#drills`) makes a drill in the browser. That page is served over
HTTPS from the web, and a browser will not let an HTTPS page call a plain-HTTP address on the home network (mixed
content), so the page cannot talk to the Pi directly. Instead its "Send to my machine" button opens this server's
own page at `http://<pi>:8080/#drill=<code>`, carrying the drill in the link's fragment exactly as the share link
does. This page checks the drill with `host.plan_drill` (the runner's own check), shows the plan, and runs it with
`host.run_drill` on a thread, with a Stop button and live status.

Safety model (README "Running a drill from the page"):

* **Stop needs nothing.** Anyone who can open the page can stop the machine: Stop makes the runner's next sleep
  raise `host.Abort`, so `run_drill` sends `ESTOP` (wheels halted, a queued ball dropped) within one tick.
* **Start needs the key.** The server makes a random key at start-up and prints it (and a link holding it) on the
  Pi's terminal; the page asks for it once and keeps it in that browser. Without it, someone else on the network
  cannot start the launcher. `--no-key` turns this off for a bench with no one else on it.
* **Other web pages cannot drive it.** Every POST must be `application/json` (a cross-site page cannot send that
  without a CORS pre-flight, which this server never grants) and, when the browser sends an Origin, come from this
  server's own origin; the Host header must be an IP address, `localhost`, a `.local` name or one passed with
  `--allow-host` (a DNS-rebinding page arrives under its own name).
* **A software stop stays latched.** Clearing it is a separate button that sends `CLEAR_ESTOP`, which the firmware
  refuses while the physical e-stop is pressed. After the physical e-stop or the fob, the motors also need RESET
  pressed at the feeder (2026-11-18): the page can clear the board's stop but cannot power the motors.

The physical e-stop and the wireless fob remain the safety stop; this page is a convenience, not a safety device.
"""

from __future__ import annotations

import hmac
import ipaddress
import json
import secrets
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import host
from . import protocol as P

MAX_BODY = 64 * 1024
MAX_LOG = 200
STOPPED = "stopped from the page"


def _shot_row(p: host.PlannedShot) -> dict:
    return {"index": p.index, "landing": [round(p.landing[0], 2), round(p.landing[1], 2)],
            "speed_kmh": round(p.speed * 3.6, 1), "topspin_rpm": round(p.topspin_rpm),
            "elevation_deg": p.elevation_cdeg / 100, "azimuth_deg": p.azimuth_cdeg / 100,
            "rpm_top": p.rpm_top, "rpm_bottom": p.rpm_bottom, "interval_s": p.interval_s}


class DrillServer:
    """The drill runner behind the page, without HTTP: one drill at a time, on its own thread.

    `open_link()` returns a fresh `host.FeederLink` for each drill (and for a clear); `sleep` is the runner's sleep
    (time.sleep on the Pi, the simulator's in tests). Only the runner thread touches the link while a drill runs."""

    def __init__(self, open_link, sleep, *, shot_log: str | None = None, esc_lag_ok: bool = False):
        self.open_link, self._sleep = open_link, sleep
        self.shot_log, self.esc_lag_ok = shot_log, esc_lag_ok
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.state = "idle"            # idle | running | done | stopped | aborted | held | empty
        self.name = ""
        self.log: list = []
        self.result: dict | None = None
        self.fed = 0
        self.total = 0

    # -- what the page asks for
    def plan(self, spec: dict) -> dict:
        """The drill as the runner would play it, or ValueError naming the first ball it cannot make."""
        if not isinstance(spec, dict) or not isinstance(spec.get("shots"), list) or not spec["shots"]:
            raise ValueError("a drill needs a non-empty \"shots\" list")
        shots = host.plan_drill(spec)
        return {"shots": [_shot_row(p) for p in shots], "calibration": host.is_calibration(spec)}

    def start(self, spec: dict, name: str = "") -> None:
        shots = host.plan_drill(spec) if isinstance(spec, dict) and spec.get("shots") else None
        if not shots:
            raise ValueError("a drill needs a non-empty \"shots\" list")
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                raise RuntimeError("a drill is already running: stop it first")
            self._stop.clear()
            self.state, self.name, self.log, self.result = "running", name or "drill from the page", [], None
            self.fed, self.total = 0, len(shots)
            self._thread = threading.Thread(target=self._run, args=(spec, shots), daemon=True)
            self._thread.start()

    def stop(self) -> bool:
        """Ask a running drill to stop; True if one was running. The runner sends ESTOP on its next tick."""
        with self._lock:
            running = self._thread is not None and self._thread.is_alive()
        self._stop.set()
        return running

    def clear(self, *, wait_s: float = 0.5) -> dict:
        """Send CLEAR_ESTOP and report whether the board still holds a stop (the physical button wins)."""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                raise RuntimeError("a drill is running")
        link = self.open_link()
        link.send(P.CLEAR_ESTOP)
        sent = link.clock()
        frame = None
        while link.clock() - sent < wait_s:
            t = link.poll()
            if t is not None and t.t >= sent + host.FRESH_S:
                frame = t
                break
            self._sleep(0.01)
        if frame is None:
            return {"cleared": None, "message": "no telemetry from the feeder (wrong port, baud rate or role?)"}
        if frame.flags & P.FLAG_ESTOP:
            return {"cleared": False, "message": "the board still holds its e-stop: release the physical button "
                                                 "(or the fob), then clear again"}
        if frame.flags & P.FLAG_BUS_OFF:
            # 2026-11-18: the board's stop is cleared, but the contactor stays open until RESET is pressed at the
            # machine (hardware/electronics.md "Reset at the machine"), so a phone alone cannot re-power the motors.
            return {"cleared": True, "powered": False, "message": f"stop cleared on the board, but {host.RESET_HINT}"}
        return {"cleared": True, "powered": True, "message": "stop cleared; the machine can run a drill"}

    def join(self, timeout=None):
        t = self._thread
        if t is not None:
            t.join(timeout)

    def status(self) -> dict:
        with self._lock:
            return {"state": self.state, "name": self.name, "fed": self.fed, "total": self.total,
                    "log": self.log[-40:], "result": self.result}

    # -- the runner thread
    def _say(self, line: str) -> None:
        with self._lock:
            self.log.append(line)
            del self.log[:-MAX_LOG]
            if line.startswith("shot ") and ": ready in " in line:
                self.fed += 1

    def _sleep_or_stop(self, s: float) -> None:
        if self._stop.is_set():
            raise host.Abort(STOPPED)
        self._sleep(s)

    def _run(self, spec: dict, shots: list) -> None:
        calibration = host.is_calibration(spec)
        try:
            prior = host.last_survey_from_log(self.shot_log) if self.shot_log else None
            link = self.open_link()
            res = host.run_drill(link, shots, self._sleep_or_stop, log=self._say, prior_survey=prior,
                                 hold_on_esc_lag=calibration and not self.esc_lag_ok, take_survey=calibration)
            logged = host.append_shot_log(self.shot_log, res, self.name) if self.shot_log and res.launches else 0
        except Exception as exc:          # a port that will not open, a bad shot log: report it, never die silently
            with self._lock:
                self.state = "aborted"
                self.result = {"message": f"drill not run: {exc}"}
            return
        if res.held:
            state, msg = "held", res.aborted
        elif res.dry_shot is not None:
            state, msg = "empty", f"stopped: {res.aborted}"
        elif res.aborted == STOPPED:
            state, msg = "stopped", "stopped from the page: ESTOP sent (wheels halted); press Clear stop to run again"
        elif res.aborted:
            state, msg = "aborted", (f"aborted, ESTOP sent: {res.aborted}; fix the cause, release the e-stop or fob "
                                     f"if used and press RESET on the feeder, then Clear stop")
        else:
            state, msg = "done", f"{len(res.shots)} balls fed; {res.link_errors} bad frames on the link"
        advice = [a for a in (host.esc_survey_advice(res.esc_survey, res.esc_tau_ms or 0),
                              host.take_survey_advice(res.take_survey)) if a]
        with self._lock:
            self.state = state
            self.fed = len(res.shots)
            self.result = {"message": msg, "balls": len(res.shots), "warnings": list(res.warnings),
                           "advice": advice, "logged": logged,
                           "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


# -- HTTP ---------------------------------------------------------------------------------------------------------------

def host_allowed(header: str | None, extra: tuple = ()) -> bool:
    """Is this Host header one a person on the home network would type? (DNS rebinding arrives under another name.)"""
    if not header:
        return False
    name = header.strip().lower()
    if name.startswith("["):                        # [v6]:port
        name = name[1:name.find("]")] if "]" in name else name
    elif name.count(":") == 1:
        name = name.rsplit(":", 1)[0]
    if name in extra or name == "localhost" or name.endswith(".local"):
        return True
    try:
        ipaddress.ip_address(name)
        return True
    except ValueError:
        return False


def make_handler(server: DrillServer, key: str | None, allow_hosts: tuple = ()):
    class Handler(BaseHTTPRequestHandler):
        server_version = "tennisbots"

        def log_message(self, fmt, *args):   # keep the terminal for the runner's own lines
            pass

        def _send(self, code: int, body, ctype="application/json"):
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype + "; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            if ctype == "text/html":
                self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; "
                                 "style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; "
                                 "frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(data)

        def _host_ok(self) -> bool:
            if host_allowed(self.headers.get("Host"), allow_hosts):
                return True
            self._send(421, {"error": "unknown host name: open the page by the Pi's IP address or .local name, or "
                                      "start the server with --allow-host NAME"})
            return False

        def do_GET(self):
            if not self._host_ok():
                return
            path = self.path.split("?", 1)[0]
            if path == "/":
                self._send(200, PAGE.encode(), "text/html")
            elif path == "/api/status":
                self._send(200, dict(server.status(), key_required=bool(key)))
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            if not self._host_ok():
                return
            ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if ctype != "application/json":
                return self._send(415, {"error": "send application/json"})
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                return self._send(403, {"error": "cross-origin request refused"})
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                return self._send(413, {"error": "drill too large"})
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                return self._send(400, {"error": "not JSON"})
            if not isinstance(body, dict):
                return self._send(400, {"error": "send a JSON object"})
            path = self.path.split("?", 1)[0]
            try:
                if path == "/api/stop":                      # never needs the key
                    return self._send(200, {"stopping": server.stop()})
                if path == "/api/plan":
                    return self._send(200, server.plan(body.get("drill")))
                if path in ("/api/start", "/api/clear"):
                    if key and not hmac.compare_digest(str(body.get("key", "")), key):
                        return self._send(401, {"error": "wrong or missing key: it is printed on the Pi's terminal "
                                                          "where `tennisbots serve` runs"})
                    if path == "/api/clear":
                        return self._send(200, server.clear())
                    server.start(body.get("drill"), str(body.get("name", ""))[:80])
                    return self._send(202, server.status())
            except ValueError as exc:
                return self._send(422, {"error": str(exc)})
            except RuntimeError as exc:
                return self._send(409, {"error": str(exc)})
            self._send(404, {"error": "not found"})

    return Handler


def serve(device: str, listen: str = "0.0.0.0:8080", *, shot_log: str | None = None, esc_lag_ok: bool = False,
          use_key: bool = True, allow_hosts: tuple = (), out=print) -> None:
    """Serve the drill page and run drills on the feeder at `device` until interrupted."""
    port_holder = {}

    def open_link():
        if "port" not in port_holder:
            port_holder["port"] = host.SerialPort(device)
        return host.FeederLink(port_holder["port"], time.monotonic)

    addr, _, port = listen.rpartition(":")
    srv = DrillServer(open_link, time.sleep, shot_log=shot_log, esc_lag_ok=esc_lag_ok)
    key = secrets.token_hex(3) if use_key else None
    httpd = ThreadingHTTPServer((addr or "0.0.0.0", int(port)), make_handler(srv, key, tuple(allow_hosts)))
    shown = "<this Pi's address>" if addr in ("", "0.0.0.0", "::") else addr
    out(f"drill page: http://{shown}:{port}/   (Ctrl-C to stop)")
    if key:
        out(f"key to start a drill: {key}   (the page asks for it once; restart the server for a new key)")
    else:
        out("no key: anyone on this network can start the launcher (--no-key)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.stop()
        srv.join(2.0)
        httpd.server_close()


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Feeder: run a drill</title>
<style>
:root{--bg:#fff;--fg:#1b1f23;--mut:#5b636b;--line:#d6dbe0;--acc:#1f6f3f;--bad:#b42318;--card:#f5f7f9}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#e8eaed;--mut:#a0a7ae;--line:#2c3137;--acc:#5cc58a;--bad:#ff7b6b;--card:#1b1e22}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:16px}h1{font-size:1.3rem;margin:.2em 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin:12px 0}
button{font:inherit;padding:.6em 1em;border-radius:8px;border:1px solid var(--line);background:var(--acc);color:#fff;margin:4px 4px 4px 0}
button.sec{background:transparent;color:var(--fg)}button:disabled{opacity:.5}
#stop{background:var(--bad);font-size:1.25rem;width:100%;padding:.9em}
table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{padding:4px 6px;border-bottom:1px solid var(--line);text-align:right}
th:first-child,td:first-child{text-align:left}.scroll{overflow-x:auto}
.bad{color:var(--bad)}.mut{color:var(--mut);font-size:.9rem}pre{white-space:pre-wrap;font-size:.85rem;margin:0}
input,textarea{font:inherit;width:100%;padding:.4em;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
</style></head><body><main>
<h1>Run a drill on this feeder</h1>
<p class="mut">The physical e-stop and the fob are the safety stop. This page is a convenience: keep people clear of the
launcher whenever its wheels can turn. After the e-stop or the fob, the motors stay unpowered until someone presses
RESET on the feeder; this page cannot power them. No warranty.</p>
<button id="stop">STOP</button>
<div class="card"><b id="state">...</b> <span id="count"></span><div id="result"></div></div>
<div class="card"><h2 style="font-size:1.05rem;margin:0 0 6px">Drill</h2>
<div id="drillinfo" class="mut">Open this page from the drill builder's "Send to my machine" button, or paste a drill
link or drill.json below.</div>
<div class="scroll"><table id="plan" hidden><thead><tr><th>#</th><th>Past net, m</th><th>Left, m</th><th>km/h</th>
<th>Elev.</th><th>Azim.</th><th>Top rpm</th><th>Bottom rpm</th><th>Pause s</th></tr></thead><tbody></tbody></table></div>
<p id="planerr" class="bad"></p>
<details><summary>Paste a drill</summary><textarea id="paste" rows="4" placeholder="a #drill= link or drill.json"></textarea>
<button class="sec" id="load">Load</button></details>
<p id="keyrow" hidden><label for="key">Key (printed where <code>tennisbots serve</code> runs)</label><input id="key" autocomplete="off"></p>
<button id="start" disabled>Start drill</button><button class="sec" id="clear">Clear stop</button>
</div>
<div class="card"><h2 style="font-size:1.05rem;margin:0 0 6px">Runner log</h2><pre id="log"></pre></div>
</main><script>
const $=id=>document.getElementById(id);let drill=null,keyNeeded=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{return null}}
function decode(code){const b=code.replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(decodeURIComponent(escape(atob(b))))}
async function post(path,body){const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.error||("HTTP "+r.status));return j}
async function load(spec){drill=spec;$("planerr").textContent="";$("plan").hidden=true;$("start").disabled=true;
 try{const p=await post("/api/plan",{drill:spec});const tb=$("plan").tBodies[0];
  tb.innerHTML=p.shots.map(s=>`<tr><td>${s.index+1}</td><td>${s.landing[0]}</td><td>${s.landing[1]}</td><td>${s.speed_kmh}</td><td>${s.elevation_deg.toFixed(1)}</td><td>${s.azimuth_deg.toFixed(1)}</td><td>${s.rpm_top}</td><td>${s.rpm_bottom}</td><td>${s.interval_s}</td></tr>`).join("");
  $("plan").hidden=false;$("drillinfo").textContent=`${p.shots.length} balls${p.calibration?" (calibration drill)":""}, checked by the runner's own planner.`;
  $("start").disabled=false}catch(e){$("planerr").textContent="This drill cannot run: "+e.message}}
function fromText(t){t=t.trim();const m=t.match(/#drill=([A-Za-z0-9_-]+)/);return m?decode(m[1]):JSON.parse(t)}
$("load").onclick=()=>{try{load(fromText($("paste").value))}catch(e){$("planerr").textContent="Could not read that: "+e.message}};
$("stop").onclick=async()=>{try{await post("/api/stop",{})}catch(e){alert("Stop failed: "+e.message+" Use the physical e-stop.")}poll()};
$("start").onclick=async()=>{const key=$("key").value.trim();if(key)store("feeder-key",key);
 try{await post("/api/start",{drill,key,name:"drill from the page"})}catch(e){$("planerr").textContent=e.message}poll()};
$("clear").onclick=async()=>{try{const r=await post("/api/clear",{key:$("key").value.trim()});$("planerr").textContent=r.message}catch(e){$("planerr").textContent=e.message}poll()};
async function poll(){try{const s=await (await fetch("/api/status")).json();keyNeeded=s.key_required;$("keyrow").hidden=!keyNeeded;
 $("state").textContent={idle:"Idle",running:"Running",done:"Done",stopped:"Stopped",aborted:"Aborted",held:"Held",empty:"Hopper empty"}[s.state]||s.state;
 $("count").textContent=s.total?`${s.fed} of ${s.total} balls`:"";$("result").innerHTML=s.result?`<p>${esc(s.result.message)}</p>`+
 (s.result.warnings||[]).concat(s.result.advice||[]).map(w=>`<p class="mut">${esc(w)}</p>`).join(""):"";
 $("log").textContent=s.log.join("\n");$("start").disabled=!drill||s.state==="running"}catch{$("state").textContent="No answer from the Pi"}}
const k=store("feeder-key");if(k)$("key").value=k;
const m=location.hash.match(/#drill=([A-Za-z0-9_-]+)/);if(m){try{load(decode(m[1]))}catch(e){$("planerr").textContent="That link's drill is damaged: "+e.message}}
poll();setInterval(poll,700);
</script></body></html>
"""
