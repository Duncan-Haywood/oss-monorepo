/**
 * A self-deployable storefront: one static HTML file generated from one or
 * more designs. The designer uploads it to any static host (GitHub Pages,
 * Cloudflare Pages, Netlify, their own server).
 *
 * Money handling is the deployer's, never ours. Checkout is off by default:
 * with no payment link a product shows "Order by email" (a mailto with the
 * size filled in). With the deployer's own payment link (a Stripe Payment
 * Link, a PayPal.me or Lemon Squeezy URL; https only) it shows a Buy button.
 * We hold no keys, take no payments and send nothing anywhere; the file has
 * no scripts from other sites and no trackers.
 *
 * What it will not say: stock ("limited") unless the run is small, a ship
 * date nobody gave, or return terms the designer has not typed. The policy
 * block is the designer's text, and an empty one is flagged in `warnings`.
 */

import { GARMENTS, FABRICS } from "./catalogue.mjs";
import { SIZES } from "./design.mjs";
import { renderDesign, esc } from "./render.mjs";
import { productDescription } from "./launchkit.mjs";

export const CURRENCIES = { EUR: "€", USD: "$", GBP: "£" };

const slug = s => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";

/** https URLs only, so a pasted `javascript:` link can never become a button. */
export function safeHttps(url) {
  try {
    const u = new URL(String(url).trim());
    return u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}

const validEmail = e => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(String(e ?? "").trim());

const money = (n, cur) => `${CURRENCIES[cur] ?? ""}${Number(n).toFixed(2)}${CURRENCIES[cur] ? "" : " " + cur}`;

/**
 * options: brand, email, currency ("EUR"|"USD"|"GBP"), paymentLinks
 * ({ [designName or slug]: url }), shipping, returns, about, preOrder
 * (true: "Pre-order", the usual case for a made-to-order run).
 * Returns { html, warnings, products }.
 */
export function storefront(designs, options = {}) {
  const warnings = [];
  const cur = CURRENCIES[options.currency] ? options.currency : "EUR";
  const brand = String(options.brand ?? "").trim() || "Your brand";
  if (brand === "Your brand") warnings.push("Set your brand name.");
  const email = validEmail(options.email) ? options.email.trim() : null;
  const preOrder = options.preOrder !== false;
  const links = options.paymentLinks ?? {};
  const shipping = String(options.shipping ?? "").trim();
  const returns = String(options.returns ?? "").trim();
  const about = String(options.about ?? "").trim();
  if (!shipping) warnings.push("Type your shipping terms (cost, countries, time); the page states none for you.");
  if (!returns) warnings.push("Type your returns and cancellation terms; consumer law in your market may require specific wording.");
  if (!email && !Object.values(links).some(safeHttps)) warnings.push("No contact email and no payment link: buyers have no way to order.");
  if (options.email && !email) warnings.push("The contact email does not look valid.");

  const products = designs.map((design, i) => {
    const handle = slug(design.name);
    const link = safeHttps(links[handle] ?? links[design.name] ?? "");
    if ((links[handle] ?? links[design.name]) && !link) warnings.push(`${design.name}: payment link ignored (must start with https://).`);
    const sizes = SIZES.filter(s => design.sizes[s]);
    const g = GARMENTS[design.garment];
    const f = FABRICS[design.fabric];
    const hasBack = design.placements.some(p => p.area === "back");
    return { design, handle, link, sizes, g, f, hasBack, uid: `p${i}` };
  });
  if (!products.length) warnings.push("No designs: add at least one.");
  const seen = new Set();
  for (const p of products) { if (seen.has(p.handle)) warnings.push(`Two designs share the name "${p.design.name}"; rename one.`); seen.add(p.handle); }

  const card = p => {
    const { design, handle, link, sizes, g, f, hasBack, uid } = p;
    const price = money(design.price, cur);
    const subject = encodeURIComponent(`${preOrder ? "Pre-order" : "Order"}: ${design.name}`);
    const mailto = size => `mailto:${esc(email)}?subject=${subject}&amp;body=${encodeURIComponent(`I would like to order ${design.name}, size ${size}.\n\nName and delivery address:\n`).replace(/&/g, "&amp;")}`;
    const sizeButtons = sizes.map((s, k) => `<label class="sz"><input type="radio" name="size-${handle}" value="${esc(s)}"${k === 0 ? " checked" : ""}><span>${esc(s)}</span></label>`).join("");
    const action = link
      ? `<a class="buy" href="${esc(link)}" rel="noopener">${preOrder ? "Pre-order" : "Buy"} for ${esc(price)}</a><p class="note">Opens the seller's own checkout. Tell them your size in the order note: <b data-size-for="${handle}">${esc(sizes[0] ?? "")}</b>.</p>`
      : email
        ? `<a class="buy" data-mail="${handle}" href="${mailto(sizes[0] ?? "")}">${preOrder ? "Pre-order" : "Order"} by email · ${esc(price)}</a>`
        : `<span class="buy off">Ordering is not set up yet</span>`;
    return `<article class="card" id="${handle}" itemscope itemtype="https://schema.org/Product">
  <div class="art">${renderDesign(design, { side: "front", uid: `${uid}f` })}${hasBack ? renderDesign(design, { side: "back", uid: `${uid}b` }) : ""}</div>
  <h2 itemprop="name">${esc(design.name)}</h2>
  <p class="meta">${esc(design.colourName)} ${esc(g.label.toLowerCase())} · ${design.gsm} gsm ${esc(f.label.toLowerCase())}</p>
  <p itemprop="description">${esc(productDescription(design))}</p>
  <p class="price">${esc(price)} <span class="muted">${preOrder ? "pre-order, made in a run" : ""}</span></p>
  <fieldset><legend>Size</legend>${sizeButtons}</fieldset>
  ${action}
</article>`;
  };

  const ld = products.map(p => ({
    "@type": "Product",
    name: p.design.name,
    description: productDescription(p.design),
    brand: { "@type": "Brand", name: brand },
    offers: {
      "@type": "Offer",
      price: Number(p.design.price).toFixed(2),
      priceCurrency: cur,
      availability: preOrder ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
    },
  }));
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@graph": ld }).replace(/</g, "\\u003c");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(brand)}: ${esc(products.map(p => p.design.name).slice(0, 3).join(", ") || "shop")}</title>
<meta name="description" content="${esc(brand)}: ${esc(products.map(p => p.design.name).join(", "))}. Small-run clothing, ordered direct from the designer.">
<script type="application/ld+json">${jsonLd}</script>
<style>
:root{--bg:#faf8f4;--fg:#1c1b19;--muted:#6b675f;--line:#ddd8cd;--accent:#1c1b19}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--fg:#f1eee8;--muted:#a39e93;--line:#34312c;--accent:#f1eee8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 Georgia,serif}
header,main,footer{max-width:62rem;margin:0 auto;padding:1rem}
h1{font-size:1.6rem;margin:.5rem 0}h2{font-size:1.2rem;margin:.5rem 0 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(17rem,1fr));gap:1.25rem}
.card{border:1px solid var(--line);border-radius:10px;padding:1rem}
.art{display:flex;gap:.25rem}.art svg{width:50%;height:auto}.art svg:only-child{width:100%}
.meta,.muted,.note{color:var(--muted);font-size:.9rem}.price{font-size:1.2rem;font-weight:700}
fieldset{border:0;padding:0;margin:.5rem 0}legend{font-size:.85rem;color:var(--muted)}
.sz{display:inline-block;margin:0 .25rem .25rem 0}.sz input{position:absolute;opacity:0}
.sz span{display:inline-block;min-width:2.5rem;text-align:center;padding:.35rem .6rem;border:1px solid var(--line);border-radius:6px;cursor:pointer}
.sz input:checked+span{background:var(--accent);color:var(--bg)}.sz input:focus-visible+span{outline:2px solid #2f7de1}
.buy{display:block;text-align:center;padding:.7rem;border-radius:8px;background:var(--accent);color:var(--bg);text-decoration:none;font-weight:700}
.buy.off{opacity:.5}
footer{color:var(--muted);font-size:.9rem;border-top:1px solid var(--line);margin-top:2rem}
</style>
</head>
<body>
<header><h1>${esc(brand)}</h1>${about ? `<p>${esc(about)}</p>` : ""}</header>
<main><div class="grid">
${products.map(card).join("\n")}
</div></main>
<footer>
${shipping ? `<h3>Shipping</h3><p>${esc(shipping)}</p>` : ""}
${returns ? `<h3>Returns and cancellations</h3><p>${esc(returns)}</p>` : ""}
${email ? `<p>Questions: <a href="mailto:${esc(email)}">${esc(email)}</a></p>` : ""}
<p class="muted">Made with the free Clothing Design Studio. The seller handles payment, delivery and tax; the studio's makers take no part in any sale. No cookies, no trackers on this page.</p>
</footer>
<script>
document.querySelectorAll('input[type=radio][name^="size-"]').forEach(function(r){r.addEventListener('change',function(){
var h=r.name.slice(5),a=document.querySelector('[data-mail="'+h+'"]'),b=document.querySelector('[data-size-for="'+h+'"]');
if(a)a.href=a.href.replace(/size(%20|\\+| )[^.]*?\\./,'size%20'+encodeURIComponent(r.value)+'.');
if(b)b.textContent=r.value;});});
</script>
</body>
</html>
`;
  return { html, warnings, products: products.map(p => ({ name: p.design.name, handle: p.handle, price: p.design.price, sizes: p.sizes, checkout: p.link ? "payment-link" : email ? "email" : "none" })) };
}
