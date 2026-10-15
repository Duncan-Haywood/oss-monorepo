// Server-rendered pages. Every dynamic value goes through esc().
import { list, summary, slaState, refOf, STATUSES, PRIORITIES, suggest, renderMacro } from "./desk.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const when = (t) => new Date(t).toISOString().replace("T", " ").slice(0, 16);
const dur = (ms) => { const m = Math.round(ms / 60_000); return m < 90 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };

const shell = (cfg, title, body, { sponsor = cfg.sponsor } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>:root{font:16px system-ui,sans-serif;color:#1c2030;background:#f6f7fb}body{max-width:1040px;margin:auto;padding:24px}a{color:#2342b8}.card{background:#fff;border:1px solid #dde1ec;border-radius:12px;padding:18px;margin:16px 0}label{display:block;font-weight:600;margin:10px 0 4px}input,select,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #b5bdd6;border-radius:6px;font:inherit}button{padding:7px 14px;border:0;border-radius:6px;background:#2342b8;color:#fff;font:inherit;cursor:pointer}button.alt{background:#e3e6f1;color:#1c2030}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e6f1;vertical-align:top}pre{background:#eef0f8;padding:10px;border-radius:8px;overflow-x:auto;font-size:.82rem;white-space:pre-wrap}.muted{color:#46506b;font-size:.85rem}form.inline{display:inline}.msg{border-left:4px solid #b5bdd6;padding:6px 12px;margin:12px 0;white-space:pre-wrap}.msg.out{border-color:#2342b8;background:#f1f4ff}.msg.note{border-color:#d9a400;background:#fff8e1}.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.78rem;background:#e3e6f1}.pill.overdue,.pill.high{background:#fbd9db;color:#8a1118}.pill.soon{background:#fff0c2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.grid div{background:#eef0f8;border-radius:8px;padding:10px}.grid b{display:block;font-size:1.4rem}</style></head><body><main>
<h1><a href="/admin" style="text-decoration:none;color:inherit">${esc(cfg.company)} · support desk</a></h1>${body}
<p class="muted">No warranty; no delivery or uptime guarantee. Review replies before sending; priority and spam flags are heuristics.${sponsor ? ` <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the author</a>.` : ""}</p></main></body></html>`;

const opts = (vals, cur) => vals.map((v) => `<option${v === cur ? " selected" : ""}>${esc(v)}</option>`).join("");

export function adminPage(cfg, state, base, q, now) {
  const status = STATUSES.includes(q.status) || q.status === "all" ? q.status : "open";
  const rows = list(state, { status, q: q.q || "", mailbox: q.mailbox || "", assignee: q.assignee || "" }, now).slice(0, 200).map((t) => {
    const s = slaState(t, state.mailboxes[t.mailbox] || {}, now);
    const last = t.messages[t.messages.length - 1];
    return `<tr><td>#${t.n}</td><td><a href="/admin/t/${t.n}">${esc(t.subject)}</a><div class="muted">${esc(t.requester.name || t.requester.email)} · ${esc(last.text.slice(0, 90))}</div></td><td><span class="pill ${esc(t.priority)}">${esc(t.priority)}</span></td><td>${esc(t.assignee || "—")}</td><td>${["overdue", "soon"].includes(s.state) ? `<span class="pill ${s.state}">${s.state === "overdue" ? `overdue ${dur(now - s.due)}` : `due in ${dur(s.due - now)}`}</span>` : s.state === "missed" ? `<span class="muted">missed</span>` : ""}</td><td>${esc(when(t.updated))}</td></tr>`;
  }).join("");
  const sum = summary(state, now);
  const boxes = Object.values(state.mailboxes);
  const tabs = ["open", "pending", "closed", "spam", "all"].map((s) => (s === status ? `<b>${s}${s !== "all" ? ` (${sum.by[s]})` : ""}</b>` : `<a href="/admin?status=${s}">${s}${s !== "all" ? ` (${sum.by[s]})` : ""}</a>`)).join(" · ");
  const boxRows = boxes.map((m) => `<tr><td>${esc(m.name)}</td><td><code>${esc(base)}/in/${esc(m.inboundToken)}</code></td><td><code>${esc(base)}/m/${esc(m.id)}</code></td><td>${m.slaHours} h</td></tr>`).join("");
  return shell(cfg, `${cfg.company} support desk`, `
<div class="card"><div class="grid"><div><b>${sum.by.open}</b>open</div><div><b>${sum.overdue}</b>past first-reply target</div><div><b>${sum.by.pending}</b>waiting on customer</div><div><b>${sum.medianFirstResponseMin === null ? "—" : dur(sum.medianFirstResponseMin * 60_000)}</b>median first reply</div><div><b>${sum.slaMetPct === null ? "—" : `${sum.slaMetPct}%`}</b>replied in target</div></div>${sum.topTags.length ? `<p class="muted">Top tags: ${sum.topTags.map(([g, n]) => `<a href="/admin?status=all&q=${encodeURIComponent(g)}">${esc(g)}</a> ${n}`).join(", ")}</p>` : ""}</div>
<div class="card"><p>${tabs} · <a href="/admin/macros">Saved replies (${state.macros.length})</a> · <a href="/admin/export.csv">Export CSV</a></p>
<form method="get" action="/admin"><input type="hidden" name="status" value="${esc(status)}"><input name="q" value="${esc(q.q || "")}" placeholder="Search subject, sender, tag or message" aria-label="Search"></form>
<table><tr><th>#</th><th>Ticket</th><th>Priority</th><th>Assignee</th><th>First reply</th><th>Updated (UTC)</th></tr>${rows || `<tr><td colspan="6">${boxes.length ? "No tickets here." : "No mailbox yet. Create one below, then forward your support address to its inbound URL."}</td></tr>`}</table></div>
<div class="card"><h2>Mailboxes</h2>${boxes.length ? `<table><tr><th>Name</th><th>Inbound email webhook</th><th>Contact form endpoint</th><th>Reply target</th></tr>${boxRows}</table>` : ""}
<form method="post" action="/admin/mailboxes"><label for="name">New mailbox name</label><input id="name" name="name" required maxlength="80" placeholder="Support">
<label for="replyTo">Support address (replies come from MAIL_FROM; customers reply to this)</label><input id="replyTo" name="replyTo" type="email" placeholder="support@yourcompany.com">
<label for="slaHours">First reply target in hours (high priority gets a quarter, low gets double)</label><input id="slaHours" name="slaHours" type="number" min="1" max="720" value="24">
<label for="origins">Contact form allowed sites (space separated; empty = any)</label><input id="origins" name="origins">
<label for="ack">Acknowledgement text emailed when a ticket opens (optional)</label><textarea id="ack" name="ack" rows="3" maxlength="1000"></textarea>
<p><button>Create mailbox</button></p></form></div>`);
}

