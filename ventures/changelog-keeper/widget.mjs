// The embeddable "What's new" bell (served at /embed.js). It renders with textContent only,
// inside a shadow root, so an entry can never inject markup or restyle the host page.
// The only thing it remembers is the time of the newest entry the visitor opened, in
// localStorage on the visitor's own browser; nothing is sent back to the server.
export function widgetSource() {
  return `(function () {
  var s = document.currentScript; if (!s) return;
  var base = new URL(s.src).origin, dark = s.getAttribute("data-theme") === "dark";
  var limit = Math.max(1, Math.min(20, Number(s.getAttribute("data-limit")) || 5));
  var key = "changelog-keeper-seen:" + base;
  function seen() { try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; } }
  function mark(t) { try { localStorage.setItem(key, String(t)); } catch (e) {} }
  var host = document.createElement("div"); s.parentNode.insertBefore(host, s.nextSibling);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var bg = dark ? "#1f2937" : "#fff", fg = dark ? "#f3f4f6" : "#111827", line = dark ? "#374151" : "#e5e7eb";
  var css = document.createElement("style");
  css.textContent = ".b{position:relative;font:15px/1.4 system-ui,sans-serif;background:" + bg + ";color:" + fg + ";border:1px solid " + line + ";border-radius:999px;padding:6px 14px;cursor:pointer}" +
    ".n{position:absolute;top:-6px;right:-6px;background:#dc2626;color:#fff;border-radius:99px;font-size:11px;font-weight:700;min-width:18px;height:18px;line-height:18px;text-align:center}" +
    ".p{margin-top:8px;max-width:360px;font:14px/1.5 system-ui,sans-serif;background:" + bg + ";color:" + fg + ";border:1px solid " + line + ";border-radius:12px;padding:12px}" +
    ".e{padding:8px 0;border-bottom:1px solid " + line + "}.e:last-child{border:0}.t{font-weight:700}.m{font-size:12px;opacity:.7}.x{white-space:pre-wrap;margin:4px 0 0}";
  root.appendChild(css);
  var btn = document.createElement("button"); btn.type = "button"; btn.className = "b"; btn.textContent = s.getAttribute("data-label") || "What's new";
  var panel = document.createElement("div"); panel.className = "p"; panel.hidden = true;
  root.appendChild(btn); root.appendChild(panel);
  var items = [];
  fetch(base + "/entries.json?limit=" + limit).then(function (r) { return r.json(); }).then(function (list) {
    items = Array.isArray(list) ? list : [];
    var unread = items.filter(function (e) { return e.publishAt > seen(); }).length;
    if (unread) { var b = document.createElement("span"); b.className = "n"; b.textContent = unread > 9 ? "9+" : String(unread); btn.appendChild(b); }
    items.forEach(function (e) {
      var row = document.createElement("div"); row.className = "e";
      var t = document.createElement("div"); t.className = "t"; t.textContent = e.title; row.appendChild(t);
      var m = document.createElement("div"); m.className = "m"; m.textContent = e.tag + " \\u00b7 " + new Date(e.publishAt).toISOString().slice(0, 10); row.appendChild(m);
      var x = document.createElement("p"); x.className = "x"; x.textContent = e.text; row.appendChild(x);
      panel.appendChild(row);
    });
    if (!items.length) { var none = document.createElement("div"); none.textContent = "Nothing new yet."; panel.appendChild(none); }
  }).catch(function () {});
  btn.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
    if (!panel.hidden && items.length) { mark(Math.max.apply(null, items.map(function (e) { return e.publishAt; }))); var n = btn.querySelector ? btn.querySelector(".n") : null; if (n && n.remove) n.remove(); }
  });
})();
`;
}
