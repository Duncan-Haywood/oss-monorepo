// Read-only Stripe client, no SDK. Restricted key: Invoices read and Credit
// notes read. This code never writes to Stripe.

// Tax included in the price. Older API versions send tax_amounts[{amount, inclusive}];
// 2025-03-31 (basil) and later send taxes[{amount, tax_behavior}] instead.
export const inclusiveTax = (l) => [...(l.tax_amounts || []), ...(l.taxes || [])].reduce((a, t) => a + (t.inclusive === true || t.tax_behavior === "inclusive" ? t.amount || 0 : 0), 0);

// One Stripe invoice line -> {id, billedAt, start, end, amount, currency} or null.
// amount = line amount minus discounts, minus tax that is included in the price,
// so recognised revenue excludes sales tax you collect for someone else.
export function normalizeLine(inv, l) {
  if (l.amount === undefined || l.amount === null) return null;
  const discount = (l.discount_amounts || []).reduce((a, d) => a + (d.amount || 0), 0);
  const inclTax = inclusiveTax(l);
  const p = l.period || {};
  const billedAt = (inv.status_transitions?.paid_at || inv.created) * 1000;
  return { id: l.id, invoice: inv.id, billedAt, start: (p.start ?? inv.created) * 1000, end: (p.end ?? p.start ?? inv.created) * 1000, amount: l.amount - discount - inclTax, currency: inv.currency || l.currency || "usd" };
}

export function normalizeCreditNote(cn) {
  const out = [];
  for (const l of cn.lines?.data || []) {
    const incl = inclusiveTax(l);
    out.push({ id: `${cn.id}:${l.id}`, invoice: cn.invoice, ...(l.invoice_line_item ? { credits: l.invoice_line_item } : {}), billedAt: cn.created * 1000, start: cn.created * 1000, end: cn.created * 1000, amount: -((l.amount || 0) - (l.discount_amounts || []).reduce((a, d) => a + (d.amount || 0), 0) - incl), currency: cn.currency || "usd" });
  }
  return out;
}

export function createStripe({ key, fetchImpl = fetch, base = "https://api.stripe.com", maxPages = 500 }) {
  async function get(path) {
    const res = await fetchImpl(`${base}${path}`, { headers: { authorization: `Bearer ${key}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json?.error?.message || `stripe ${res.status}`), { status: res.status });
    return json;
  }
  async function all(path) {
    const out = []; let after = null;
    for (let page = 0; page < maxPages; page++) {
      const j = await get(`${path}${path.includes("?") ? "&" : "?"}limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`);
      out.push(...(j.data || []));
      if (!j.has_more || !j.data?.length) return out;
      after = j.data[j.data.length - 1].id;
    }
    throw new Error(`more than ${maxPages * 100} records; raise MAX_PAGES`);
  }
  return {
    // Paid invoices created since `sinceSec` (0 = all), with every line.
    async listLines(sinceSec = 0) {
      const invs = await all(`/v1/invoices?status=paid${sinceSec ? `&created[gte]=${sinceSec}` : ""}`);
      const lines = [];
      for (const inv of invs) {
        let data = inv.lines?.data || [];
        if (inv.lines?.has_more) data = await all(`/v1/invoices/${encodeURIComponent(inv.id)}/lines`);
        for (const l of data) { const n = normalizeLine(inv, l); if (n) lines.push(n); }
      }
      return lines;
    },
    async listCreditNotes(sinceSec = 0) {
      const cns = (await all(`/v1/credit_notes${sinceSec ? `?created[gte]=${sinceSec}` : ""}`)).filter((c) => c.status !== "void");
      // A credit note embeds only its first lines (`lines.has_more`), like an
      // invoice: fetch the rest, or a refund of a many-line invoice is only
      // partly reversed (quality re-audit 2026-11-21).
      const out = [];
      for (const cn of cns) {
        const full = cn.lines?.has_more ? { ...cn, lines: { data: await all(`/v1/credit_notes/${encodeURIComponent(cn.id)}/lines`) } } : cn;
        out.push(...normalizeCreditNote(full));
      }
      return out;
    },
  };
}
