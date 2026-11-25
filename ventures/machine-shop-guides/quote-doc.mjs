/**
 * The customer-facing quote: what a shop sends back to the buyer once the
 * quote calculator (quote.mjs) has priced each quantity break.
 *
 * What goes on it, and what deliberately does not:
 *   - on it: shop and customer, quote number and date, the buyer's RFQ
 *     reference, part number AND revision (a quote against the wrong revision
 *     is the classic dispute), material and finish, price each and extended
 *     price at every quantity, lead time, validity, payment and shipping
 *     terms, and the shop's own notes and exclusions;
 *   - never on it: the cost lines (material, setup, machining, markup). Those
 *     are the shop's internal numbers; the calculator keeps showing them.
 *
 * Unit prices are rounded UP to the cent, and the extended price is that unit
 * price times the quantity, so the document adds up line by line and never
 * quotes below the calculated price. Every value is the user's input or
 * arithmetic on it; the module states no rate, term or lead time of its own.
 */

const str = (v) => String(v ?? "").trim();

export const META_FIELDS = [
  { key: "shopName", label: "Your shop" },
  { key: "shopAddress", label: "Shop address", long: true },
  { key: "shopContact", label: "Quoted by" },
  { key: "shopEmail", label: "Email" },
  { key: "shopPhone", label: "Phone" },
  { key: "customer", label: "Customer" },
  { key: "customerContact", label: "Attention" },
  { key: "rfqRef", label: "Customer RFQ or reference" },
  { key: "quoteNumber", label: "Quote number" },
  { key: "date", label: "Quote date" },
  { key: "validDays", label: "Valid for (days)" },
  { key: "partNumber", label: "Part number" },
  { key: "revision", label: "Revision" },
  { key: "description", label: "Description" },
  { key: "material", label: "Material" },
  { key: "finish", label: "Finish" },
  { key: "leadTime", label: "Lead time" },
  { key: "paymentTerms", label: "Payment terms" },
  { key: "shipping", label: "Shipping" },
  { key: "notes", label: "Notes and exclusions", long: true },
];

export function normaliseMeta(meta = {}) {
  const out = {};
  for (const f of META_FIELDS) out[f.key] = str(meta[f.key]);
  return out;
}

/** Whole-cent price each, rounded up, and the extended price that follows from it. */
export function customerLines(rows = []) {
  return rows
    .filter((r) => r && Number.isFinite(r.price) && r.quantity >= 1)
    .map((r) => {
      const cents = Math.ceil(Math.round(r.priceEach * 1e6) / 1e4);
      const unit = cents / 100;
      return { quantity: r.quantity, unit, extended: (cents * r.quantity) / 100 };
    });
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Quote date + valid days, as YYYY-MM-DD; "" when either is missing or unreadable. */
export function validUntil(date, validDays) {
  const m = ISO.exec(str(date));
  const days = Number(str(validDays));
  if (!m || !Number.isInteger(days) || days < 0 || str(validDays) === "") return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * What a buyer (or the shop's own second look) would send back before this
 * quote is usable. "missing" items leave the quote ambiguous; "check" items
 * are worth a look but may be intended.
 */
export function reviewQuote(meta, rows) {
  const m = normaliseMeta(meta);
  const lines = customerLines(rows);
  const out = [];
  const need = (k, why) => { if (!m[k]) out.push({ level: "missing", field: k, text: why }); };
  need("shopName", "Your shop's name is not on the quote.");
  need("customer", "No customer named.");
  need("quoteNumber", "No quote number: the buyer's PO has nothing to reference.");
  need("partNumber", "No part number.");
  need("revision", "No drawing revision: a quote that does not name the revision it priced can be held to a later one.");
  need("leadTime", "No lead time.");
  if (!m.validDays) out.push({ level: "missing", field: "validDays", text: "No validity period: material prices move, so say how long the price holds." });
  else if (!validUntil(m.date, m.validDays)) out.push({ level: "check", field: "validDays", text: "Validity could not be worked out: give the quote date as a date and the days as a whole number." });
  if (!m.date) out.push({ level: "missing", field: "date", text: "No quote date." });
  need("material", "No material stated: say what you priced, or that it is per the drawing.");
  if (!m.rfqRef) out.push({ level: "check", field: "rfqRef", text: "No customer RFQ reference: buyers match quotes to their RFQ by it." });
  if (!m.paymentTerms) out.push({ level: "check", field: "paymentTerms", text: "No payment terms stated." });
  if (!lines.length) out.push({ level: "missing", field: "prices", text: "No prices yet: run the calculator first." });
  if (lines.some((l) => l.unit === 0)) out.push({ level: "check", field: "prices", text: "A quantity is priced at $0.00 each." });
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].extended < lines[i - 1].extended) {
      out.push({ level: "check", field: "prices", text: `Buying ${lines[i].quantity} costs less in total than buying ${lines[i - 1].quantity}; a buyer will order the larger lot.` });
    }
  }
  return out;
}

const money = (n) => {
  const format = (n) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!(Number(n) < 0)) return format(n);
  const text = format(Math.abs(n));
  return /[1-9]/.test(text) ? `-${text}` : text;
};

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const multiline = (s) => s.split(/\r?\n/).map(esc).join("<br>");

