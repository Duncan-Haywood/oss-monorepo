// The embeddable help widget: one script tag on a customer's own site or app puts a "Help" button
// in the corner; it opens a search box that answers from this help center as the visitor types.
// Served at /widget.js. The script finds its server from its own src, so nothing is baked in.
// Every value from the API goes in with textContent or a validated href, never innerHTML.
export const WIDGET_JS = `(function () {
  "use strict";
  var me = document.currentScript;
  if (!me || !me.src || window.__helpKeeperWidget) return;
  window.__helpKeeperWidget = true;
  var origin = new URL(me.src).origin;
  var label = me.getAttribute("data-label") || "Help";
  var color = /^#[0-9a-fA-F]{6}$/.test(me.getAttribute("data-color") || "") ? me.getAttribute("data-color") : "#2342b8";
  var left = me.getAttribute("data-position") === "left";
  var host = document.createElement("div");
  host.setAttribute("data-help-keeper", "");
  var root = host.attachShadow({ mode: "open" });
  var css = ":host{all:initial}*{box-sizing:border-box;font:15px/1.45 system-ui,sans-serif}" +
    ".btn{position:fixed;bottom:18px;" + (left ? "left" : "right") + ":18px;z-index:2147483000;background:" + color + ";color:#fff;border:0;border-radius:99px;padding:11px 20px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}" +
    ".panel{position:fixed;bottom:70px;" + (left ? "left" : "right") + ":18px;z-index:2147483000;width:min(360px,calc(100vw - 36px));max-height:min(520px,calc(100vh - 100px));overflow:auto;background:#fff;color:#1c2030;border:1px solid #dde1ec;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:14px}" +
    ".panel[hidden]{display:none}input{width:100%;padding:9px;border:1px solid #b5bdd6;border-radius:8px}ul{list-style:none;margin:10px 0 0;padding:0}li{padding:8px 0;border-top:1px solid #e3e6f1}" +
    "a{color:" + color + ";font-weight:600;text-decoration:none}a:hover{text-decoration:underline}.x{color:#46506b;font-size:13px;margin:2px 0 0}.m{color:#46506b;font-size:13px;margin:10px 0 0}";
  var style = document.createElement("style");
  style.textContent = css;
  var btn = document.createElement("button");
  btn.className = "btn"; btn.type = "button"; btn.textContent = label;
  btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "hk-panel");
  var panel = document.createElement("div");
  panel.className = "panel"; panel.id = "hk-panel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Search help");
  var input = document.createElement("input");
  input.type = "search"; input.placeholder = "Search for answers"; input.maxLength = 100; input.autocomplete = "off"; input.setAttribute("aria-label", "Search help");
  var list = document.createElement("ul");
  list.setAttribute("aria-live", "polite");
  var note = document.createElement("p");
  note.className = "m";
  panel.appendChild(input); panel.appendChild(list); panel.appendChild(note);
  root.appendChild(style); root.appendChild(panel); root.appendChild(btn);

  function safeHref(u) { try { var p = new URL(u, origin); return /^(https?:|mailto:)$/.test(p.protocol) ? p.href : null; } catch (e) { return null; } }
  var live = null, settle = null, ctl = null, contact = null;
  function show(data) {
    contact = data.contact || contact;
    list.textContent = "";
    (data.results || []).forEach(function (r) {
      var href = safeHref(r.url); if (!href) return;
      var li = document.createElement("li"), a = document.createElement("a"), p = document.createElement("p");
      a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = r.title;
      p.className = "x"; p.textContent = r.excerpt || "";
      li.appendChild(a); li.appendChild(p); list.appendChild(li);
    });
    note.textContent = "";
    if (!(data.results || []).length) note.textContent = "Nothing matched. Try other words. ";
    var c = contact && safeHref(contact);
    if (c) { var a2 = document.createElement("a"); a2.href = c; a2.rel = "noopener"; a2.textContent = "Still stuck? Contact us"; note.appendChild(a2); }
  }
  function query(q, log) {
    if (ctl) ctl.abort();
    ctl = typeof AbortController === "function" ? new AbortController() : null;
    var url = origin + "/api/search?limit=5&q=" + encodeURIComponent(q) + (log ? "" : "&live=1");
    fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && input.value.trim() === q) show(d); }).catch(function () {});
  }
  input.addEventListener("input", function () {
    clearTimeout(live); clearTimeout(settle);
    var q = input.value.trim();
    if (q.length < 2) { list.textContent = ""; note.textContent = ""; return; }
    live = setTimeout(function () { query(q, false); }, 250);
    settle = setTimeout(function () { query(q, true); }, 1500);
  });
  input.addEventListener("keydown", function (e) { if (e.key === "Escape") toggle(false); });
  function toggle(open) {
    panel.hidden = !open; btn.setAttribute("aria-expanded", String(open));
    if (open) { input.focus(); if (contact === null && !list.children.length) query("help", false); } else btn.focus();
  }
  btn.addEventListener("click", function () { toggle(panel.hidden); });
  document.body.appendChild(host);
})();
`;
