// Server-rendered HTML for Survey Keeper. Plain pages, no scripts; every
// user-supplied string passes through esc().
import { questionsToText, responsesFor, summarize } from "./survey.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `:root{font:16px/1.5 system-ui,sans-serif;color:#1c2030;background:#f6f7fb}body{max-width:760px;margin:auto;padding:22px}a{color:#2342b8}h1{font-size:1.6rem;margin:.2em 0 .4em;color:#14204f}h2{font-size:1.1rem;margin:0 0 8px;color:#14204f}.card{background:#fff;border:1px solid #dde1ec;border-radius:12px;padding:18px;margin:14px 0}fieldset{border:0;padding:0;margin:0}legend{font-weight:600;padding:0;margin-bottom:6px}.opts{display:flex;flex-wrap:wrap;gap:6px}.opts label{border:1px solid #b5bdd6;border-radius:8px;padding:6px 11px;cursor:pointer;background:#fff}.opts label:has(input:checked){background:#2342b8;color:#fff;border-color:#2342b8}.opts input{position:absolute;opacity:0;width:1px;height:1px}.opts label:has(input:focus-visible){outline:3px solid #f5a623}.stack label{display:block;border:0;padding:3px 0;background:none}.stack input{position:static;opacity:1;width:auto;margin-right:8px}.scale{display:flex;justify-content:space-between;font-size:.8rem;color:#46506b;margin-top:4px}textarea,input[type=text]{width:100%;box-sizing:border-box;padding:9px;border:1px solid #b5bdd6;border-radius:7px;font:inherit}textarea{min-height:90px}button,.btn{background:#2342b8;color:#fff;border:0;border-radius:8px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}button.sec{background:#fff;color:#2342b8;border:1px solid #2342b8}.err{color:#a3191f;font-weight:600;margin:4px 0}.note,footer{font-size:.85rem;color:#46506b}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e6f1}.bar{background:#e3e6f1;border-radius:4px;height:14px;min-width:60px}.bar i{display:block;height:14px;border-radius:4px;background:#2342b8}.big{font-size:2.4rem;font-weight:700;color:#14204f;line-height:1}.pos{color:#13703a}.neg{color:#a3191f}.hp{position:absolute;left:-9999px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}`;

