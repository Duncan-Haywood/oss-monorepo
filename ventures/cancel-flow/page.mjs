// The hosted page a customer lands on from your "Cancel subscription" button.
// Plain HTML plus a small inline script; every dynamic string goes through
// textContent, never innerHTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function renderCancelPage({ company, color, reasons, returnUrl, dryRun }) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : "#4338ca";
  const opts = Object.entries(reasons).map(([k, v], i) => `<label class="opt"><input type="radio" name="reason" value="${esc(k)}"${i === 0 ? " required" : ""}> ${esc(v.label)}</label>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Cancel your subscription — ${esc(company)}</title>
<style>:root{font:16px system-ui,sans-serif;color:#1b1f2a;background:#f6f6fb}body{max-width:520px;margin:6vh auto;padding:0 20px}
.card{background:#fff;border:1px solid #dcdbec;border-radius:14px;padding:24px}h1{font-size:1.4rem;margin:0 0 12px}
.opt{display:block;padding:10px 12px;border:1px solid #dcdbec;border-radius:9px;margin:8px 0;cursor:pointer}
textarea{width:100%;box-sizing:border-box;border:1px solid #b4b3d1;border-radius:8px;padding:9px;font:inherit;margin-top:8px}
button,a.btn{display:inline-block;border:0;border-radius:8px;padding:11px 16px;background:${accent};color:#fff;font:700 15px system-ui;cursor:pointer;margin:12px 8px 0 0;text-decoration:none}
button.quiet{background:none;color:#4a4a63;text-decoration:underline;padding-left:0}.banner{background:#fff4d6;border:1px solid #e8c766;padding:8px 12px;border-radius:8px;font-size:.88rem;margin-bottom:12px}
.err{color:#a11;margin-top:10px}[hidden]{display:none}.offer{font-size:1.15rem;font-weight:700;margin:6px 0 14px}</style></head><body><div class="card">
${dryRun ? '<div class="banner">Test mode: nothing you choose here changes your real subscription.</div>' : ""}
<section id="s1"><h1>Sorry to see you go</h1><p>What is the main reason you want to cancel? It takes ten seconds and we read every answer.</p>
<form id="f1">${opts}<label for="comment" style="display:block;margin-top:10px">Anything else we should know? (optional)</label><textarea id="comment" maxlength="500" rows="3"></textarea>
<button type="submit">Continue</button><button type="button" class="quiet" id="keep0">Never mind, keep my subscription</button></form></section>
<section id="s2" hidden><h1 id="t2"></h1><p class="offer" id="offer"></p><p id="sub2"></p><a id="help" class="btn" hidden>Contact support</a><button id="accept" hidden>Yes, do that instead</button><button class="quiet" id="decline">No thanks, cancel my subscription</button></section>
<section id="s3" hidden><h1 id="t3"></h1><p id="p3"></p><a id="back" class="btn" hidden>Back to ${esc(company)}</a></section>
<p class="err" id="err" role="alert"></p></div>
<script>
const base=location.pathname.replace(/\\/$/,"");const $=(i)=>document.getElementById(i);const RETURN=${JSON.stringify(returnUrl || "")};
const show=(n)=>{for(const i of ["s1","s2","s3"])$(i).hidden=i!==n};
async function post(step,body){$("err").textContent="";const r=await fetch(base+"/"+step,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body||{})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Something went wrong. Please try again.");return j}
const done=(t,p)=>{$("t3").textContent=t;$("p3").textContent=p;if(/^https:\\/\\//.test(RETURN)){$("back").href=RETURN;$("back").hidden=false}show("s3")};
$("f1").addEventListener("submit",async(e)=>{e.preventDefault();try{const j=await post("answer",{reason:new FormData(e.target).get("reason"),comment:$("comment").value});
if(j.action==="offer"){$("t2").textContent="Before you go";$("offer").textContent=j.text;$("sub2").textContent=j.detail||"";$("accept").hidden=j.offer.type==="help";
if(j.offer.type==="help"&&/^https?:\\/\\//.test(j.offer.url||"")){$("help").href=j.offer.url;$("help").hidden=false}show("s2")}
else{const c=await post("cancel");done("Your subscription is canceled",c.text)}}catch(x){$("err").textContent=x.message}});
$("accept").addEventListener("click",async()=>{try{const j=await post("accept");done("Done — you are staying",j.text)}catch(x){$("err").textContent=x.message}});
$("decline").addEventListener("click",async()=>{try{const j=await post("cancel");done("Your subscription is canceled",j.text)}catch(x){$("err").textContent=x.message}});
$("keep0").addEventListener("click",async()=>{try{await post("keep");done("Nothing changed","Your subscription continues as before.")}catch(x){$("err").textContent=x.message}});
</script></body></html>`;
}
