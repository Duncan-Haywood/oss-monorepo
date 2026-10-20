// Server-rendered HTML for the admin and affiliate portal, plus CSV and the
// tracking snippet. Everything user-supplied goes through esc().
import { isPastHold } from "./engine.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const money = (cents, cur) => `${cents < 0 ? "-" : ""}${(Math.abs(cents) / 100).toFixed(2)} ${esc(String(cur || "usd").toUpperCase())}`;
const moneyMap = (m) => { const e = Object.entries(m || {}); return e.length ? e.map(([c, v]) => money(v, c)).join(", ") : "0.00"; };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

const css = `:root{font:16px system-ui,sans-serif;color:#1b1f2a;background:#f3f7f5}body{max-width:980px;margin:auto;padding:24px}a{color:#0f6b55}h1{font-size:1.6rem;color:#0b3d31;margin:0 0 12px}h2{font-size:1.1rem;color:#0b3d31;margin:22px 0 8px}table{border-collapse:collapse;width:100%;font-size:.9rem;background:#fff}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3eeea;vertical-align:top}input,select{padding:7px;border:1px solid #a9c4ba;border-radius:6px;font:inherit}button{border:0;border-radius:7px;padding:8px 12px;background:#0f6b55;color:#fff;font-weight:700;cursor:pointer}.note{font-size:.85rem;color:#3f4f4a}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:end}label{font-size:.85rem;font-weight:600;display:block}code{background:#e6f0ec;padding:1px 5px;border-radius:4px}pre{background:#eef5f2;padding:10px;border-radius:8px;overflow-x:auto;font-size:.82rem}`;

