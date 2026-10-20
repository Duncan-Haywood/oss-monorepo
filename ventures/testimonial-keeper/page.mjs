// Server-rendered collection page and admin page.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const color = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#7c3aed");

const shell = (c, title, body, extraHead = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font:16px system-ui,sans-serif;max-width:36rem;margin:2.5rem auto;padding:0 1rem;color:#111827}h1{color:${color(c)};font-size:1.5rem}label{display:block;font-weight:600;margin:.8rem 0 .2rem}
input,textarea,select,button{font:inherit;padding:.55rem .7rem;border-radius:8px;border:1px solid #9ca3af;width:100%;box-sizing:border-box}input[type=checkbox]{width:auto}button{background:${color(c)};color:#fff;border:0;font-weight:700;cursor:pointer;margin-top:1rem}
.hp{position:absolute;left:-9999px;height:0;overflow:hidden}.note{font-size:.85rem;color:#4b5563}.err{color:#b91c1c;font-weight:700}.card{border:1px solid #e5e7eb;border-radius:10px;padding:.8rem 1rem;margin:.7rem 0}
.row button{width:auto;margin:.3rem .3rem 0 0;padding:.3rem .7rem}</style>${extraHead}</head><body>${body}</body></html>`;

export function renderForm({ form, company, color: c, error }) {
  return shell(c, form.title, `<h1>${esc(form.title)}</h1><p>${esc(form.prompt)}</p>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<form method="post" action="/t/${esc(form.slug)}"><label for="name">Your name</label><input id="name" name="name" required maxlength="80" autocomplete="name">
<label for="role">Role (optional)</label><input id="role" name="role" maxlength="80"><label for="company">Company (optional)</label><input id="company" name="company" maxlength="80">
<label for="rating">Rating (optional)</label><select id="rating" name="rating"><option value="">No rating</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} out of 5</option>`).join("")}</select>
<label for="text">Your testimonial</label><textarea id="text" name="text" rows="6" required minlength="20" maxlength="600"></textarea>
<label for="email">Email (optional, never published)</label><input id="email" name="email" type="email" maxlength="120" autocomplete="email">
<div class="hp" aria-hidden="true"><label>Leave blank<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label style="font-weight:400"><input type="checkbox" name="consent" value="on" required> I agree that ${esc(company)} may publish my words and name above on its website and marketing.</label>
<button>Send</button></form><p class="note">${esc(company)} reviews every testimonial before anything is published and does not edit what you wrote.</p>`);
}

export function renderThanks({ company, color: c }) {
  return shell(c, "Thank you", `<h1>Thank you</h1><p>${esc(company)} has your testimonial. It will only appear on their site after they review it.</p>`);
}

// The admin page holds no secrets: it asks for the admin key in the browser and calls the API.
export function renderAdmin({ company, color: c }) {
  return shell(c, `Testimonials · ${company}`, `<h1>${esc(company)} testimonials</h1><label for="k">Admin key</label><input id="k" type="password" autocomplete="off"><button id="go" type="button">Load</button>
<div id="out"></div><p class="note">Approve what you want public; hide the rest. Text is never edited here, only shown or not.</p>
<script>
var out=document.getElementById("out");
function el(t,x){var e=document.createElement(t);if(x)e.textContent=x;return e}
function call(m,p,b){return fetch(p,{method:m,headers:{authorization:"Bearer "+document.getElementById("k").value},body:b?JSON.stringify(b):undefined}).then(function(r){return r.json()})}
function load(){call("GET","/v1/testimonials").then(function(list){out.textContent="";if(!Array.isArray(list)){out.appendChild(el("p","Wrong key."));return}
list.slice().reverse().forEach(function(t){var c=el("div");c.className="card";c.appendChild(el("strong",t.name+(t.company?" · "+t.company:"")+" · "+t.status+(t.rating?" · "+t.rating+"/5":"")));c.appendChild(el("p",t.text));
var row=el("div");row.className="row";["approved","hidden","pending"].forEach(function(s){if(s===t.status)return;var b=el("button",s==="approved"?"Approve":s==="hidden"?"Hide":"Back to pending");b.type="button";b.onclick=function(){call("POST","/v1/testimonials/"+t.id+"/status",{status:s}).then(load)};row.appendChild(b)});c.appendChild(row);out.appendChild(c)})})}
document.getElementById("go").onclick=load;
</script>`);
}
