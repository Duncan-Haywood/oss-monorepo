// The embeddable wall (served at /embed.js). It renders with textContent only, inside a
// shadow root, so a testimonial can never inject markup or restyle the host page.
export function widgetSource() {
  return `(function () {
  var s = document.currentScript; if (!s) return;
  var base = new URL(s.src).origin, form = s.getAttribute("data-form") || "", dark = s.getAttribute("data-theme") === "dark";
  var limit = Math.max(1, Math.min(50, Number(s.getAttribute("data-limit")) || 12));
  var host = document.createElement("div"); s.parentNode.insertBefore(host, s.nextSibling);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  var css = document.createElement("style");
  css.textContent = ".w{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;font:15px/1.5 system-ui,sans-serif}" +
    ".c{background:" + (dark ? "#1f2937" : "#fff") + ";color:" + (dark ? "#f3f4f6" : "#111827") + ";border:1px solid " + (dark ? "#374151" : "#e5e7eb") + ";border-radius:12px;padding:16px}" +
    ".s{color:#d97706;letter-spacing:2px}.n{font-weight:700;margin-top:10px}.r{font-size:13px;opacity:.7}";
  root.appendChild(css);
  var wrap = document.createElement("div"); wrap.className = "w"; root.appendChild(wrap);
  fetch(base + "/wall.json?form=" + encodeURIComponent(form) + "&limit=" + limit).then(function (r) { return r.json(); }).then(function (items) {
    items.forEach(function (t) {
      var c = document.createElement("figure"); c.className = "c"; c.style.margin = "0";
      if (t.rating) { var st = document.createElement("div"); st.className = "s"; st.setAttribute("aria-label", t.rating + " out of 5"); st.textContent = "\\u2605".repeat(t.rating) + "\\u2606".repeat(5 - t.rating); c.appendChild(st); }
      var q = document.createElement("blockquote"); q.style.margin = "8px 0 0"; q.textContent = t.text; c.appendChild(q);
      var n = document.createElement("figcaption"); n.className = "n"; n.textContent = t.name; c.appendChild(n);
      var who = [t.role, t.company].filter(Boolean).join(", ");
      if (who) { var r = document.createElement("div"); r.className = "r"; r.textContent = who; c.appendChild(r); }
      wrap.appendChild(c);
    });
  }).catch(function () {});
})();
`;
}
