// The embeddable "What's new" button. Served as /embed.js. The script renders in a
// shadow root with textContent only and shows entries as plain text with a link
// to the full page, so a changelog entry can never inject markup into the host page.
export function widgetSource() {
  return `(() => {
  const s = document.currentScript; if (!s) return;
  const base = new URL(s.src).origin, tag = s.dataset.tag || "", seenKey = "changelog-keeper-seen:" + base + ":" + tag;
  const color = /^#[0-9a-fA-F]{6}$/.test(s.dataset.color || "") ? s.dataset.color : "#2563eb";
  const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" });
  const css = document.createElement("style");
  css.textContent = ".b{position:relative;font:600 14px system-ui,sans-serif;background:" + color + ";color:#fff;border:0;border-radius:99px;padding:8px 14px;cursor:pointer}.dot{position:absolute;top:-3px;right:-3px;width:10px;height:10px;border-radius:50%;background:#dc2626;border:2px solid #fff}.p{position:absolute;z-index:2147483000;width:320px;max-height:420px;overflow:auto;background:#fff;color:#111;border:1px solid #d1d5db;border-radius:12px;box-shadow:0 8px 30px #0003;font:14px/1.45 system-ui,sans-serif;padding:6px 14px}.p[hidden]{display:none}.e{padding:10px 0;border-bottom:1px solid #eee}.e small{color:#555}.e a{color:" + color + ";font-weight:600;text-decoration:none}";
  const wrap = document.createElement("span"); wrap.style.cssText = "position:relative;display:inline-block";
  const btn = document.createElement("button"); btn.className = "b"; btn.type = "button"; btn.textContent = s.dataset.label || "What's new";
  const dot = document.createElement("span"); dot.className = "dot"; dot.hidden = true; btn.append(dot);
  const pop = document.createElement("div"); pop.className = "p"; pop.hidden = true; pop.setAttribute("role", "dialog");
  wrap.append(btn, pop); root.append(css, wrap);
  s.insertAdjacentElement("afterend", host);
  let latest = 0, seen = 0; try { seen = Number(localStorage.getItem(seenKey)) || 0; } catch (e) {}
  fetch(base + "/changelog.json?limit=8" + (tag ? "&tag=" + encodeURIComponent(tag) : "")).then((r) => r.json()).then((items) => {
    for (const it of items) {
      const t = Date.parse(it.publishedAt); if (t > latest) latest = t;
      const d = document.createElement("div"); d.className = "e";
      const h = document.createElement("strong"); h.textContent = it.title; d.append(h, document.createElement("br"));
      const m = document.createElement("small"); m.textContent = it.category + " · " + it.publishedAt.slice(0, 10); d.append(m, document.createElement("br"));
      const a = document.createElement("a"); a.textContent = "Read more"; a.href = base + "/e/" + encodeURIComponent(it.slug); a.target = "_blank"; a.rel = "noopener"; d.append(a);
      pop.append(d);
    }
    if (!items.length) pop.textContent = "Nothing yet.";
    dot.hidden = !(latest > seen);
  }).catch(() => { btn.hidden = true; });
  btn.addEventListener("click", () => {
    pop.hidden = !pop.hidden; btn.setAttribute("aria-expanded", String(!pop.hidden));
    if (!pop.hidden) { dot.hidden = true; try { localStorage.setItem(seenKey, String(latest)); } catch (e) {} }
  });
})();`;
}