export function ticketPage(cfg, state, t, base, now, { macroId = "" } = {}) {
  const mb = state.mailboxes[t.mailbox] || {};
  const s = slaState(t, mb, now);
  const thread = t.messages.map((m) => `<div class="msg ${esc(m.dir)}"><div class="muted">${m.dir === "note" ? "Internal note" : m.dir === "out" ? "Reply" : "Customer"} · ${esc(m.from)} · ${esc(when(m.at))}</div>${esc(m.text)}</div>`).join("");
  const lastIn = [...t.messages].reverse().find((m) => m.dir === "in");
  const sug = suggest(`${t.subject}\n${lastIn?.text || ""}`, state.macros);
  const chosen = state.macros.find((m) => m.id === macroId);
  const vars = { name: t.requester.name || t.requester.email.split("@")[0], ticket: refOf(t), company: cfg.company };
  const draft = chosen ? renderMacro(chosen.body, vars) : "";
  return shell(cfg, `#${t.n} ${t.subject}`, `
<p><a href="/admin">&larr; all tickets</a></p>
<div class="card"><h2>${esc(refOf(t))} ${esc(t.subject)}</h2>
<p class="muted">${esc(t.requester.name ? `${t.requester.name} <${t.requester.email}>` : t.requester.email)} · ${esc(mb.name || t.mailbox)} · opened ${esc(when(t.created))} UTC · <span class="pill">${esc(t.status)}</span> <span class="pill ${esc(t.priority)}">${esc(t.priority)}</span>${s.state === "overdue" ? ` <span class="pill overdue">first reply overdue</span>` : ""}</p>
${t.reasons.length ? `<p class="muted">Flagged because: ${esc(t.reasons.join("; "))}</p>` : ""}${thread}</div>
<div class="card"><h2>Reply</h2>
${sug.length ? `<p class="muted">Suggested saved replies: ${sug.map((x) => `<a href="/admin/t/${t.n}?macro=${esc(x.macro.id)}#reply">${esc(x.macro.title)}</a> (${Math.round(x.score * 100)}% match)`).join(" · ")}</p>` : state.macros.length ? "" : `<p class="muted">No saved replies yet; <a href="/admin/macros">add some</a> and the best match is suggested here.</p>`}
<form method="post" action="/admin/t/${t.n}/reply" id="reply"><label for="text">Message to ${esc(t.requester.email)}</label><textarea id="text" name="text" rows="7" required maxlength="20000">${esc(draft)}</textarea>
<label for="after">After sending</label><select id="after" name="after">${opts(["pending", "closed", "open"], "pending")}</select>
<p><button>Send reply</button> <span class="muted">${cfg.dryRun ? "Email is in dry-run: the reply is saved here but not emailed." : "Emailed through your own Resend account."}</span></p></form>
<form method="post" action="/admin/t/${t.n}/note"><label for="note">Internal note (never sent)</label><textarea id="note" name="text" rows="2" required maxlength="20000"></textarea><p><button class="alt">Add note</button></p></form></div>
<div class="card"><h2>Details</h2><form method="post" action="/admin/t/${t.n}/update">
<label for="status">Status</label><select id="status" name="status">${opts(STATUSES, t.status)}</select>
<label for="priority">Priority</label><select id="priority" name="priority">${opts(PRIORITIES, t.priority)}</select>
<label for="assignee">Assignee</label><input id="assignee" name="assignee" value="${esc(t.assignee)}" maxlength="40">
<label for="tags">Tags (space or comma separated)</label><input id="tags" name="tags" value="${esc(t.tags.join(" "))}">
<p><button>Save</button> <span class="muted">Customer link: <code>${esc(base)}/t/${esc(t.token)}</code></span></p></form>
<form method="post" action="/admin/t/${t.n}/delete" onsubmit="return confirm('Delete this ticket?')"><button class="alt">Delete ticket</button></form></div>`);
}

