/* error-keeper browser SDK, about 1 KB. <script src="https://YOUR-HOST/sdk.js" data-key="INGEST_KEY" data-release="1.4.2" data-environment="production" defer></script> */
(function () {
  var s = document.currentScript, base = s.src.replace(/\/sdk\.js.*$/, ""), key = s.getAttribute("data-key"), release = s.getAttribute("data-release") || undefined, environment = s.getAttribute("data-environment") || "production", project = s.getAttribute("data-project") || location.hostname, sent = 0, last = {};
  function send(ev) {
    var k = ev.type + ev.message;
    if (sent >= 20 || last[k] > Date.now() - 5000) return; // a render loop must not become an event flood
    last[k] = Date.now(); sent++;
    ev.project = project; ev.release = release; ev.environment = environment; ev.url = location.href;
    try { fetch(base + "/v1/events", { method: "POST", keepalive: true, headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify(ev) }).catch(function () {}); } catch (e) {}
  }
  function fromError(e) { return { type: (e && e.name) || "Error", message: (e && e.message) || String(e), stack: e && e.stack }; }
  addEventListener("error", function (e) { if (e.error || e.message) send(fromError(e.error || { message: e.message, name: "Error" })); });
  addEventListener("unhandledrejection", function (e) { var r = e.reason; send(r instanceof Error ? fromError(r) : { type: "UnhandledRejection", message: String(r) }); });
  window.errorKeeper = { capture: function (e, extra) { var ev = fromError(e); if (extra) { ev.user = extra.user; ev.tags = extra.tags; } send(ev); } };
})();