const page = (title, body, { noindex = true, sponsor = false } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${noindex ? '<meta name="robots" content="noindex">' : ""}<style>${CSS}</style></head><body><main>${body}</main>${sponsor ? `<footer>Made with <a href="https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/survey-keeper">Survey Keeper</a>, free and open source. <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the author</a>.</footer>` : ""}</body></html>`;

function field(q, errors, vals) {
  const err = errors[q.id] ? `<p class="err" role="alert">${esc(errors[q.id])}</p>` : "";
  const req = q.required ? " (required)" : "";
  const legend = `<legend>${esc(q.label)}${req}</legend>`;
  let ctl;
  if (q.type === "nps" || q.type === "rating") {
    const [lo, hi] = q.type === "nps" ? [0, 10] : [1, 5];
    ctl = `<div class="opts">${Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((n) => `<label><input type="radio" name="${q.id}" value="${n}"${String(vals[q.id]) === String(n) ? " checked" : ""}>${n}</label>`).join("")}</div><div class="scale"><span>${q.type === "nps" ? "Not at all likely" : "Poor"}</span><span>${q.type === "nps" ? "Extremely likely" : "Excellent"}</span></div>`;
  } else if (q.type === "single") ctl = `<div class="opts stack">${q.options.map((o) => `<label><input type="radio" name="${q.id}" value="${esc(o)}"${vals[q.id] === o ? " checked" : ""}>${esc(o)}</label>`).join("")}</div>`;
  else if (q.type === "multi") { const got = [].concat(vals[q.id] || []); ctl = `<div class="opts stack">${q.options.map((o) => `<label><input type="checkbox" name="${q.id}" value="${esc(o)}"${got.includes(o) ? " checked" : ""}>${esc(o)}</label>`).join("")}</div>`; }
  else ctl = `<textarea name="${q.id}" maxlength="1000" aria-label="${esc(q.label)}">${esc(vals[q.id] || "")}</textarea>`;
  return `<fieldset class="card">${legend}${err}${ctl}</fieldset>`;
}

export function surveyPage(cfg, s, { errors = {}, vals = {}, ref = "" } = {}) {
  if (s.status !== "open") return page(s.title, `<h1>${esc(s.title)}</h1><p>This survey is closed. Thank you for your interest.</p>`, { sponsor: cfg.sponsor });
  return page(s.title, `<h1>${esc(s.title)}</h1>${s.intro ? `<p>${esc(s.intro)}</p>` : ""}${Object.keys(errors).length ? '<p class="err" role="alert">Some answers need attention.</p>' : ""}<form method="post" action="/s/${esc(s.slug)}">${s.questions.map((q) => field(q, errors, vals)).join("")}<input type="hidden" name="ref" value="${esc(ref)}"><div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div><button type="submit">Send</button></form><p class="note">Answers are anonymous: no name, email or address is collected unless you type one.</p>`, { sponsor: cfg.sponsor });
}
export const thanksPage = (cfg, s) => page(s.title, `<h1>${esc(s.title)}</h1><p>${esc(s.thanks)}</p>`, { sponsor: cfg.sponsor });
export const notFound = () => page("Not found", "<h1>Not found</h1><p>That survey does not exist.</p>");

export function adminPage(cfg, state, base, msg = "") {
  const rows = Object.values(state.surveys).sort((a, b) => b.created - a.created).map((s) => {
    const rs = responsesFor(state, s.id), q = s.questions.find((x) => x.type === "nps"), n = q ? summarize(s, rs).questions.find((x) => x.type === "nps") : null;
    return `<tr><td><a href="/admin/s/${s.id}/results">${esc(s.title)}</a><br><span class="note">${esc(base)}/s/${esc(s.slug)}</span></td><td>${s.status}</td><td>${rs.length}</td><td>${n && n.nps != null ? n.nps : "—"}</td><td><a href="/admin/s/${s.id}">edit</a></td></tr>`;
  }).join("");
  return page("Admin · Survey Keeper", `<h1>Surveys</h1>${msg ? `<p class="err">${esc(msg)}</p>` : ""}<div class="card"><table><tr><th>Survey</th><th>Status</th><th>Responses</th><th>NPS</th><th></th></tr>${rows || '<tr><td colspan="5">No surveys yet.</td></tr>'}</table></div><p><a class="btn" href="/admin/new">New survey</a> <a class="btn sec" href="/admin/export.json">Download everything (JSON)</a></p>`);
}

const TEMPLATE = "nps*: How likely are you to recommend us to a friend or colleague?\ntext: What is the main reason for your score?\nrating: How easy was it to get started?\nsingle: How often do you use us? | Daily | Weekly | Monthly | Rarely\nmulti: Which features matter most to you? | Search | Export | Integrations | Support";

export function editPage(cfg, state, s, err = "", f = null) {
  const v = f || (s ? { ...s, questions: questionsToText(s.questions) } : { title: "", slug: "", intro: "", thanks: "", status: "open", questions: TEMPLATE });
  return page(s ? "Edit survey" : "New survey", `<h1>${s ? "Edit survey" : "New survey"}</h1>${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}<form method="post" action="/admin/save" class="card">${s ? `<input type="hidden" name="id" value="${s.id}">` : ""}<label for="t"><b>Title</b></label><input type="text" id="t" name="title" value="${esc(v.title)}" maxlength="120" required><p></p><label for="i"><b>Introduction</b> (optional)</label><textarea id="i" name="intro" maxlength="500" style="min-height:60px">${esc(v.intro)}</textarea><p></p><label for="q"><b>Questions</b>, one per line: <code>type: label | option | option</code>. Types: nps, rating, single, multi, text. A star after the type (<code>nps*</code>) makes it required.</label><textarea id="q" name="questions" style="min-height:190px;font:14px ui-monospace,monospace" spellcheck="false">${esc(v.questions)}</textarea><p></p><label for="th"><b>Thank-you message</b></label><input type="text" id="th" name="thanks" value="${esc(v.thanks)}" maxlength="300"><p></p><label for="sl"><b>Address</b> (letters, numbers, dashes)</label><input type="text" id="sl" name="slug" value="${esc(v.slug)}" maxlength="60"><p></p><label for="st"><b>Status</b></label><select id="st" name="status"><option value="open"${v.status !== "closed" ? " selected" : ""}>open</option><option value="closed"${v.status === "closed" ? " selected" : ""}>closed</option></select><p></p><button type="submit">Save</button> <a href="/admin">Cancel</a></form>${s ? `<form method="post" action="/admin/s/${s.id}/delete" class="card"><p>Deleting removes the survey and all ${responsesFor(state, s.id).length} responses.</p><button class="sec" type="submit">Delete survey</button></form>` : ""}`);
}

const bar = (pct) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
const sign = (n) => (n == null ? "—" : n > 0 ? `+${n}` : String(n));
const cls = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

export function resultsPage(cfg, state, s, base) {
  const sum = summarize(s, responsesFor(state, s.id));
  const body = sum.questions.map((q) => {
    let inner = "";
    if (q.type === "nps") {
      const pc = (x) => (q.n ? Math.round((x / q.n) * 100) : 0);
      inner = `<div class="row"><div><div class="big ${cls(q.nps)}">${sign(q.nps)}</div><div class="note">NPS${q.ci ? ` (95% range ${sign(q.ci[0])} to ${sign(q.ci[1])})` : ""}</div></div><div class="note">${q.promoters} promoters (${pc(q.promoters)}%) · ${q.passives} passives (${pc(q.passives)}%) · ${q.detractors} detractors (${pc(q.detractors)}%) · ${q.n} answers</div></div>${q.n < 30 ? '<p class="note">Fewer than 30 answers: treat the score as a rough signal, the range above shows how wide it is.</p>' : ""}<table>${q.dist.map((c, i) => `<tr><td>${i}</td><td style="width:70%">${bar(q.n ? (c / Math.max(...q.dist)) * 100 : 0)}</td><td>${c}</td></tr>`).join("")}</table>${q.byRef.length ? `<h2>By source (<code>?ref=</code>)</h2><table><tr><th>Source</th><th>Answers</th><th>NPS</th></tr>${q.byRef.map((r) => `<tr><td>${esc(r.ref)}</td><td>${r.n}</td><td class="${cls(r.nps)}">${sign(r.nps)}</td></tr>`).join("")}</table>` : ""}${q.byDay.length > 1 ? `<h2>By day</h2><table><tr><th>Day (UTC)</th><th>Answers</th><th>NPS</th></tr>${q.byDay.slice(-14).map((r) => `<tr><td>${r.day}</td><td>${r.n}</td><td class="${cls(r.nps)}">${sign(r.nps)}</td></tr>`).join("")}</table>` : ""}`;
    } else if (q.type === "rating") inner = `<p>Average <b>${q.mean ?? "—"}</b> of 5 from ${q.answered} answers</p><table>${q.dist.map((c, i) => `<tr><td>${i + 1}</td><td style="width:70%">${bar(q.answered ? (c / q.answered) * 100 : 0)}</td><td>${c}</td></tr>`).join("")}</table>`;
    else if (q.type === "single" || q.type === "multi") inner = `<table>${q.counts.map((c) => `<tr><td>${esc(c.option)}</td><td style="width:50%">${bar(c.pct)}</td><td>${c.count} (${c.pct}%)</td></tr>`).join("")}</table>`;
    else inner = `${q.themes.length ? `<h2>What people mention</h2><table><tr><th>Word</th><th>Comments</th><th>Detractors vs promoters</th></tr>${q.themes.map((t) => `<tr><td>${esc(t.term)}</td><td>${t.count}</td><td>${t.lift == null ? "—" : t.lift >= 1.5 ? `<span class="neg">${t.lift}× more from detractors</span>` : t.lift <= 0.67 ? `<span class="pos">${t.lift}× (promoter word)</span>` : "even"}</td></tr>`).join("")}</table>` : ""}<h2>Latest comments</h2>${q.recent.map((r) => `<p>“${esc(r.text)}”${r.group ? ` <span class="note">(${r.group})</span>` : ""}</p>`).join("") || "<p class='note'>None yet.</p>"}`;
    return `<section class="card"><h2>${esc(q.label)}</h2><p class="note">${q.answered} of ${sum.total} answered</p>${inner}</section>`;
  }).join("");
  return page(`Results · ${s.title}`, `<p><a href="/admin">← All surveys</a></p><h1>${esc(s.title)}</h1><p class="note">${sum.total} responses${sum.first ? `, ${sum.first} to ${sum.last}` : ""} · public link <a href="${esc(base)}/s/${esc(s.slug)}">${esc(base)}/s/${esc(s.slug)}</a> · add <code>?ref=email</code> to tag a channel</p><p><a class="btn sec" href="/admin/s/${s.id}/responses.csv">Download CSV</a> <a class="btn sec" href="/admin/s/${s.id}">Edit</a></p>${body}<section class="card"><h2>Embed</h2><pre>&lt;iframe src="${esc(base)}/s/${esc(s.slug)}" width="100%" height="600" style="border:0"&gt;&lt;/iframe&gt;</pre><p class="note">Add the embedding site's origin to <code>EMBED_ORIGINS</code> first.</p></section>`);
}
