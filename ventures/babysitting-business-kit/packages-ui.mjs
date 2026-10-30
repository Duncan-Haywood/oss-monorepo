// The "Packages" tab: prepaid packages, gift certificates and parents' night out
// events. DOM code only; the logic and the tax treatment are in packages.mjs.
import * as K from "./packages.mjs";
import { expandBookings, addDays } from "./engine.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (x) => `$${(Number(x) || 0).toFixed(2)}`;
const field = (id, label, attrs = "") => `<div><label for="${id}">${label}</label><input id="${id}" ${attrs}></div>`;

/**
 * mountPackages(root, { getDesk, setDesk, record, today, serverUrl })
 * `setDesk(desk)` stores the new desk and re-renders the app; `serverUrl()` is the
 * sync address, if any, for event sign-up links.
 */
export function mountPackages(root, { getDesk, setDesk, record = () => {}, today, serverUrl = () => "" }) {
  root.innerHTML = `
    <p class="note">Sell care ahead of time. A package or gift certificate counts as income on the day it is paid for (the Money tab adds it); using it later marks the sit paid without counting it twice.</p>
    <div id="pk_summary"></div>
    <h3>Packages</h3>
    <p class="note">Your own bundles: a set number of sits or hours at a set price. Start from a suggestion (your rate card less a discount you choose) or type your own.</p>
    <p><label for="pk_disc" style="display:inline">Suggestion discount %</label> <input id="pk_disc" type="number" min="0" max="50" value="10" style="width:5rem"> <span id="pk_templates"></span></p>
    <form id="pk_planForm" class="grid">
      <input type="hidden" id="pk_id">
      ${field("pk_name", "Package name", 'required placeholder="Date-night bundle"')}
      <div><label for="pk_unit">Counts</label><select id="pk_unit"><option value="sits">sits</option><option value="hours">hours</option></select></div>
      ${field("pk_qty", "How many", 'type="number" min="1" step="0.5" required')}
      ${field("pk_price", "Price ($)", 'type="number" min="1" step="0.01" required')}
      ${field("pk_valid", "Good for (days, blank = no expiry)", 'type="number" min="1"')}
      ${field("pk_note", "What it is for", "")}
      <div><button type="submit">Save package</button></div>
    </form>
    <p class="note" id="pk_planOut" aria-live="polite"></p>
    <div id="pk_plans"></div>
    <h4>Sold packages</h4>
    <div id="pk_sold"></div>
    <h3>Gift certificates</h3>
    <p class="note">Each certificate gets its own code. Print it, and when the code comes back, apply it to a sit; any balance stays on the code. ${esc(K.EXPIRY_NOTE)}</p>
    <form id="pk_giftForm" class="grid">
      <div><label for="gc_kind">Worth</label><select id="gc_kind"><option value="amount">an amount ($)</option><option value="hours">a number of hours</option></select></div>
      ${field("gc_value", "Amount or hours", 'type="number" min="0.5" step="0.5" required')}
      ${field("gc_price", "Buyer paid ($, blank = face value)", 'type="number" min="0" step="0.01"')}
      ${field("gc_buyer", "From (buyer)")}
      ${field("gc_recipient", "For (recipient)")}
      ${field("gc_message", "Message (optional)")}
      ${field("gc_sold", "Paid on", 'type="date" required')}
      <div><label for="gc_method">Paid by</label><input id="gc_method" placeholder="cash, Venmo, check"></div>
      ${field("gc_expires", "Use by (optional)", 'type="date"')}
      <div><button type="submit">Make certificate</button></div>
    </form>
    <p class="note" id="pk_giftOut" aria-live="polite"></p>
    <div id="pk_gifts"></div>
    <h3>Use a package or gift certificate for a sit</h3>
    <div class="grid">
      <div><label for="rd_sit">Sit</label><select id="rd_sit"></select></div>
      <div><label for="rd_source">Pay with</label><select id="rd_source"></select></div>
      ${field("rd_units", "Units (blank = the whole sit)", 'type="number" min="0" step="0.25"')}
      <div><button type="button" id="rd_go">Apply</button></div>
    </div>
    <p class="note" id="rd_out" aria-live="polite"></p>
    <h3>Parents' night out</h3>
    <p class="note">A group evening, priced per child with a family cap, with a head count checked against your ratio. ${esc(K.GROUP_NOTE)}</p>
    <form id="pk_eventForm" class="grid">
      <input type="hidden" id="ev_id">
      ${field("ev_title", "Title", 'value="Parents\' night out"')}
      ${field("ev_date", "Date", 'type="date" required')}
      ${field("ev_start", "Start", 'type="time" value="17:30"')}
      ${field("ev_end", "End", 'type="time" value="21:00"')}
      ${field("ev_place", "Where", 'placeholder="Church fellowship hall"')}
      ${field("ev_group", "For (church, school or group)")}
      ${field("ev_perChild", "Per child ($)", 'type="number" min="0" step="0.5" value="15"')}
      ${field("ev_cap", "Family cap ($, optional)", 'type="number" min="0" step="0.5"')}
      ${field("ev_ratio", "Children per adult (your limit)", 'type="number" min="1" max="12"')}
      ${field("ev_adults", "Adults (you + helpers)", 'type="number" min="1" value="1"')}
      ${field("ev_max", "Most children (optional)", 'type="number" min="1"')}
      ${field("ev_young", "Youngest age (months)", 'type="number" min="0"')}
      <div><button type="submit">Save event</button></div>
    </form>
    <p class="note" id="ev_out" aria-live="polite"></p>
    <div id="pk_events"></div>`;
  const $ = (id) => root.querySelector(`#${id}`);
  const famName = (id) => (getDesk().families.find((f) => f.id === id) || {}).name || "";
  const famOpts = () => `<option value="">(no family)</option>` + getDesk().families.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
  const commit = (d, ev) => { setDesk(d); if (ev) record(ev); };

  function render() {
    const desk = K.ensure(getDesk());
    const t = today();
    const o = K.packagesOverview(desk, t);
    $("pk_summary").innerHTML = `<p><strong>${money(o.salesThisYear)}</strong> sold in packages and gift certificates this year · <strong>${money(o.outstanding)}</strong> of care still owed on open balances</p>${o.expiringSoon.map((x) => `<p class="msg">Expires ${esc(x.expires)}: ${esc(x.name)}${x.familyId ? ` (${esc(famName(x.familyId))})` : x.recipient ? ` (${esc(x.recipient)})` : ""}, ${esc(x.left)} left. A friendly reminder now is kinder than a lost balance.</p>`).join("")}`;
    $("pk_templates").innerHTML = K.planTemplates(desk.profile, Number($("pk_disc").value) || 0).map((p, i) => `<button type="button" class="secondary small" data-tpl="${i}">${esc(p.name)} ${money(p.price)}</button>`).join("");
    $("pk_plans").innerHTML = desk.packages.plans.length ? `<table><thead><tr><th>Package</th><th class="n">Price</th><th>Sell to</th><th></th></tr></thead><tbody>${desk.packages.plans.map((p) => `<tr><td><strong>${esc(p.name)}</strong><br><span class="note">${esc(p.quantity)} ${esc(p.unit)}${p.validDays ? `, good for ${esc(p.validDays)} days` : ""}${p.note ? ` · ${esc(p.note)}` : ""}</span></td><td class="n">${money(p.price)}</td><td><select aria-label="Family for ${esc(p.name)}" data-sellfam="${esc(p.id)}">${famOpts()}</select><input aria-label="Paid by" placeholder="paid by" data-sellmethod="${esc(p.id)}" style="max-width:8rem"></td><td><button type="button" class="small" data-sell="${esc(p.id)}">Sold today</button><button type="button" class="secondary small" data-editplan="${esc(p.id)}">Edit</button><button type="button" class="secondary small" data-delplan="${esc(p.id)}">Delete</button></td></tr>`).join("")}</tbody></table>` : `<p class="note">No packages yet.</p>`;
    $("pk_sold").innerHTML = desk.packages.sold.length ? `<table><thead><tr><th>Package</th><th>Family</th><th>Left</th><th>Used</th></tr></thead><tbody>${desk.packages.sold.slice().reverse().map((s) => { const b = K.packageBalance(s, t); return `<tr><td>${esc(s.name)}<br><span class="note">sold ${esc(s.soldOn)} for ${money(s.price)}${s.expires ? `, use by ${esc(s.expires)}` : ""}</span></td><td>${esc(famName(s.familyId))}</td><td>${b.expired ? `<span class="pill bad">expired</span>` : `${esc(b.remaining)} ${esc(s.unit)}`}<br><span class="note">${money(b.valueLeft)}</span></td><td class="note">${(s.redemptions || []).map((r) => `${esc(r.date)}: ${esc(r.units)} <button type="button" class="secondary small" data-undo="${esc(s.id)}:${esc(r.id)}">Undo</button>`).join("<br>")}</td></tr>`; }).join("")}</tbody></table>` : `<p class="note">None sold yet.</p>`;
    $("pk_gifts").innerHTML = desk.packages.gifts.length ? `<table><thead><tr><th>Code</th><th>For</th><th>Left</th><th></th></tr></thead><tbody>${desk.packages.gifts.slice().reverse().map((g) => { const b = K.giftBalance(g, t); return `<tr><td><code>${esc(g.code)}</code><br><span class="note">sold ${esc(g.soldOn)} for ${money(g.price)}${g.expires ? `, use by ${esc(g.expires)}` : ""}</span></td><td>${esc(g.recipient)}${g.buyer ? `<br><span class="note">from ${esc(g.buyer)}</span>` : ""}</td><td>${b.expired ? `<span class="pill bad">expired</span>` : b.unit === "hours" ? `${esc(b.remaining)} h` : money(b.remaining)}</td><td><button type="button" class="small" data-print="${esc(g.id)}">Print</button>${(g.redemptions || []).map((r) => `<br><span class="note">${esc(r.date)}: ${money(r.value)}</span> <button type="button" class="secondary small" data-undo="${esc(g.id)}:${esc(r.id)}">Undo</button>`).join("")}</td></tr>`; }).join("")}</tbody></table>` : `<p class="note">No certificates yet.</p>`;
    const sitV = $("rd_sit").value, srcV = $("rd_source").value;
    const occ = expandBookings(desk.bookings).filter((b) => b.status !== "cancelled" && b.date >= addDays(t, -60)).slice(0, 120);
    $("rd_sit").innerHTML = occ.map((b) => `<option value="${esc(b.id)}|${esc(b.date)}">${esc(b.date)} ${esc(b.start)} ${esc(famName(b.familyId) || b.notes || "")}</option>`).join("") || `<option value="">(no sits on the schedule)</option>`;
    $("rd_source").innerHTML = [
      ...desk.packages.sold.filter((s) => K.packageBalance(s, t).usable).map((s) => `<option value="pkg:${esc(s.id)}">${esc(s.name)} · ${esc(famName(s.familyId))} · ${esc(K.packageBalance(s, t).remaining)} ${esc(s.unit)} left</option>`),
      ...desk.packages.gifts.filter((g) => K.giftBalance(g, t).usable).map((g) => `<option value="gift:${esc(g.code)}">${esc(g.code)}${g.recipient ? ` · ${esc(g.recipient)}` : ""}</option>`),
    ].join("") || `<option value="">(nothing with a balance)</option>`;
    if (sitV) $("rd_sit").value = sitV;
    if (srcV) $("rd_source").value = srcV;
    $("pk_events").innerHTML = desk.packages.events.slice().sort((a, b) => b.date.localeCompare(a.date)).map((ev) => {
      const st = K.eventStatus(ev);
      const base = serverUrl();
      const link = ev.token && base ? `${base}/event/${ev.token}` : "";
      const text = K.eventAnnouncement(ev, desk.profile, { audience: ev.annAudience || "church", link });
      return `<div class="card" style="margin:10px 0"><strong>${esc(ev.title)}</strong> · ${esc(ev.date)} ${esc(ev.start)}-${esc(ev.end)}${ev.place ? ` · ${esc(ev.place)}` : ""}
        <p><span class="pill ${st.placesLeft ? "good" : "warm"}">${st.kids} of ${st.capacity} children</span> ${st.families} families · ${money(st.revenue)} expected${st.waitlist.length ? ` · ${st.waitlist.length} on the waitlist` : ""}</p>
        ${st.warnings.map((w) => `<p class="msg"><strong>${esc(w)}</strong></p>`).join("")}
        ${st.allergies.length ? `<p><span class="pill bad">Allergies</span> ${esc(st.allergies.join("; "))}</p>` : ""}
        <details><summary>Sign-up list (${(ev.signups || []).length})</summary>
          ${(ev.signups || []).map((s) => `<p>${esc(s.parent)} · ${esc(s.contact)}${s.pickup ? ` · pick-up: ${esc(s.pickup)}` : ""} · ${(s.kids || []).map((k) => `${esc(k.name)}${k.ageMonths != null ? ` (${esc(Math.floor(k.ageMonths / 12))})` : ""}`).join(", ")} ${st.waitlist.includes(s) ? `<span class="pill warm">waitlist</span> <button type="button" class="secondary small" data-admit="${esc(ev.id)}:${esc(s.id)}">Let in anyway</button>` : ""} <button type="button" class="secondary small" data-rmsignup="${esc(ev.id)}:${esc(s.id)}">Remove</button></p>`).join("")}
          <div class="grid"><div><label for="su_p_${esc(ev.id)}">Parent</label><input id="su_p_${esc(ev.id)}"></div><div><label for="su_c_${esc(ev.id)}">Phone or email</label><input id="su_c_${esc(ev.id)}"></div><div><label for="su_k_${esc(ev.id)}">Children (name age allergies; one per line)</label><textarea id="su_k_${esc(ev.id)}" rows="2"></textarea></div><div><button type="button" class="small" data-addsignup="${esc(ev.id)}">Add sign-up</button></div></div>
        </details>
        <details><summary>Announcement draft</summary>
          <p><label for="ann_${esc(ev.id)}" style="display:inline">For</label> <select id="ann_${esc(ev.id)}" data-aud="${esc(ev.id)}"><option value="church"${(ev.annAudience || "church") === "church" ? " selected" : ""}>a church bulletin</option><option value="school"${ev.annAudience === "school" ? " selected" : ""}>a school newsletter</option></select></p>
          <div class="msg">${esc(text)}</div><button type="button" class="secondary small" data-copy="${esc(text)}">Copy message</button>
        </details>
        <p>${ev.token ? (link ? `Sign-up link: <code>${esc(link)}</code> (live after you Sync)` : `<span class="note">Set your server address in Settings to share the sign-up link.</span>`) : `<button type="button" class="secondary small" data-mklink="${esc(ev.id)}">Make a sign-up link (needs your server)</button>`}
        <button type="button" class="secondary small" data-tosched="${esc(ev.id)}">Add to schedule</button><button type="button" class="secondary small" data-editev="${esc(ev.id)}">Edit</button><button type="button" class="secondary small" data-delev="${esc(ev.id)}">Delete</button></p></div>`;
    }).join("") || `<p class="note">No events yet.</p>`;
    if (!$("ev_ratio").value) $("ev_ratio").value = desk.profile.maxKids || 4;
    if (!$("ev_young").value) $("ev_young").value = desk.profile.youngestMonths ?? "";
    if (!$("gc_sold").value) $("gc_sold").value = t;
  }

  $("pk_disc").addEventListener("input", render);
  $("pk_planForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const r = K.savePlan(getDesk(), { id: $("pk_id").value || undefined, name: $("pk_name").value, unit: $("pk_unit").value, quantity: $("pk_qty").value, price: $("pk_price").value, validDays: $("pk_valid").value, note: $("pk_note").value, hoursPerSit: $("pk_name").dataset.hours, kids: $("pk_name").dataset.kids });
    $("pk_planOut").textContent = r.ok ? `Saved ${r.plan.name}.` : r.why.join(" ");
    if (r.ok) { $("pk_planForm").reset(); $("pk_id").value = ""; commit(r.desk, "package_plan_saved"); }
  });
  $("pk_giftForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const r = K.issueGift(getDesk(), { kind: $("gc_kind").value, value: $("gc_value").value, price: $("gc_price").value, buyer: $("gc_buyer").value, recipient: $("gc_recipient").value, message: $("gc_message").value, soldOn: $("gc_sold").value, method: $("gc_method").value, expires: $("gc_expires").value || null });
    $("pk_giftOut").textContent = r.ok ? `Made ${r.gift.code}. Print it from the list below.` : r.why.join(" ");
    if (r.ok) { $("pk_giftForm").reset(); commit(r.desk, "gift_certificate_made"); }
  });
  $("pk_eventForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = (id) => $(id).value;
    const r = K.saveEvent(getDesk(), { id: v("ev_id") || undefined, title: v("ev_title"), date: v("ev_date"), start: v("ev_start"), end: v("ev_end"), place: v("ev_place"), group: v("ev_group"), perChild: v("ev_perChild"), familyCap: v("ev_cap"), ratio: v("ev_ratio"), adults: v("ev_adults"), maxKids: v("ev_max"), youngestMonths: v("ev_young") });
    $("ev_out").textContent = r.ok ? `Saved. Room for ${K.eventCapacity(r.event).capacity} children.` : r.why.join(" ");
    if (r.ok) { $("ev_id").value = ""; commit(r.desk, "event_saved"); }
  });
  $("rd_go").addEventListener("click", () => {
    const [bookingId, date] = $("rd_sit").value.split("|");
    const src = $("rd_source").value;
    if (!bookingId || !src) { $("rd_out").textContent = "Pick a sit and something with a balance."; return; }
    const units = $("rd_units").value;
    const r = src.startsWith("pkg:") ? K.redeemPackage(getDesk(), src.slice(4), bookingId, { date, on: today(), units }) : K.redeemGift(getDesk(), src.slice(5), bookingId, { date, on: today(), units });
    $("rd_out").textContent = r.ok ? `Applied ${money(r.value)}.${r.stillOwed > 0 ? ` ${money(r.stillOwed)} is still owed for that sit.` : " That sit is paid."}${r.note ? ` ${r.note}` : ""}` : r.why.join(" ");
    if (r.ok) commit(r.desk, src.startsWith("pkg:") ? "package_redeemed" : "gift_redeemed");
  });

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.aud) { const d = K.ensure(structuredClone(getDesk())); const ev = d.packages.events.find((x) => x.id === t.dataset.aud); if (ev) { ev.annAudience = t.value; commit(d); } }
  });
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const d = () => K.ensure(structuredClone(getDesk()));
    const ds = t.dataset;
    if (ds.tpl) {
      const p = K.planTemplates(getDesk().profile, Number($("pk_disc").value) || 0)[Number(ds.tpl)];
      $("pk_id").value = ""; $("pk_name").value = p.name; $("pk_unit").value = p.unit; $("pk_qty").value = p.quantity; $("pk_price").value = p.price; $("pk_valid").value = p.validDays; $("pk_note").value = p.note;
      $("pk_name").dataset.hours = p.hoursPerSit; $("pk_name").dataset.kids = p.kids;
      $("pk_planOut").textContent = `A suggestion from your rates for ${p.kids} children: change anything, then Save.`;
    } else if (ds.editplan) {
      const p = getDesk().packages.plans.find((x) => x.id === ds.editplan);
      if (p) { $("pk_id").value = p.id; $("pk_name").value = p.name; $("pk_unit").value = p.unit; $("pk_qty").value = p.quantity; $("pk_price").value = p.price; $("pk_valid").value = p.validDays ?? ""; $("pk_note").value = p.note || ""; }
    } else if (ds.delplan) {
      if (confirm("Delete this package? Ones already sold keep their balance.")) { const x = d(); x.packages.plans = x.packages.plans.filter((p) => p.id !== ds.delplan); commit(x); }
    } else if (ds.sell) {
      const fam = root.querySelector(`[data-sellfam="${CSS.escape(ds.sell)}"]`).value, method = root.querySelector(`[data-sellmethod="${CSS.escape(ds.sell)}"]`).value;
      const r = K.sellPackage(getDesk(), ds.sell, { familyId: fam, soldOn: today(), method });
      $("pk_planOut").textContent = r.ok ? `Sold ${r.sold.name}${fam ? ` to ${famName(fam)}` : ""} for ${money(r.sold.price)}.` : r.why.join(" ");
      if (r.ok) commit(r.desk, "package_sold");
    } else if (ds.undo) {
      const [src, rid] = ds.undo.split(":");
      if (confirm("Undo this use? The balance comes back and the sit is no longer paid by it.")) { const r = K.undoRedemption(getDesk(), src, rid); if (r.ok) commit(r.desk); }
    } else if (ds.print) {
      const g = getDesk().packages.gifts.find((x) => x.id === ds.print);
      if (!g) return;
      const url = URL.createObjectURL(new Blob([K.giftCertificateHTML(g, getDesk().profile)], { type: "text/html" }));
      const w = window.open(url, "_blank", "noopener");
      if (!w) { const a = document.createElement("a"); a.href = url; a.download = `gift-certificate-${g.code}.html`; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      record("gift_certificate_printed");
    } else if (ds.addsignup) {
      const id = ds.addsignup;
      const kids = $(`su_k_${id}`).value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const m = /^(.*?)(?:\s+(\d+(?:\.\d+)?))?(?:\s+(.*))?$/.exec(l); return { name: m[1], ageMonths: m[2] ? Math.round(Number(m[2]) * 12) : null, allergies: m[3] || "" }; });
      const s = { parent: $(`su_p_${id}`).value.trim(), contact: $(`su_c_${id}`).value.trim(), kids, at: new Date().toISOString() };
      if (!s.parent || !kids.length) { $("ev_out").textContent = "A sign-up needs a parent and at least one child."; return; }
      const r = K.addSignup(getDesk(), id, s);
      $("ev_out").textContent = r.waitlisted ? `${s.parent} is on the waitlist: the event is full at your ratio.` : `${s.parent} is signed up. ${r.placesLeft} place(s) left.`;
      commit(r.desk, "event_signup_added");
    } else if (ds.admit || ds.rmsignup) {
      const [eid, sid] = (ds.admit || ds.rmsignup).split(":");
      const x = d(); const ev = x.packages.events.find((v) => v.id === eid);
      if (!ev) return;
      if (ds.admit) { const s = ev.signups.find((v) => v.id === sid); if (s) s.waitlist = false; }
      else if (confirm("Remove this sign-up?")) { ev.signups = ev.signups.filter((v) => v.id !== sid); ev.removedSignups = [...(ev.removedSignups || []), sid]; } else return;
      commit(x);
    } else if (ds.mklink) {
      const x = d(); const ev = x.packages.events.find((v) => v.id === ds.mklink);
      if (ev) { ev.token = K.eventToken(); commit(x, "event_link_made"); }
    } else if (ds.tosched) {
      const ev = getDesk().packages.events.find((v) => v.id === ds.tosched);
      if (!ev) return;
      const x = d(); x.bookings.push(K.eventToBooking(ev)); commit(x, "event_scheduled");
      $("ev_out").textContent = "Added to your schedule at the expected total. Record payments on it in Money as families pay.";
    } else if (ds.editev) {
      const ev = getDesk().packages.events.find((v) => v.id === ds.editev);
      if (!ev) return;
      const set = { ev_id: ev.id, ev_title: ev.title, ev_date: ev.date, ev_start: ev.start, ev_end: ev.end, ev_place: ev.place, ev_group: ev.group, ev_perChild: ev.perChild, ev_cap: ev.familyCap ?? "", ev_ratio: ev.ratio, ev_adults: ev.adults, ev_max: ev.maxKids ?? "", ev_young: ev.youngestMonths ?? "" };
      for (const [k, v] of Object.entries(set)) $(k).value = v ?? "";
      $("ev_title").focus();
    } else if (ds.delev) {
      if (confirm("Delete this event and its sign-up list?")) { const x = d(); x.packages.events = x.packages.events.filter((v) => v.id !== ds.delev); commit(x); }
    }
  });
  render();
  return render;
}
