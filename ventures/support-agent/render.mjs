// Server-rendered pages. Every value from state or a request goes through esc().
import { reportText } from "./eval.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `body{font:15px/1.5 system-ui,sans-serif;max-width:980px;margin:0 auto;padding:16px;color:#1b1b1b;background:#fff}
h1{font-size:22px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}textarea{width:100%;font:13px/1.4 ui-monospace,monospace;box-sizing:border-box}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #eee;padding:4px 6px;text-align:left;vertical-align:top}
.k{display:flex;gap:12px;flex-wrap:wrap}.k div{border:1px solid #ddd;border-radius:8px;padding:8px 12px;min-width:110px}.k b{display:block;font-size:20px}
pre{background:#f6f8fa;padding:10px;overflow:auto;font-size:12px}.note{color:#555;font-size:13px}button{font:inherit;padding:4px 12px}
input[type=text],input[type=number]{font:inherit;padding:3px 6px}footer{margin-top:40px;font-size:12px;color:#555}
@media (prefers-color-scheme:dark){body{background:#17181a;color:#e6e6e6}pre{background:#222}td,th{border-color:#333}.note,footer{color:#aaa}}`;

const DISCLAIMER = `<footer><p><b>No warranty.</b> This tool is provided free and as-is, without warranty of any kind. It is not legal, consumer-protection or professional advice. Answers are copied from your own articles but can still be wrong or out of date; you are responsible for what your support channel tells customers. No uptime or delivery guarantee.</p></footer>`;

export function homePage(cfg, state) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(state.settings.name)} - ask a question</title><meta name="robots" content="noindex"><style>${CSS}</style></head>
<body><h1>${esc(state.settings.name)}</h1><p>Ask a question in the chat. Answers come from our help articles; a person can take over at any time.${state.settings.contact ? ` You can also write to <a href="mailto:${esc(state.settings.contact)}">${esc(state.settings.contact)}</a>.` : ""}</p>
<script src="${esc(cfg.base)}/widget.js" data-open="1" data-label="Ask ${esc(state.settings.name)}" defer></script>${DISCLAIMER}</body></html>`;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "-");

export function adminPage(cfg, state, { stats: s, gaps, articles, report, message, now }) {
  const recent = state.log.slice(-40).reverse();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Support Agent admin</title><meta name="robots" content="noindex"><style>${CSS}</style></head><body>
<h1>Support Agent: ${esc(state.settings.name)}</h1>
${message ? `<p><b>${esc(message)}</b></p>` : ""}
<div class="k"><div><b>${s.questions}</b>questions, 30 days</div><div><b>${pct(s.answer, s.questions)}</b>answered</div><div><b>${pct(s.suggest, s.questions)}</b>offered articles</div><div><b>${pct(s.handoff, s.questions)}</b>handed off</div><div><b>${pct(s.helpful, s.voted)}</b>said it helped (${s.voted} votes)</div><div><b>${s.handoffsSent}</b>handoffs sent</div></div>
<p class="note">${articles} articles. Answer bar ${cfg.bar.toFixed(3)}, suggest bar ${cfg.suggestBar.toFixed(3)}, confidence model: ${esc(cfg.calibrationName)}. Handoffs go to ${cfg.webhook ? "your handoff webhook" : "the list below (set HANDOFF_WEBHOOK_URL to forward them to Support Desk or any inbox webhook)"}. AI wording: ${esc(cfg.llm)}.</p>
<p>Embed the chat on your site: <code>${esc(`<script src="${cfg.base}/widget.js" defer></script>`)}</code></p>

<h2>What customers asked that no article answered</h2>
${gaps.length ? `<table><tr><th>Question</th><th>Times</th><th>Said it did not help</th><th>Last</th></tr>${gaps.map((g) => `<tr><td>${esc(g.q)}</td><td>${g.n}</td><td>${g.unhelpful}</td><td>${new Date(g.last).toISOString().slice(0, 10)}</td></tr>`).join("")}</table>` : `<p class="note">Nothing yet.</p>`}

<h2>Handoffs waiting</h2>
${state.handoffs.length ? `<table><tr><th>When</th><th>From</th><th>Question</th><th>Sent on</th></tr>${state.handoffs.slice(-30).reverse().map((h) => `<tr><td>${new Date(h.at).toISOString().slice(0, 16).replace("T", " ")}</td><td>${esc(h.name)} &lt;${esc(h.email)}&gt;</td><td>${esc(h.question)}</td><td>${h.forwarded ? "yes" : "no"}</td></tr>`).join("")}</table>` : `<p class="note">None.</p>`}

<h2>Recent questions</h2>
<p><a href="/admin/log.csv">Download the log (CSV)</a>. Email addresses and long numbers are masked before anything is stored.</p>
<table><tr><th>When</th><th>Question</th><th>Did</th><th>Article</th><th>Confidence</th><th>Helped?</th></tr>${recent.map((r) => `<tr><td>${new Date(r.at).toISOString().slice(5, 16).replace("T", " ")}</td><td>${esc(r.q)}</td><td>${esc(r.action)}</td><td>${esc(r.article)}</td><td>${r.confidence}</td><td>${r.helpful === null ? "" : r.helpful ? "yes" : "no"}</td></tr>`).join("")}</table>

<h2>Knowledge</h2>
<form method="post" action="/admin/knowledge"><p class="note">Markdown articles separated by a line of <code>=====</code>, each starting with <code># Title</code> or front matter (<code>title</code>, <code>slug</code>, <code>url</code>). A Help Keeper export (JSON) works too.${cfg.kbSource ? ` <button formaction="/admin/sync">Import from ${esc(cfg.kbSource)}</button>` : ""}</p>
<label for="kb">Articles</label><textarea id="kb" name="knowledge" rows="14">${esc(state.knowledge)}</textarea>
<label for="syn">Synonyms: one group per line, every word read as the first (optional)</label><textarea id="syn" name="synonyms" rows="3">${esc(state.synonyms)}</textarea>
<p><button>Save knowledge</button></p></form>

<h2>Past questions (makes answers much better)</h2>
<form method="post" action="/admin/examples"><p class="note">Questions customers really asked, as <code>question,label</code> lines, where label is the article slug that answered it or <code>handoff</code> if a person had to. On the BANKING77 benchmark, 40 per topic took right answers from 3% to 47% of questions (README).</p>
<label for="ex">Past questions</label><textarea id="ex" name="examples" rows="8">${esc(state.examples)}</textarea><p><button>Save past questions</button></p></form>

<h2>Test questions and the confidence bar</h2>
<form method="post" action="/admin/tests"><p class="note"><code>question,expect</code> lines, where expect is the right article slug (several joined by <code>|</code>) or <code>handoff</code>. Run them to see what the agent would do and which bar keeps wrong answers at or under 5% of answers. Keep them different from the past questions.</p>
<label for="tests">Test questions</label><textarea id="tests" name="tests" rows="8">${esc(state.tests)}</textarea>
<p><button name="do" value="save">Save</button> <button name="do" value="run">Save and run</button> <button name="do" value="bar">Run and use the recommended bar</button> <button name="do" value="calibrate">Fit the confidence model to these (30+)</button></p></form>
${report ? `<pre>${esc(reportText(report))}</pre>` : ""}

<h2>Settings</h2>
<form method="post" action="/admin/settings"><p><label>Name <input type="text" name="name" value="${esc(state.settings.name)}"></label> <label>Contact email <input type="text" name="contact" value="${esc(state.settings.contact)}"></label></p>
<p><label>Answer bar <input type="number" step="0.001" min="0" max="1.01" name="bar" value="${cfg.bar}"></label> <label>Suggest bar <input type="number" step="0.001" min="0" max="1.01" name="suggestBar" value="${cfg.suggestBar}"></label> <label><input type="checkbox" name="resetCalibration" value="1"> Go back to the built-in confidence model</label></p>
<p><button>Save settings</button></p></form>
<p class="note">Server time ${new Date(now).toISOString()}.</p>${DISCLAIMER}</body></html>`;
}
