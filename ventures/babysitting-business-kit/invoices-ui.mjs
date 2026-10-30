// Babysitting Business Kit: the Invoices tab. Make an invoice for a sit or a week,
// print it or save it as a PDF, record payments and print receipts, and see what is
// owed by age. DOM code only; the logic is invoices.mjs.
import * as V from "./invoices.mjs";
import { addDays, dayOf } from "./engine.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const usd = (x) => `$${(Number(x) || 0).toFixed(2)}`;
const PILL = { paid: "good", "part paid": "warm", open: "cool", overdue: "bad", void: "cool" };

function openPage(html) {
  const u = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  if (!window.open(u, "_blank")) location.href = u;
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

/**
 * mountInvoices(root, { getDesk, save, record, today, serverUrl })
 * `serverUrl()` is the sitter's own server address from Settings, Sync (or "").
 */
export function mountInvoices(root, { getDesk, save, record = () => {}, today, serverUrl = () => "" }) {
  if (!root) return () => {};
  let paying = null;
  const commit = () => { save(); render(); };

  root.innerHTML = `
    <p class="note">An invoice lists each sit with how its price was worked out, what has been paid and what is left. Print it or choose "Save as PDF" in the print dialog. Payments you record here count everywhere else too (Today, Money &amp; taxes, the family's year-end statement).</p>
    <h3>New invoice</h3>
    <form id="iv_new">
      <div class="grid">
        <div><label for="iv_family">Family</label><select id="iv_family" name="familyId" required></select></div>
        <div><label for="iv_from">Sits from</label><input id="iv_from" name="from" type="date" required></div>
        <div><label for="iv_to">Through</label><input id="iv_to" name="to" type="date" required></div>
        <div><label for="iv_due">Due in (days)</label><input id="iv_due" name="dueDays" type="number" min="0" max="90"></div>
      </div>
      <p><button type="submit">Make invoice</button><button type="button" class="secondary" id="iv_week">Last week (Mon-Sun)</button></p>
      <div id="iv_preview" class="note"></div>
    </form>
    <h3>Invoices</h3>
    <div id="iv_list" style="overflow-x:auto"></div>
    <div id="iv_pay"></div>
    <h3>Who owes what, by age</h3>
    <div id="iv_aging" style="overflow-x:auto"></div>
    <h3>Receipts</h3>
    <div id="iv_receipts" style="overflow-x:auto"></div>
    <details><summary><strong>How families pay you</strong></summary>
      <form id="iv_settings">
        <p class="note">Shown on every invoice. Only your own handles; leave any blank to hide it.</p>
        <div class="grid">
          <div><label for="iv_venmo">Venmo</label><input id="iv_venmo" name="venmo" placeholder="@your-name"></div>
          <div><label for="iv_zelle">Zelle (email or phone)</label><input id="iv_zelle" name="zelle"></div>
          <div><label for="iv_cashapp">Cash App</label><input id="iv_cashapp" name="cashApp" placeholder="$yourname"></div>
          <div><label for="iv_paypal">PayPal</label><input id="iv_paypal" name="paypal"></div>
          <div><label for="iv_check">Checks payable to</label><input id="iv_check" name="checkTo"></div>
          <div><label for="iv_prefix">Invoice number prefix</label><input id="iv_prefix" name="prefix" placeholder="INV"></div>
          <div><label for="iv_duedef">Due after (days)</label><input id="iv_duedef" name="dueDays" type="number" min="0" max="90"></div>
          <div><label for="iv_note">A line for the bottom</label><input id="iv_note" name="note"></div>
        </div>
        <label style="display:inline"><input type="checkbox" id="iv_tips" name="tips"> Offer an optional tip on card payments</label>
        <p class="note">Card payments are optional and need your own server with your own Stripe keys (<code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code>; see the self-host guide). The money goes to your Stripe account and Stripe charges you a fee per payment: check their current pricing. Without them, the pay link shows the invoice and the ways above.</p>
        <button type="submit">Save</button>
      </form>
    </details>`;

  const $ = (id) => root.querySelector(`#${id}`);

  $("iv_week").addEventListener("click", () => {
    const t = today();
    const back = ((dayOf(t) + 6) % 7) + 7; // days back to last week's Monday
    $("iv_from").value = addDays(t, -back);
    $("iv_to").value = addDays(t, -back + 6);
    preview();
  });
  for (const id of ["iv_family", "iv_from", "iv_to"]) $(id).addEventListener("change", preview);
  function preview() {
    const desk = getDesk();
    const f = $("iv_family").value, from = $("iv_from").value, to = $("iv_to").value;
    if (!f || !from || !to) { $("iv_preview").textContent = ""; return; }
    const rows = V.billable(desk, { familyId: f, from, to });
    $("iv_preview").textContent = rows.length ? `${rows.length} sit(s) to bill: ${usd(rows.reduce((a, r) => a + r.price, 0))}, of which ${usd(rows.reduce((a, r) => a + r.paid, 0))} is already paid.` : "No sits to bill for this family in these dates (or they are already on an open invoice).";
  }

  $("iv_new").addEventListener("submit", (e) => {
    e.preventDefault();
    const desk = getDesk();
    const token = V.payToken(crypto.getRandomValues(new Uint8Array(16)));
    const inv = V.createInvoice(desk, { familyId: $("iv_family").value, from: $("iv_from").value, to: $("iv_to").value, issued: today(), dueDays: $("iv_due").value, id: `inv_${token.slice(0, 10)}`, token });
    if (!inv) { preview(); return; }
    desk.invoices = [...(desk.invoices || []), inv];
    record("invoice_made");
    commit();
  });

  $("iv_settings").addEventListener("submit", (e) => {
    e.preventDefault();
    const desk = getDesk();
    const o = {};
    for (const el of e.target.elements) if (el.name) o[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
    desk.profile.invoicing = o;
    record("invoice_settings_saved");
    commit();
  });

  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const desk = getDesk();
    const inv = (desk.invoices || []).find((i) => i.id === (t.dataset.ivPrint || t.dataset.ivCopy || t.dataset.ivPay || t.dataset.ivVoid || t.dataset.ivLink));
    if (t.dataset.ivPrint && inv) { openPage(V.invoiceHTML(desk, inv, today(), { payUrl: link(inv) })); record("invoice_printed"); }
    if (t.dataset.ivCopy && inv) { navigator.clipboard?.writeText(V.invoiceText(desk, inv, today()) + (link(inv) ? `\nPay online: ${link(inv)}` : "")).catch(() => {}); t.textContent = "Copied"; record("invoice_copied"); }
    if (t.dataset.ivLink && inv) { navigator.clipboard?.writeText(link(inv)).catch(() => {}); t.textContent = "Link copied"; }
    if (t.dataset.ivPay && inv) { paying = inv.id; render(); $("iv_pay").scrollIntoView?.({ block: "nearest" }); }
    if (t.dataset.ivVoid && inv && confirm(`Void ${inv.number}? Its sits can go on a new invoice. Payments already recorded stay.`)) { inv.status = "void"; record("invoice_voided"); commit(); }
    if (t.dataset.ivReceipt) { openPage(V.receiptHTML(desk, t.dataset.ivReceipt)); record("receipt_printed"); }
    if (t.dataset.ivCancel !== undefined) { paying = null; render(); }
  });
  root.addEventListener("submit", (e) => {
    if (e.target.id !== "iv_payform") return;
    e.preventDefault();
    const desk = getDesk();
    const inv = (desk.invoices || []).find((i) => i.id === paying);
    const f = e.target.elements;
    try {
      const rid = V.recordInvoicePayment(desk, inv, { amount: f.amount.value, tip: f.tip.value, date: f.date.value, method: f.method.value, ref: f.ref.value.trim() ? `${inv.id}:${f.ref.value.trim()}` : "" });
      paying = null;
      record("invoice_payment");
      commit();
      if (rid && confirm("Payment recorded. Open the receipt to print or send?")) openPage(V.receiptHTML(getDesk(), rid));
    } catch (err) { alert(err.message); }
  });

  const link = (inv) => { const base = serverUrl(); return base && inv.payToken ? `${base}/pay/${inv.payToken}` : ""; };

  function render() {
    const desk = getDesk();
    const t = today();
    const fam = (id) => (desk.families.find((f) => f.id === id) || {}).name || "";
    const sel = $("iv_family"), keep = sel.value;
    sel.innerHTML = `<option value="">(choose)</option>` + desk.families.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
    sel.value = keep;
    const s = V.invoiceSettings(desk.profile);
    if (!$("iv_due").value) $("iv_due").placeholder = String(s.dueDays);
    const sf = $("iv_settings");
    if (!sf.contains(document.activeElement)) for (const el of sf.elements) if (el.name) { if (el.type === "checkbox") el.checked = !!s[el.name]; else el.value = el.name === "prefix" || el.name === "dueDays" ? String((desk.profile.invoicing || {})[el.name] ?? "") : s[el.name]; }

    const invs = (desk.invoices || []).slice().reverse();
    $("iv_list").innerHTML = invs.length ? `<table><thead><tr><th>Invoice</th><th>Family</th><th class="n">Total</th><th class="n">Balance</th><th>Status</th><th></th></tr></thead><tbody>${invs.map((inv) => {
      const st = V.invoiceStatus(desk, inv, t);
      return `<tr><td><strong>${esc(inv.number)}</strong><br><span class="note">${esc(inv.from === inv.to ? inv.from : `${inv.from} to ${inv.to}`)} · due ${esc(inv.due)}</span></td><td>${esc(fam(inv.familyId))}</td><td class="n">${usd(st.total)}</td><td class="n">${usd(st.balance)}${st.tips ? `<br><span class="note">+${usd(st.tips)} tips</span>` : ""}</td><td><span class="pill ${PILL[st.state]}">${esc(st.state)}${st.state === "overdue" ? ` ${st.daysPast} d` : ""}</span></td><td><button type="button" class="secondary small" data-iv-print="${esc(inv.id)}">Print / PDF</button><button type="button" class="secondary small" data-iv-copy="${esc(inv.id)}">Copy text</button>${link(inv) && st.state !== "void" ? `<button type="button" class="secondary small" data-iv-link="${esc(inv.id)}">Copy pay link</button>` : ""}${st.state !== "void" && st.balance > 0 ? `<button type="button" class="small" data-iv-pay="${esc(inv.id)}">Record payment</button><button type="button" class="secondary small" data-iv-void="${esc(inv.id)}">Void</button>` : ""}</td></tr>`;
    }).join("")}</tbody></table>${serverUrl() ? `<p class="note">Pay links work after you Sync (Settings) so your server knows the invoice.</p>` : ""}` : `<p class="note">No invoices yet.</p>`;

    const inv = (desk.invoices || []).find((i) => i.id === paying);
    if (inv) {
      const st = V.invoiceStatus(desk, inv, t);
      $("iv_pay").innerHTML = `<form id="iv_payform" class="card"><strong>Payment for ${esc(inv.number)} (balance ${usd(st.balance)})</strong><div class="grid">
        <div><label for="iv_pamount">Amount for the sits</label><input id="iv_pamount" name="amount" type="number" step="0.01" min="0" value="${st.balance.toFixed(2)}"></div>
        <div><label for="iv_ptip">Tip (optional)</label><input id="iv_ptip" name="tip" type="number" step="0.01" min="0" value=""></div>
        <div><label for="iv_pdate">Date paid</label><input id="iv_pdate" name="date" type="date" value="${esc(t)}" required></div>
        <div><label for="iv_pmethod">How</label><select id="iv_pmethod" name="method">${["cash", "Venmo", "Zelle", "PayPal", "Cash App", "check", "other"].map((m) => `<option>${m}</option>`).join("")}</select></div>
        <div><label for="iv_pref">Check or transaction number (optional)</label><input id="iv_pref" name="ref"></div>
      </div><button type="submit">Save payment</button><button type="button" class="secondary" data-iv-cancel>Cancel</button></form>`;
    } else $("iv_pay").innerHTML = "";

    const ag = V.aging(desk, t);
    $("iv_aging").innerHTML = `<table><thead><tr>${V.AGING_BUCKETS.map(([, l]) => `<th class="n">${esc(l)}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody><tr>${V.AGING_BUCKETS.map(([k]) => `<td class="n">${usd(ag.buckets[k])}</td>`).join("")}<td class="n"><strong>${usd(ag.total)}</strong></td></tr></tbody></table>` +
      (ag.rows.length ? `<table><thead><tr><th>Sit</th><th>Family</th><th>Invoice</th><th class="n">Owed</th><th class="n">Days past due</th></tr></thead><tbody>${ag.rows.slice(0, 50).map((r) => `<tr><td>${esc(r.date)} ${esc(r.start)}</td><td>${esc(fam(r.familyId))}</td><td>${esc(r.invoice || "not invoiced")}</td><td class="n">${usd(r.owed)}</td><td class="n">${r.daysPast}</td></tr>`).join("")}</tbody></table>` : `<p class="note">Nothing owed. Nice.</p>`);

    const rc = V.receipts(desk).slice(0, 30);
    $("iv_receipts").innerHTML = rc.length ? `<table><thead><tr><th>Date</th><th>Family</th><th>How</th><th class="n">Amount</th><th></th></tr></thead><tbody>${rc.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(fam(r.familyId))}</td><td>${esc(r.method)}</td><td class="n">${usd(r.amount)}${r.tip ? `<br><span class="note">+${usd(r.tip)} tip</span>` : ""}</td><td><button type="button" class="secondary small" data-iv-receipt="${esc(r.id)}">Receipt</button></td></tr>`).join("")}</tbody></table>` : `<p class="note">No payments recorded yet.</p>`;
  }

  // Render whenever the tab is opened, so payments added elsewhere show up.
  const panel = root.closest("[data-panel]");
  if (panel && typeof MutationObserver === "function") new MutationObserver(() => { if (!panel.hidden) render(); }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  render();
  return render;
}