function partRows(m) {
  return [["Part number", m.partNumber], ["Revision", m.revision], ["Description", m.description], ["Material", m.material], ["Finish", m.finish]].filter(([, v]) => v);
}

function termRows(m) {
  const until = validUntil(m.date, m.validDays);
  return [
    ["Lead time", m.leadTime],
    ["Valid", m.validDays ? `${m.validDays} days${until ? `, until ${until}` : ""}` : ""],
    ["Payment terms", m.paymentTerms],
    ["Shipping", m.shipping],
  ].filter(([, v]) => v);
}

/** A standalone HTML file the shop can print to PDF or attach. */
export function quoteToHtml(meta, rows) {
  const m = normaliseMeta(meta);
  const lines = customerLines(rows);
  const title = `Quote ${m.quoteNumber || "(no number)"}${m.partNumber ? " – " + m.partNumber : ""}`;
  const H = [];
  H.push("<!doctype html>");
  H.push('<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">');
  H.push(`<title>${esc(title)}</title>`);
  H.push("<style>body{font:11pt/1.45 system-ui,sans-serif;max-width:46em;margin:2em auto;padding:0 1em;color:#111}h1{font-size:18pt;margin:0}header{display:flex;justify-content:space-between;gap:2em;flex-wrap:wrap;border-bottom:2px solid #333;padding-bottom:.8em}table{border-collapse:collapse;width:100%;margin:.6em 0}th,td{border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}h2{font-size:12pt;margin:1.4em 0 .3em}.meta{color:#444}.notes{white-space:normal}@media print{body{margin:0}}</style>");
  H.push("</head><body><header><div>");
  H.push(`<h1>${esc(m.shopName || "Quotation")}</h1>`);
  if (m.shopAddress) H.push(`<p class="meta">${multiline(m.shopAddress)}</p>`);
  const contact = [m.shopContact, m.shopEmail, m.shopPhone].filter(Boolean).map(esc).join(" · ");
  if (contact) H.push(`<p class="meta">${contact}</p>`);
  H.push("</div><div>");
  H.push(`<p><strong>Quote ${esc(m.quoteNumber || "(no number)")}</strong><br>Date: ${esc(m.date || "-")}</p>`);
  H.push("</div></header>");
  H.push("<h2>For</h2><p>");
  H.push([m.customer, m.customerContact ? "Attn: " + m.customerContact : "", m.rfqRef ? "Your reference: " + m.rfqRef : ""].filter(Boolean).map(esc).join("<br>") || "-");
  H.push("</p>");
  const pr = partRows(m);
  if (pr.length) {
    H.push("<h2>Part</h2><table>");
    for (const [k, v] of pr) H.push(`<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`);
    H.push("</table>");
  }
  H.push('<h2>Price</h2><table><tr><th class="num">Quantity</th><th class="num">Price each</th><th class="num">Extended</th></tr>');
  for (const l of lines) H.push(`<tr><td class="num">${l.quantity}</td><td class="num">${money(l.unit)}</td><td class="num">${money(l.extended)}</td></tr>`);
  if (!lines.length) H.push('<tr><td colspan="3">No prices.</td></tr>');
  H.push("</table>");
  const tr = termRows(m);
  if (tr.length) {
    H.push("<h2>Terms</h2><table>");
    for (const [k, v] of tr) H.push(`<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`);
    H.push("</table>");
  }
  if (m.notes) {
    H.push('<h2>Notes and exclusions</h2><ul class="notes">');
    for (const n of m.notes.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) H.push(`<li>${esc(n)}</li>`);
    H.push("</ul>");
  }
  H.push("</body></html>");
  return H.join("\n") + "\n";
}

/** The same quote as plain text, to paste into an email reply. */
export function quoteToText(meta, rows) {
  const m = normaliseMeta(meta);
  const lines = customerLines(rows);
  const T = [];
  T.push(`Quote ${m.quoteNumber || "(no number)"}${m.date ? ", " + m.date : ""}${m.shopName ? ", from " + m.shopName : ""}`);
  if (m.customer || m.rfqRef) T.push(`For: ${[m.customer, m.customerContact ? "attn " + m.customerContact : "", m.rfqRef ? "your ref " + m.rfqRef : ""].filter(Boolean).join(", ")}`);
  T.push("");
  for (const [k, v] of partRows(m)) T.push(`${k}: ${v}`);
  T.push("");
  const w = Math.max(8, ...lines.map((l) => String(l.quantity).length));
  T.push(`${"Quantity".padStart(w)}  ${"Price each".padStart(12)}  ${"Extended".padStart(14)}`);
  for (const l of lines) T.push(`${String(l.quantity).padStart(w)}  ${money(l.unit).padStart(12)}  ${money(l.extended).padStart(14)}`);
  if (!lines.length) T.push("No prices.");
  T.push("");
  for (const [k, v] of termRows(m)) T.push(`${k}: ${v}`);
  if (m.notes) {
    T.push("");
    T.push("Notes and exclusions:");
    for (const n of m.notes.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) T.push(`- ${n}`);
  }
  if (m.shopContact || m.shopEmail || m.shopPhone) {
    T.push("");
    T.push([m.shopContact, m.shopEmail, m.shopPhone].filter(Boolean).join(" · "));
  }
  return T.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
