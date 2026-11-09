/**
 * The launch path: the order a first-time clothing brand meets each question,
 * and which free page here answers it. One list drives `launch.html` and the
 * "Next on the launch path" block on every tool page (`linkjourney.mjs`
 * rewrites that block; `journey.test.mjs` fails if a page is missing from the
 * path, a link is dead, or a block is stale).
 *
 * The order is a judgement from how a small brand's decisions depend on each
 * other (you cannot price before you can cost; you cannot cost before you know
 * the minimum order), not a legal or industry standard. Stages are not strictly
 * sequential: sample rounds and pre-orders overlap.
 */
export const STAGES = [
  { id: "design", title: "1. Design the thing", why: "Everything downstream (cost, size run, safety tests) depends on what you are making.",
    pages: [["./", "Design studio: voice, typing or drag"], ["sunglasses.html", "Sunglasses designer"], ["wardrobe.html", "Capsule wardrobe planner"], ["fit.html", "Size finder and size run"], ["camera.html", "Try it on from a photo"]] },
  { id: "cost", title: "2. Know what one piece costs", why: "Landed cost is the floor under every price and every minimum-order decision.",
    pages: [["how-much-does-it-cost-to-make-a-t-shirt.html", "Worked example: what a t-shirt costs"], ["bom.html", "Bill of materials and order"], ["quotes.html", "Compare factory quotes"], ["tiers.html", "Fabric price tiers"], ["shrink.html", "Fabric shrinkage allowance"], ["freight.html", "Freight per garment"], ["duty.html", "Import duty by destination"], ["import-duty-on-clothing.html", "Worked example: duty on a hoodie"], ["parcel.html", "Duty on a single parcel"], ["fx.html", "Factory currency risk"]] },
  { id: "price", title: "3. Set the price", why: "A price has to survive VAT, fees, returns and discounts before it is a margin.",
    pages: [["prices.html", "Price by market"], ["pricepoint.html", "Best price from a price test"], ["returns.html", "Returns: what an order really earns"], ["discount.html", "Discount: orders a sale needs"], ["bundle.html", "Set pricing: is a bundle discount worth it?"],  ["repeat.html", "Repeat customers: what can you pay to win one?"], ["wholesale.html", "Wholesale price"], ["sunglasses-profit-margin.html", "Worked example: sunglasses margin"]] },
  { id: "commit", title: "4. Commit to a first run", why: "The factory minimum is the first real risk: how many can you sell, and what if you cannot?",
    pages: [["orderlines.html", "Colour and size order matrix"], ["preorder.html", "Pre-order planner"], ["clothing-minimum-order-quantity.html", "Worked example: reaching a 300-piece MOQ"], ["pod.html", "Factory run or print-on-demand"], ["startup.html", "Start-up budget"], ["cashflow.html", "Launch cash flow"]] },
  { id: "make", title: "5. Make it and check it", why: "Dates, specifications and inspection are where a first run usually goes wrong.",
    pages: [["timeline.html", "Production timeline"], ["tna.html", "Time and action calendar"], ["spec.html", "Measurement spec and sample check"], ["testing.html", "Safety tests to ask for"], ["inspection.html", "Final inspection sample size"], ["labels.html", "Label checker"], ["barcodes.html", "Barcodes (GTIN)"]] },
  { id: "sell", title: "6. Sell it and keep selling", why: "Tax, channels and reorders decide whether the first run turns into a business.",
    pages: [["channels.html", "Where to sell"], ["salestax.html", "US sales tax"], ["eutax.html", "EU VAT and one-stop shop"], ["eprfr.html", "French textile eco-contribution"], ["linesheet.html", "Wholesale line sheet"], ["partners.html", "Partner-brand commission"], ["reorder.html", "Reorder planner"]] },
];

/** Pages that are not tools on the path: the hub itself and the landing page. */
export const NOT_TOOLS = new Set(["launch.html", "for-independent-clothing-designers.html"]);

export const allPages = () => STAGES.flatMap(s => s.pages.map(([href, label]) => ({ href, label, stage: s.id })));

/** Stage and neighbours of a page, or null if it is not on the path. */
export function placeOf(href) {
  const all = allPages();
  const i = all.findIndex(p => p.href === href);
  if (i < 0) return null;
  const stage = STAGES.find(s => s.id === all[i].stage);
  return { stage, index: i, prev: all[i - 1] || null, next: all[i + 1] || null, siblings: stage.pages.filter(([h]) => h !== href) };
}

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const MARK = ["<!-- journey -->", "<!-- /journey -->"];

/** The footer block for one page. */
export function journeyBlock(href) {
  const p = placeOf(href);
  if (!p) return "";
  const link = x => `<a href="${esc(x.href)}">${esc(x.label)}</a>`;
  const sib = p.siblings.slice(0, 4).map(([h, l]) => link({ href: h, label: l })).join(" · ");
  return `${MARK[0]}
  <nav class="journey" aria-label="Launch path" style="margin-top:24px;padding:12px 14px;border:1px solid #ddd2c4;border-radius:12px;background:#fffdf9;font-size:.9rem;line-height:1.55">
    <strong>${esc(p.stage.title)}</strong> on the <a href="launch.html">launch path for a clothing line</a>.
    ${sib ? `<div>Also at this stage: ${sib}</div>` : ""}
    <div>${p.prev ? `Before: ${link(p.prev)}` : ""}${p.prev && p.next ? " · " : ""}${p.next ? `Next: ${link(p.next)}` : ""}</div>
  </nav>
  ${MARK[1]}`;
}

/** Insert or refresh the block before `</main>`; returns the new text. */
export function withJourney(html, href) {
  const block = journeyBlock(href);
  const re = new RegExp(`\\s*${MARK[0]}[\\s\\S]*?${MARK[1]}\\n?`);
  const stripped = html.replace(re, "");
  if (!block) return stripped;
  const at = stripped.lastIndexOf("</main>");
  if (at < 0) throw new Error(`${href} has no </main>`);
  return `${stripped.slice(0, at)}  ${block}\n${stripped.slice(at)}`;
}

/** Body of launch.html's stage list. */
export function hubHtml() {
  return STAGES.map(s => `  <section id="${s.id}">
    <h2>${esc(s.title)}</h2>
    <p>${esc(s.why)}</p>
    <ul>
${s.pages.map(([h, l]) => `      <li><a href="${esc(h)}">${esc(l)}</a></li>`).join("\n")}
    </ul>
  </section>`).join("\n");
}
