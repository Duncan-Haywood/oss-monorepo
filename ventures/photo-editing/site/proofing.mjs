// Client proofing set: the cull page's picks as web-size JPEGs plus a
// self-contained gallery page the client opens from the zip, hearts the
// frames they want, and sends back as a plain list of file names. The
// cull page reads that list back and labels the matching frames.
//
// Pure functions only (no DOM), so the page and the tests share them.
// Nothing here uploads anything: the set is a zip the photographer sends
// however they like. A hosted share link is the planned paid tier
// (portfolio/monetization/models.yaml, photo-editing).

const numeric = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** The frames that go to the client: rated at least `minRating`, not rejected, with a preview. */
export function proofingFrames(items, { minRating = 1, label = "" } = {}) {
  return items
    .filter((it) => !it.rejected && it.preview && !it.error)
    .filter((it) => (label ? it.label === label : (it.rating || 0) >= minRating))
    .sort((a, b) => numeric(a.name, b.name));
}

const stemOf = (name) => { const d = name.lastIndexOf("."); return d > 0 ? name.slice(0, d) : name; };
// Characters that are unsafe in a zip entry or a URL path on any OS.
const safe = (s) => s.replace(/[\\/:*?"<>|#%\u0000-\u001f]/g, "_").replace(/^\.+/, "_") || "_";

/**
 * Proof file names, one per frame, in order: `<stem>.jpg`, with `-2`, `-3`
 * … where two raws share a stem (IMG_0001.CR3 and IMG_0001.JPG). The
 * client's list carries these names, and readFavourites maps them back.
 */
export function proofNames(names) {
  const used = new Set(), out = [];
  for (const n of names) {
    const base = safe(stemOf(n));
    let name = `${base}.jpg`, k = 2;
    while (used.has(name.toLowerCase())) name = `${base}-${k++}.jpg`;
    used.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** Output size for a w x h image with its long edge capped at `longEdge` (never enlarged). */
export function fitSize(w, h, longEdge) {
  const s = Math.min(1, longEdge / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/**
 * Where a text watermark goes on a W x H proof: bottom right, font about
 * 3.2% of the short edge (min 12 px), a margin of half the font size.
 */
export function watermarkLayout(W, H) {
  const size = Math.max(12, Math.round(Math.min(W, H) * 0.032));
  const margin = Math.round(size / 2);
  return { size, x: W - margin, y: H - margin, align: "right", baseline: "bottom" };
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const LIST_HEADER = "ShootFlow favourites";

/**
 * The gallery page, as one HTML string with no outside requests: it shows
 * photos/<file> for each frame, a heart per frame (kept in the client's
 * browser), and copies or downloads the list of hearted files.
 * frames: [{ file, original, w, h }]. Every text is escaped; the frame
 * list is embedded as JSON with `<` escaped so a name cannot end the script.
 */
export function galleryHtml({ title = "Proofs", by = "", note = "", frames = [] } = {}) {
  const data = JSON.stringify(frames.map((f) => ({ f: f.file, o: f.original, w: f.w, h: f.h }))).replace(/</g, "\\u003c");
  const key = "shootflow-proof-" + hash(title + "|" + frames.map((f) => f.file).join("|"));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#57534e;--card:#fff;--line:#e7e5e4;--accent:#be123c}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--card:#292524;--line:#44403c;--accent:#fb7185}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:20px 16px 8px;max-width:1200px;margin:0 auto}h1{margin:0 0 4px;font-size:1.5rem}p{margin:4px 0;color:var(--muted)}
.bar{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;max-width:1200px;margin:0 auto}
button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
main{max-width:1200px;margin:0 auto;padding:12px 16px 40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:12px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
figure.on{outline:3px solid var(--accent)}
img{display:block;width:100%;height:auto;background:var(--line);cursor:zoom-in}
figcaption{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;font-size:.9rem;color:var(--muted);gap:8px}
figcaption span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.heart{border:0;background:none;font-size:1.5rem;line-height:1;padding:4px;color:var(--muted)}.on .heart{color:var(--accent)}
#big{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;z-index:5}
#big.show{display:flex}#big img{max-width:100vw;max-height:100vh;width:auto;cursor:zoom-out}
#big .heart{position:fixed;bottom:16px;right:16px;font-size:2.4rem;color:#fff}#big.on .heart{color:#fb7185}
#out{width:100%;max-width:1200px;margin:0 auto;display:none;padding:0 16px}#out textarea{width:100%;font:14px ui-monospace,monospace}
</style>
</head>
<body>
<header>
<h1>${esc(title)}</h1>
${by ? `<p>From ${esc(by)}</p>` : ""}
${note ? `<p>${esc(note)}</p>` : ""}
<p>Tap the heart on each photo you want. Your hearts are kept in this browser. When you are done, press “Copy my list” and paste it into a reply, or download the list and send the file.</p>
</header>
<div class="bar"><strong id="count">0 of 0</strong><button class="primary" id="copy">Copy my list</button><button id="save">Download list (.txt)</button><button id="only">Show hearted only</button></div>
<div id="out"><textarea id="txt" rows="6" readonly></textarea></div>
<main id="g"></main>
<div id="big" role="dialog" aria-label="Large view"><img id="bigimg" alt=""><button class="heart" id="bigheart" aria-label="Heart this photo">♥</button></div>
<script>
(function(){
var F=${data},K=${JSON.stringify(key)},S={},only=false,cur=-1;
try{S=JSON.parse(localStorage.getItem(K)||"{}")||{}}catch(e){}
function save(){try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}}
var g=document.getElementById("g");
F.forEach(function(x,i){
 var fig=document.createElement("figure");fig.id="p"+i;
 var im=document.createElement("img");im.loading="lazy";im.src="photos/"+encodeURIComponent(x.f);im.width=x.w;im.height=x.h;im.alt=x.f;
 im.onclick=function(){show(i)};
 var cap=document.createElement("figcaption"),sp=document.createElement("span");sp.textContent=x.f;
 var b=document.createElement("button");b.className="heart";b.type="button";b.textContent="\\u2665";b.setAttribute("aria-label","Heart "+x.f);
 b.onclick=function(){tog(i)};
 cap.appendChild(sp);cap.appendChild(b);fig.appendChild(im);fig.appendChild(cap);g.appendChild(fig);
});
function list(){return F.filter(function(x){return S[x.f]}).map(function(x){return x.f})}
function text(){return ${JSON.stringify(LIST_HEADER)}+" \\u2014 "+document.title+"\\n"+list().join("\\n")+"\\n"}
function draw(){
 F.forEach(function(x,i){var e=document.getElementById("p"+i);e.className=S[x.f]?"on":"";e.style.display=only&&!S[x.f]?"none":""});
 document.getElementById("count").textContent=list().length+" of "+F.length+" hearted";
 document.getElementById("big").className=(cur>=0?"show":"")+(cur>=0&&S[F[cur].f]?" on":"");
}
function tog(i){var f=F[i].f;if(S[f])delete S[f];else S[f]=1;save();draw()}
function show(i){cur=i;var b=document.getElementById("bigimg");b.src="photos/"+encodeURIComponent(F[i].f);b.alt=F[i].f;draw()}
document.getElementById("bigimg").onclick=function(){cur=-1;draw()};
document.getElementById("bigheart").onclick=function(){if(cur>=0)tog(cur)};
document.addEventListener("keydown",function(e){if(cur<0)return;if(e.key==="Escape"){cur=-1;draw()}else if(e.key==="ArrowRight"&&cur<F.length-1)show(cur+1);else if(e.key==="ArrowLeft"&&cur>0)show(cur-1);else if(e.key===" "){e.preventDefault();tog(cur)}});
document.getElementById("only").onclick=function(){only=!only;this.textContent=only?"Show all":"Show hearted only";draw()};
document.getElementById("copy").onclick=function(){
 var t=text(),o=document.getElementById("out"),a=document.getElementById("txt");a.value=t;o.style.display="block";
 if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){document.getElementById("copy").textContent="Copied"},function(){a.select()})}else{a.select()}
};
document.getElementById("save").onclick=function(){
 var u=URL.createObjectURL(new Blob([text()],{type:"text/plain"})),a=document.createElement("a");a.href=u;a.download="favourites.txt";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},2000);
};
draw();
})();
</script>
</body>
</html>
`;
}

// FNV-1a, enough to give each set its own storage key.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/**
 * Reads a client's list back. Accepts what the gallery copies (a header
 * line, then one proof name per line) and what people type or paste
 * instead: original raw names, stems, names separated by commas or
 * spaces, numbers like "0412" that end one frame's stem, bullets and
 * quotes. `proofs` is [{ file, original }] as written into the set;
 * `others` is optional extra original names (frames not in the set).
 * Returns { matched: [original], unknown: [token], ambiguous: [token] }.
 */
export function readFavourites(text, proofs, others = []) {
  const byKey = new Map();
  const add = (k, orig) => { const key = k.toLowerCase(); const s = byKey.get(key) || new Set(); s.add(orig); byKey.set(key, s); };
  const all = [...proofs.map((p) => ({ file: p.file, original: p.original })), ...others.map((o) => ({ file: null, original: o }))];
  for (const p of all) {
    if (p.file) { add(p.file, p.original); add(stemOf(p.file), p.original); }
    add(p.original, p.original); add(stemOf(p.original), p.original);
  }
  const matched = [], seen = new Set(), unknown = [], ambiguous = [];
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith(LIST_HEADER)) continue;
    const whole = clean(line);
    const tokens = byKey.has(whole.toLowerCase()) ? [whole] : line.split(/[\s,;]+/).map(clean).filter(Boolean);
    for (const t of tokens) {
      let hit = byKey.get(t.toLowerCase());
      if (!hit && /^\d{2,}$/.test(t)) {
        // A bare frame number: the frames whose stem ends in it.
        hit = new Set(all.filter((p) => new RegExp(`(^|\\D)0*${t.replace(/^0+/, "")}$`).test(stemOf(p.original))).map((p) => p.original));
        if (!hit.size) hit = null;
      }
      if (!hit) { unknown.push(t); continue; }
      if (hit.size > 1) { ambiguous.push(t); continue; }
      const o = [...hit][0];
      if (!seen.has(o)) { seen.add(o); matched.push(o); }
    }
  }
  return { matched, unknown, ambiguous };
}

function clean(t) {
  return t.replace(/^[-*•·\d]+[.)]\s+/, "").replace(/^["'“”‘’(\[]+|["'“”‘’)\].]+$/g, "").replace(/^[-*•·]\s*/, "").trim();
}