export function macrosPage(cfg, state) {
  const rows = state.macros.map((m) => `<tr><td><b>${esc(m.title)}</b><div class="muted">${esc(m.keywords)}</div></td><td><pre>${esc(m.body)}</pre></td><td><form class="inline" method="post" action="/admin/macros/${esc(m.id)}/delete"><button class="alt">Delete</button></form></td></tr>`).join("");
  return shell(cfg, "Saved replies", `<p><a href="/admin">&larr; tickets</a></p>
<div class="card"><h2>Saved replies</h2><p class="muted">Variables: <code>{{name}}</code>, <code>{{ticket}}</code>, <code>{{company}}</code>. The ticket page suggests the closest matches to the customer's message by keyword weight.</p>
<table><tr><th>Title</th><th>Body</th><th></th></tr>${rows || `<tr><td colspan="3">None yet.</td></tr>`}</table></div>
<div class="card"><h2>New saved reply</h2><form method="post" action="/admin/macros"><label for="title">Title</label><input id="title" name="title" required maxlength="80">
<label for="keywords">Words that should trigger it (optional)</label><input id="keywords" name="keywords" maxlength="200" placeholder="refund, money back, charged">
<label for="body">Body</label><textarea id="body" name="body" rows="6" required maxlength="5000">Hi {{name}},\n\n\n\nThanks,\n{{company}} support</textarea><p><button>Save</button></p></form></div>`);
}

export function customerPage(cfg, state, t, notice = "") {
  const mb = state.mailboxes[t.mailbox] || {};
  const thread = t.messages.filter((m) => m.dir !== "note").map((m) => `<div class="msg ${esc(m.dir)}"><div class="muted">${m.dir === "out" ? esc(cfg.company) : "You"} · ${esc(when(m.at))} UTC</div>${esc(m.text)}</div>`).join("");
  return shell({ ...cfg, sponsor: false }, `${refOf(t)} ${t.subject}`, `<div class="card"><h2>${esc(refOf(t))} ${esc(t.subject)}</h2><p class="muted">Status: ${esc(t.status === "closed" ? "closed" : t.status === "pending" ? "waiting for you" : "open")} · ${esc(mb.name || "")}</p>${notice ? `<p><b>${esc(notice)}</b></p>` : ""}${thread}
<form method="post"><label for="text">Reply</label><textarea id="text" name="text" rows="5" required maxlength="20000"></textarea><p><button>Send</button></p></form></div>`);
}

export const thanksPage = (cfg, t) => shell({ ...cfg, sponsor: false }, "Thanks", `<div class="card"><h2>Thanks, we got it.</h2><p>Your ticket is ${esc(refOf(t))}. We will reply by email.</p></div>`);
