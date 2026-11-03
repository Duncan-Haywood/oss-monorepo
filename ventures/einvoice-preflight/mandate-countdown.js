// Countdown for the mandates hub: reads mandate-dates.json (generated from the
// hub table by mandate-calendar.mjs) and lists the next milestones with days
// left, filterable by country. No network beyond that one same-origin file, no
// cookies, no tracking. Exposed as window.mandateCountdown for the tests.
(function (root) {
  "use strict";
  function daysUntil(iso, today) {
    var a = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    var b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((a - b) / 86400000);
  }
  function upcoming(events, today, country, limit) {
    var out = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (country && e.country !== country) continue;
      var d = daysUntil(e.date, today);
      if (d >= 0) out.push({ e: e, days: d });
    }
    out.sort(function (x, y) { return x.days - y.days || (x.e.country < y.e.country ? -1 : 1); });
    return limit ? out.slice(0, limit) : out;
  }
  function label(days) {
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    return "in " + days + " days";
  }
  var api = { daysUntil: daysUntil, upcoming: upcoming, label: label };
  root.mandateCountdown = api;
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;
  var box = document.getElementById("countdown");
  if (!box || typeof fetch !== "function") return;
  fetch("mandate-dates.json").then(function (r) { return r.json(); }).then(function (data) {
    var events = data.events, today = new Date();
    var sel = document.getElementById("countdown-country"), list = document.getElementById("countdown-list");
    var names = {};
    events.forEach(function (e) { names[e.country] = e.page; });
    Object.keys(names).sort().forEach(function (c) {
      var o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o);
    });
    function render() {
      var rows = upcoming(events, today, sel.value, sel.value ? 12 : 8);
      list.textContent = "";
      if (!rows.length) { var li0 = document.createElement("li"); li0.textContent = "No dated milestone ahead in this table."; list.appendChild(li0); return; }
      rows.forEach(function (r) {
        var li = document.createElement("li");
        var strong = document.createElement("strong"); strong.textContent = r.e.date + " (" + label(r.days) + ") ";
        var a = document.createElement("a"); a.href = r.e.page; a.textContent = r.e.country;
        li.appendChild(strong); li.appendChild(a); li.appendChild(document.createTextNode(": " + r.e.note));
        list.appendChild(li);
      });
    }
    sel.addEventListener("change", render);
    render();
    box.hidden = false;
  }).catch(function () { /* the table below still has every date */ });
})(typeof window !== "undefined" ? window : globalThis);
