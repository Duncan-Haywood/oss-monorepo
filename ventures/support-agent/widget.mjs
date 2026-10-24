// The chat bubble served at /widget.js. One line on any site:
//   <script src="https://help.example.com/widget.js" defer></script>
// Options: data-label="Ask us", data-color="#RRGGBB", data-position="left", data-open="1" (open on load, used by /).
// Shadow DOM, no dependencies, no cookies; every server string is set with textContent, never as HTML.
export function widgetJs(base) {
  return `(() => {
const BASE = ${JSON.stringify(base)};
const me = document.currentScript || document.querySelector('script[src$="/widget.js"]');
const opt = (k, d) => (me && me.getAttribute("data-" + k)) || d;
const color = /^#[0-9a-f]{6}$/i.test(opt("color", "")) ? opt("color", "") : "#1f5f8b";
const host = document.createElement("div"); document.body.appendChild(host);
const root = host.attachShadow({ mode: "open" });
const side = opt("position", "right") === "left" ? "left" : "right";
root.innerHTML = \`<style>
:host{all:initial}
.b{position:fixed;bottom:20px;\${side}:20px;z-index:2147483000;font:15px/1.4 system-ui,sans-serif}
.t{background:\${color};color:#fff;border:0;border-radius:24px;padding:12px 18px;cursor:pointer;font:inherit;box-shadow:0 2px 8px #0003}
.p{display:none;flex-direction:column;width:min(360px,calc(100vw - 40px));height:min(520px,calc(100vh - 100px));background:#fff;color:#1b1b1b;border-radius:12px;box-shadow:0 4px 24px #0004;overflow:hidden;margin-bottom:10px}
.p.o{display:flex}.h{background:\${color};color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center}
.h button{background:none;border:0;color:#fff;font-size:20px;cursor:pointer}
.l{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.m{max-width:88%;padding:8px 11px;border-radius:10px;white-space:pre-wrap;word-wrap:break-word}
.u{align-self:flex-end;background:\${color};color:#fff}.a{align-self:flex-start;background:#f1f3f5}
.a a{color:\${color}}.s{font-size:12px;color:#555;margin-top:4px}.r{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
.r button,.f button{border:1px solid \${color};background:#fff;color:\${color};border-radius:14px;padding:3px 10px;cursor:pointer;font:inherit;font-size:13px}
form.q{display:flex;border-top:1px solid #ddd}form.q input{flex:1;border:0;padding:12px;font:inherit;outline:none}
form.q button{border:0;background:\${color};color:#fff;padding:0 16px;font:inherit;cursor:pointer}
.f{display:flex;flex-direction:column;gap:6px;margin-top:6px}.f input{padding:6px;border:1px solid #bbb;border-radius:6px;font:inherit}
.n{font-size:11px;color:#666;padding:4px 12px 8px}
@media (prefers-color-scheme:dark){.p{background:#1e1f22;color:#eee}.a{background:#2b2d31}.a a{color:#8cc4ff}.s,.n{color:#aaa}form.q input{background:#1e1f22;color:#eee}}
</style><div class="b"><div class="p" role="dialog" aria-label="Support chat"><div class="h"><span class="ti"></span><button class="x" aria-label="Close">&times;</button></div>
<div class="l" aria-live="polite"></div><form class="q"><label style="position:absolute;left:-9999px" for="saq">Your question</label><input id="saq" maxlength="500" autocomplete="off" placeholder="Type your question"><button>Send</button></form>
<div class="n">Answers come from our help articles and can be wrong. A person can take over at any time.</div></div><button class="t"></button></div>\`;
const $ = (s) => root.querySelector(s);
const panel = $(".p"), list = $(".l"), form = $("form.q"), input = $("#saq");
$(".t").textContent = opt("label", "Ask us"); $(".ti").textContent = opt("label", "Ask us");
const history = []; let lastQ = "";
const open = (v) => { panel.classList.toggle("o", v); if (v) input.focus(); };
$(".t").onclick = () => open(!panel.classList.contains("o")); $(".x").onclick = () => open(false);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const scroll = () => { list.scrollTop = list.scrollHeight; };
const say = (cls, text) => { const m = el("div", "m " + cls, text); list.appendChild(m); scroll(); return m; };
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.ok ? r.json() : r.json().catch(() => ({})).then((j) => { throw new Error(j.error || "Something went wrong"); }));
function handoffForm(m) {
  const f = el("form", "f"); const email = el("input"); email.type = "email"; email.required = true; email.placeholder = "Your email"; email.setAttribute("aria-label", "Your email");
  const name = el("input"); name.placeholder = "Your name (optional)"; name.setAttribute("aria-label", "Your name");
  const b = el("button", null, "Send to our team"); f.append(email, name, b); m.appendChild(f); scroll();
  f.onsubmit = (e) => { e.preventDefault(); b.disabled = true;
    post("/api/handoff", { email: email.value, name: name.value, question: lastQ, transcript: history.slice(-10) })
      .then((j) => { f.replaceWith(el("div", "s", j.message || "Sent. We will reply by email.")); }).catch((err) => { b.disabled = false; f.appendChild(el("div", "s", err.message)); }); };
}
function render(j) {
  const m = say("a", j.text); history.push({ role: "agent", text: j.text });
  if (j.citations && j.citations.length) { const s = el("div", "s", "From: "); j.citations.forEach((c, i) => { if (i) s.append(", "); if (/^https?:\\/\\//.test(c.url || "")) { const a = el("a", null, c.title); a.href = c.url; a.target = "_blank"; a.rel = "noopener"; s.appendChild(a); } else s.append(c.title); }); m.appendChild(s); }
  const row = el("div", "r");
  if (j.action === "answer" || j.action === "suggest") {
    if (j.action === "answer") { const y = el("button", null, "That helped"); y.onclick = () => { post("/api/feedback", { id: j.id, helpful: true }).catch(() => {}); row.replaceWith(el("div", "s", "Thanks!")); }; row.appendChild(y); }
    const p = el("button", null, "Talk to a person"); p.onclick = () => { if (j.action === "answer") post("/api/feedback", { id: j.id, helpful: false }).catch(() => {}); row.remove(); handoffForm(m); }; row.appendChild(p);
    m.appendChild(row);
  } else if (j.action === "handoff") handoffForm(m);
  scroll();
}
form.onsubmit = (e) => { e.preventDefault(); const q = input.value.trim(); if (!q) return; input.value = ""; lastQ = q;
  say("u", q); const wait = say("a", "…");
  post("/api/ask", { q, history: history.slice(-6) }).then((j) => { wait.remove(); history.push({ role: "customer", text: q }); render(j); })
    .catch((err) => { wait.textContent = err.message; }); };
say("a", "Hi! Ask a question and I will look in our help articles.");
if (opt("open", "") === "1") open(true);
})();
`;
}