export const layout = (title, body, { company, hideSponsor } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${css}</style></head><body><main>${body}</main><footer class="note"><p>${company ? `${esc(company)} referral programme. ` : ""}No warranty; figures are from Stripe events this server received and are not tax or financial advice.${hideSponsor ? "" : ` Powered by <a href="https://github.com/Duncan-Haywood/fp-monorepo/tree/main/ventures/referral-keeper">Referral Keeper</a> (MIT) &middot; <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the author</a>`}</p></footer></body></html>`;

// Everything a link-sharing affiliate needs to see about their own account.
export function portalPage(state, a, bal, prog, now, { publicUrl, siteUrl, company, hideSponsor }) {
  const link = siteUrl ? `${siteUrl.replace(/\/$/, "")}/?ref=${a.code}` : null;
  const mine = Object.values(state.commissions).filter((c) => c.affiliateId === a.id && c.status !== "void").sort((x, y) => y.at - x.at).slice(0, 100);
  const b = bal[a.id];
  const rows = mine.map((c) => `<tr><td>${day(c.at)}</td><td>${esc(c.source === "manual" ? c.ref || "adjustment" : c.source)}</td><td>${money(c.base, c.currency)}</td><td>${money(c.amount, c.currency)}</td><td>${c.paid > 0 && c.paid === c.amount ? "paid" : isPastHold(c, prog, now) ? "payable" : `held until ${day(c.at + prog.holdDays * 86_400_000)}`}</td></tr>`).join("");
  return layout(`${a.name} — referral dashboard`, `<h1>Hi ${esc(a.name)}</h1>
${a.status !== "active" ? `<p><strong>Your account is ${esc(a.status)}.</strong> Referrals are not tracked until it is active.</p>` : ""}
<p>Your referral code: <code>${esc(a.code)}</code>${link ? `<br>Your link: <a href="${esc(link)}">${esc(link)}</a>` : ""}</p>
<p class="note">Keep this page's address private: it is your login. Commission is ${esc(a.percent ?? prog.percent)}% of what a customer you referred pays, excluding tax${(a.months === undefined ? prog.months : a.months) === null ? ", for as long as they stay" : `, for their first ${esc(a.months === undefined ? prog.months : a.months)} payments`}. Refunded or disputed payments are taken back. New commission is held ${prog.holdDays} days before it becomes payable${prog.minPayout ? `; payouts start at ${money(prog.minPayout, Object.keys(b.due)[0] || "usd")}` : ""}.</p>
<table><tbody><tr><th>Clicks</th><td>${b.clicks}</td><th>Customers</th><td>${b.customers}</td></tr><tr><th>Earned</th><td>${moneyMap(b.earned)}</td><th>Payable now</th><td>${moneyMap(b.due)}</td></tr><tr><th>Held</th><td>${moneyMap(b.pending)}</td><th>Paid out</th><td>${moneyMap(b.paid)}</td></tr></tbody></table>
<h2>Recent commissions</h2><table><thead><tr><th>Date</th><th>Type</th><th>Sale (net of tax)</th><th>Commission</th><th>Status</th></tr></thead><tbody>${rows || `<tr><td colspan="5">Nothing yet.</td></tr>`}</tbody></table>`, { company, hideSponsor });
}

export function joinPage({ company, hideSponsor, message = "", needsApproval }) {
  return layout("Join the referral programme", `<h1>${company ? esc(company) + ": " : ""}join the referral programme</h1>${message}<form method="post" action="/join"><div class="row"><div><label for="n">Your name</label><input id="n" name="name" required maxlength="80"></div><div><label for="e">Email (for payouts)</label><input id="e" name="email" type="email" required></div><div><label for="c">Code (optional)</label><input id="c" name="code" pattern="[a-z0-9_-]{3,32}" placeholder="yourname"></div><button>Join</button></div></form><p class="note">${needsApproval ? "New affiliates are reviewed before their links start tracking." : "Your link starts tracking straight away."} You are responsible for disclosing the affiliate relationship wherever you share your link, and for your own taxes on what you earn.</p>`, { company, hideSponsor });
}

export function adminPage(state, bal, prog, now, { company, publicUrl, siteUrl, hideSponsor, dryRun, joinOpen }) {
  const affs = Object.values(state.affiliates).sort((a, b) => b.createdAt - a.createdAt);
  const arows = affs.map((a) => {
    const b = bal[a.id];
    const next = a.status === "active" ? "paused" : "active";
    return `<tr><td>${esc(a.name)}<br><span class="note">${esc(a.email)}</span></td><td><code>${esc(a.code)}</code></td><td>${esc(a.percent ?? prog.percent)}%</td><td>${a.months === undefined ? "default" : a.months === null ? "lifetime" : esc(a.months) + " mo"}</td><td>${esc(a.status)}</td><td>${b.clicks}</td><td>${b.customers}</td><td>${moneyMap(b.earned)}</td><td>${moneyMap(b.due)}</td><td><a href="${esc(publicUrl)}/a/${esc(a.portal)}">portal</a><form method="post" action="/admin/affiliates/${esc(a.id)}/status" style="display:inline"><input type="hidden" name="status" value="${next}"><button>${next === "active" ? "approve" : "pause"}</button></form></td></tr>`;
  }).join("");
  const pays = Object.values(state.payouts).sort((a, b) => b.at - a.at).slice(0, 50);
  const aff = (id) => state.affiliates[id];
  const prows = pays.map((p) => `<tr><td>${day(p.at)}</td><td>${esc(aff(p.affiliateId)?.name)}</td><td>${money(p.amount, p.currency)}</td><td>${esc(p.status)}${p.reference ? ` (${esc(p.reference)})` : ""}</td><td>${p.status === "open" ? `<form method="post" action="/admin/payouts/${esc(p.id)}/paid"><input name="reference" placeholder="payment reference"><button>mark paid</button></form><form method="post" action="/admin/payouts/${esc(p.id)}/void" style="display:inline"><button>cancel</button></form>` : ""}</td></tr>`).join("");
  const snippet = esc(`<script src="${publicUrl}/r.js" defer></script>`);
  return layout("Referral Keeper admin", `<h1>Referral Keeper${company ? ` — ${esc(company)}` : ""}</h1>
<p class="note">${dryRun ? "Records only: this server never sends money. " : ""}Programme: ${esc(prog.percent)}% for ${prog.months === null ? "life" : esc(prog.months) + " payments"}, held ${prog.holdDays} days, minimum payout ${money(prog.minPayout, "usd")}. Public sign-up is ${joinOpen ? `<strong>open</strong> at <a href="/join">/join</a> (new affiliates wait for your approval)` : "closed"}.</p>
<h2>Affiliates</h2><table><thead><tr><th>Name</th><th>Code</th><th>%</th><th>Window</th><th>Status</th><th>Clicks</th><th>Customers</th><th>Earned</th><th>Payable</th><th></th></tr></thead><tbody>${arows || `<tr><td colspan="10">No affiliates yet.</td></tr>`}</tbody></table>
<form method="post" action="/admin/affiliates"><div class="row"><div><label for="an">Name</label><input id="an" name="name" required></div><div><label for="ae">Email</label><input id="ae" name="email" type="email" required></div><div><label for="ac">Code</label><input id="ac" name="code" placeholder="auto"></div><div><label for="ap">% override</label><input id="ap" name="percent" size="4"></div><div><label for="am">Months override (0 = lifetime)</label><input id="am" name="months" size="4"></div><button>Add affiliate</button></div></form>
<h2>Payouts</h2><form method="post" action="/admin/payouts"><button>Create payouts for everyone over the minimum</button> <a href="/admin/payouts.csv">download open payouts (CSV)</a></form>
<table><thead><tr><th>Date</th><th>Affiliate</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${prows || `<tr><td colspan="5">None yet.</td></tr>`}</tbody></table>
<h2>Wire it up</h2><p>1. Add to your marketing site: <code>${snippet}</code>${siteUrl ? "" : ` (set SITE_URL so affiliates see a ready-made link)`}<br>2. Stripe Payment Links are tagged automatically. For Checkout Sessions you create, pass <code>client_reference_id: "ref_" + code</code> (the cookie is read with <code>referralKeeper.clientReferenceId()</code>).<br>3. Stripe webhook to <code>${esc(publicUrl)}/webhook/stripe</code> for <code>checkout.session.completed</code>, <code>checkout.session.async_payment_succeeded</code>, <code>invoice.paid</code>, <code>charge.refunded</code>, <code>charge.dispute.created</code>, <code>charge.dispute.closed</code>.</p>`, { company, hideSponsor });
}

const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Mass-payment style sheet: one line per open payout.
export function payoutsCsv(state, payouts) {
  const lines = ["payout_id,affiliate,email,amount,currency,note"];
  for (const p of payouts) {
    const a = state.affiliates[p.affiliateId] || {};
    lines.push([p.id, a.name, a.email, (p.amount / 100).toFixed(2), String(p.currency).toUpperCase(), `Referral commission ${new Date(p.at).toISOString().slice(0, 10)}`].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

// Served at /r.js and run on the seller's own page, so the cookie is first-party there.
export const trackerJs = (publicUrl) => `(function(){
var s=document.currentScript||{},d=s.dataset||{},days=Number(d.days)||60,param=d.param||"ref",first=d.attribution==="first",C="rk_ref";
var re=/^[a-z0-9_-]{3,32}$/;
function get(){var m=document.cookie.match(/(?:^|; )rk_ref=([^;]+)/);return m?m[1]:null}
function set(v){document.cookie=C+"="+v+";max-age="+days*86400+";path=/;SameSite=Lax"+(location.protocol==="https:"?";Secure":"")}
try{var v=(new URLSearchParams(location.search).get(param)||"").toLowerCase();
if(re.test(v)&&!(first&&get())){set(v);var u=${JSON.stringify(publicUrl)}+"/v1/click?code="+encodeURIComponent(v);if(navigator.sendBeacon)navigator.sendBeacon(u);else(new Image()).src=u}}catch(e){}
function cri(){var r=get();return r?"ref_"+r:null}
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;
try{var u=new URL(a.href);if(u.hostname!=="buy.stripe.com"&&u.hostname!=="donate.stripe.com")return;var r=cri();if(r&&!u.searchParams.has("client_reference_id")){u.searchParams.set("client_reference_id",r);a.href=u.toString()}}catch(x){}},true);
window.referralKeeper={ref:get,clientReferenceId:cri};
})();
`;
