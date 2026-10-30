// Babysitting Business Kit: the Network tab. Backup sitters the sitter trusts, passing on work
// the sitter cannot take (with the family's recorded OK), the sub-for-me list for sick days,
// and referrals both ways. DOM code only; the logic is in network.mjs.
import * as N from "./network.mjs";

const FIELDS = [
  ["name", "Name", "text", "Beth Ortiz"], ["contact", "Phone or email", "text", ""], ["ages", "Ages they take", "text", "6 months-12"],
  ["maxKids", "Most kids at once", "number", ""], ["area", "Area", "text", "Riverside"], ["availability", "Usually free", "text", "Mon-Fri 15-22; Sat 8-23"],
  ["cprSeenOn", "CPR card seen on (date)", "date", ""], ["peerId", "Their kit server name (optional)", "text", "beth"], ["peerUrl", "Their kit server address (optional)", "url", "https://..."],
];

export function mountNetwork(root, { getDesk, save, esc, record = () => {}, today, server = () => ({}) }) {
  if (!root) return () => {};
  let editing = "", pick = "", subDays = 3, out = "";
  const net = () => { const d = getDesk(); d.network = N.normalizeNetwork(d.network); return d.network; };
  const copy = (t) => `<button type="button" class="secondary small" data-copy="${esc(t)}">Copy message</button>`;

  root.addEventListener("submit", (e) => {
    if (e.target.id !== "netSitterForm") return;
    e.preventDefault();
    const f = e.target, o = {};
    for (const [k] of FIELDS) o[k] = f.elements[k].value.trim();
    o.maxKids = o.maxKids === "" ? "" : Number(o.maxKids);
    o.notes = f.elements.notes.value.trim();
    o.cprSeen = f.elements.cprSeen.checked;
    if (f.elements.peerSecret.value) o.peerSecret = f.elements.peerSecret.value;
    if (!o.name) return;
    const list = net().sitters, i = list.findIndex((s) => s.id === editing);
    if (i >= 0) list[i] = { ...list[i], ...o }; else list.push({ id: `sit_${Math.random().toString(36).slice(2, 10)}`, ...o });
    editing = "";
    record("network_sitter_saved");
    save();
  });

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "netPick") { pick = t.value; render(); }
    if (t.id === "netDays") { subDays = Number(t.value) || 3; render(); }
    if (t.dataset.netStatus) { const x = net().sent.find((s) => s.id === t.dataset.netStatus); if (x) { x.status = t.value; save(); } }
  });

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const d = t.dataset, desk = getDesk(), n = net();
    if (d.netEdit) { editing = d.netEdit; render(); root.querySelector("#netSitterForm").scrollIntoView({ block: "start" }); }
    if (d.netDel && confirm("Remove this backup sitter?")) { n.sitters = n.sitters.filter((s) => s.id !== d.netDel); save(); }
    if (d.netStart) {
      const [src, key, sitterId] = d.netStart.split("|");
      const req = src === "lead" ? N.requestFromLead(desk.leads.find((l) => l.id === key)) : N.requestFromSit(desk, N.subForMe(desk, today(), subDays).find((x) => (x.sit.key || x.sit.id) === key).sit);
      n.sent.push({ ...N.passOn(desk, req, sitterId, today()), contactOnFile: req.contact });
      record("network_pass_on");
      save();
    }
    if (d.netConsent) {
      const [id, contact] = d.netConsent.split("|");
      const i = n.sent.findIndex((x) => x.id === id);
      const how = root.querySelector(`[data-net-how="${id}"]`);
      if (i >= 0) { n.sent[i] = { ...N.recordConsent(n.sent[i], { share: true, contact: contact === "1", how: how ? how.value : "text" }, new Date().toISOString()), status: n.sent[i].status === "suggested" ? "asked" : n.sent[i].status }; record("network_consent"); save(); }
    }
    if (d.netWithdraw) { const x = n.sent.find((s) => s.id === d.netWithdraw); if (x) { x.consent = { ...(x.consent || {}), share: false, contact: false, withdrawn: new Date().toISOString() }; save(); } }
    if (d.netCancel && confirm("Cancel this sit with no fee?")) { desk.bookings = N.cancelNoFee(desk.bookings, d.netCancel, today()); record("network_cancel_no_fee"); save(); }
    if (d.netSend) {
      const { url, key } = server();
      const entry = n.sent.find((x) => x.id === d.netSend);
      const sitter = entry && n.sitters.find((s) => s.id === entry.sitterId);
      if (!url || !key) { out = "Set your server address and admin key in Settings first."; return render(); }
      try {
        const r = await fetch(`${url}/api/network/handoff`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ entry, sitter }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `server said ${r.status}`);
        entry.handoff = j.handoff; entry.status = "passed on";
        out = `Sent to ${sitter.name}'s server.`;
        record("network_handoff_sent");
        save();
      } catch (err) { out = `Not sent: ${err.message}`; render(); }
    }
  });

  function requestBlock(desk, req, src, key) {
    const n = net();
    const used = n.sent.filter((x) => (src === "lead" ? x.leadId === key : x.bookingKey === key)).map((x) => x.sitterId);
    const ranked = N.suggestBackups(desk, req);
    if (!ranked.length) return `<p class="note">Add a backup sitter above to get suggestions.</p>`;
    return ranked.slice(0, 3).map((r) => `<div class="card" style="margin:6px 0"><strong>${esc(r.sitter.name)}</strong> <span class="pill ${r.score >= 70 ? "hot" : r.score >= 50 ? "warm" : "cool"}">${r.score}</span><br><span class="note">${r.reasons.map(esc).join("; ")}${r.cautions.length ? `<br>Check: ${r.cautions.map(esc).join("; ")}` : ""}</span>
      ${used.includes(r.sitter.id) ? `<p class="note">Started below.</p>` : `<div class="msg">${esc(N.familyMessage(desk, req, r.sitter, { reason: src === "lead" ? "booked" : "sick" }))}</div>${copy(N.familyMessage(desk, req, r.sitter, { reason: src === "lead" ? "booked" : "sick" }))}<button type="button" class="small" data-net-start="${esc(`${src}|${key}|${r.sitter.id}`)}">Asked the family: track it</button>`}</div>`).join("");
  }

  function render() {
    const desk = getDesk(), n = net();
    if (editing && !n.sitters.some((s) => s.id === editing)) editing = "";
    const cur = n.sitters.find((s) => s.id === editing) || {};
    const form = `<form id="netSitterForm"><div class="grid">${FIELDS.map(([k, label, type, ph]) => `<div><label for="net_${k}">${label}</label><input id="net_${k}" name="${k}" type="${type}"${type === "number" ? ' min="1"' : ""} value="${esc(cur[k] ?? "")}" placeholder="${esc(ph)}"${k === "name" ? " required" : ""}></div>`).join("")}
      <div><label for="net_peerSecret">Shared secret for that server (optional)</label><input id="net_peerSecret" name="peerSecret" type="password" autocomplete="off" placeholder="${cur.peerSecret ? "saved; type to replace" : "or set NETWORK_PEERS on your server"}"></div></div>
      <label><input type="checkbox" name="cprSeen"${cur.cprSeen ? " checked" : ""}> I have seen their current CPR card</label>
      <label for="net_notes">Notes (how you know them, what families say)</label><textarea id="net_notes" name="notes">${esc(cur.notes || "")}</textarea>
      <button type="submit">${editing ? "Save changes" : "Add backup sitter"}</button></form>`;
    const sitters = n.sitters.length ? `<table><thead><tr><th>Backup</th><th>Ages / area</th><th>CPR card</th><th></th></tr></thead><tbody>${n.sitters.map((s) => `<tr><td><strong>${esc(s.name)}</strong><br><span class="note">${esc(s.contact)}${s.availability ? ` · ${esc(s.availability)}` : ""}${s.peerId ? ` · kit server: ${esc(s.peerId)}` : ""}</span></td><td>${esc(s.ages || "ask")}${s.maxKids ? `, up to ${esc(s.maxKids)} kids` : ""}<br><span class="note">${esc(s.area)}</span></td><td>${s.cprSeen ? `<span class="pill good">seen${s.cprSeenOn ? ` ${esc(s.cprSeenOn)}` : ""}</span>` : `<span class="pill cool">not seen</span>`}</td><td><button type="button" class="secondary small" data-net-edit="${esc(s.id)}">Edit</button><button type="button" class="secondary small" data-net-del="${esc(s.id)}">Remove</button></td></tr>`).join("")}</tbody></table>` : `<p class="note">No backup sitters yet. Add people you would trust with your own families.</p>`;

    const over = N.overflowLeads(desk);
    const openLeads = desk.leads.filter((l) => !["booked", "lost"].includes(l.status));
    if (pick && !openLeads.some((l) => l.id === pick)) pick = "";
    const chosen = pick || (over[0] && over[0].lead.id) || "";
    const lead = desk.leads.find((l) => l.id === chosen);
    const leadPart = `<label for="netPick">An inquiry you can't take</label><select id="netPick"><option value="">(choose)</option>${openLeads.map((l) => { const o = over.find((x) => x.lead.id === l.id); return `<option value="${esc(l.id)}"${l.id === chosen ? " selected" : ""}>${esc(l.name)}${o ? ` (can't take: ${esc(o.blockers.join(", ") || "declined")})` : ""}</option>`; }).join("")}</select>
      ${lead ? requestBlock(desk, N.requestFromLead(lead), "lead", lead.id) : `<p class="note">${over.length ? "" : "No inquiries you have to turn down right now."}</p>`}`;

    const sent = n.sent.slice().reverse().map((x) => {
      const sitter = n.sitters.find((s) => s.id === x.sitterId) || { name: "(removed)" };
      const req = { firstName: x.firstName, contact: x.contactOnFile || "", kids: (x.kids || []).map((k) => N.parseAgeRange(k)?.[0] ?? null).filter((v) => v !== null), when: x.when };
      const ok = N.canShare(x);
      const c = x.consent || {};
      const consent = ok
        ? `<span class="pill good">family said yes ${esc(String(c.at).slice(0, 10))} by ${esc(c.how)}${c.contact ? ", may share contact" : ""}</span> <button type="button" class="secondary small" data-net-withdraw="${esc(x.id)}">They changed their mind</button>`
        : `<span class="pill cool">no OK recorded${c.withdrawn ? " (withdrawn)" : ""}</span> <label class="note" style="display:inline">how they said yes <select data-net-how="${esc(x.id)}">${N.CONSENT_HOW.map((h) => `<option>${h}</option>`).join("")}</select></label><button type="button" class="small" data-net-consent="${esc(x.id)}|0">They said yes: pass on first name, ages, time</button><button type="button" class="small" data-net-consent="${esc(x.id)}|1">Yes, and share their contact too</button>`;
      const send = ok && sitter.peerId && sitter.peerUrl ? `<button type="button" class="small" data-net-send="${esc(x.id)}">${x.handoff ? "Sent to their kit server: send again" : "Send to their kit server"}</button>` : "";
      return `<div class="card" style="margin:8px 0"><strong>${esc(x.firstName || "A family")} → ${esc(sitter.name)}</strong> <span class="note">${esc(x.date)} · ${esc(x.when)} · ${esc((x.kids || []).join(", "))}${x.handoff ? ` · delivered ${esc(String(x.handoff.sentAt).slice(0, 10))}` : ""}</span>
        <label class="note" style="display:inline"> status <select data-net-status="${esc(x.id)}">${["suggested", "asked", "passed on", "booked", "declined"].map((s) => `<option${s === x.status ? " selected" : ""}>${s}</option>`).join("")}</select></label><br>${consent}
        <details${ok ? " open" : ""}><summary>Message to ${esc(sitter.name)}</summary><div class="msg">${esc(N.backupMessage(desk, req, sitter, x))}</div>${copy(N.backupMessage(desk, req, sitter, x))}</details>${send}</div>`;
    }).join("");

    const subs = N.subForMe(desk, today(), subDays);
    const sub = subs.length ? subs.map((s) => { const key = s.sit.key || s.sit.id; return `<div class="card" style="margin:8px 0"><strong>${esc(s.sit.date)} ${esc(s.sit.start)}-${esc(s.sit.end)}, ${esc(s.family || "a family")}</strong>
      ${s.backup ? `<p class="note">Suggested backup: ${esc(s.backup.sitter.name)} (${s.backup.reasons.map(esc).join("; ")})</p><div class="msg">${esc(s.offer)}</div>${copy(s.offer)}${n.sent.some((x) => x.bookingKey === key && x.sitterId === s.backup.sitter.id) ? "" : `<button type="button" class="small" data-net-start="${esc(`booking|${key}|${s.backup.sitter.id}`)}">Asked the family: track it</button>`}` : `<p class="note">No backup fits this sit; offer a cancellation.</p>`}
      <details${s.backup ? "" : " open"}><summary>Cancel with no fee instead</summary><div class="msg">${esc(s.cancel)}</div>${copy(s.cancel)}<button type="button" class="secondary small" data-net-cancel="${esc(key)}">Mark this sit cancelled, no fee</button></details></div>`; }).join("") : `<p class="note">No booked sits in the next ${subDays} day(s).</p>`;

    const st = N.networkStats(desk);
    const tbl = (head, rows) => rows.length ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<p class="note">None yet.</p>`;
    root.innerHTML = `
      <p class="note">People you trust to take work you can't. Pass on a family only with their OK: the app records when and how they said yes, and leaves their phone or email out of your message until they agree to that too. Nothing here is sent anywhere unless you copy a message or, with your own server, press Send.</p>
      <h3>Backup sitters</h3>${sitters}${form}
      <h3>Pass on a request</h3>${leadPart}
      <h3>Passed on (${n.sent.length})</h3>${sent || `<p class="note">Nothing passed on yet.</p>`}${out ? `<p class="note" role="status">${esc(out)}</p>` : ""}
      <h3>Sick? Find a sub</h3><label for="netDays">Booked sits in the next</label><input id="netDays" type="number" min="1" max="30" value="${subDays}" style="max-width:6rem"> days${sub}
      <h3>Referrals both ways</h3>
      <p class="note">Sent out: ${st.totals.sent} (${st.totals.sentBooked} booked). Sent to you by backup sitters: ${st.totals.received} (${st.totals.receivedBooked} booked). A lead counts as from a sitter when it came by their kit server or "How did you hear" names them.</p>
      <h4>You sent families to</h4>${tbl(["Sitter", "Passed on", "Booked"], st.sentOut.map((r) => `<tr><td>${esc(r.sitter)}</td><td>${r.sent}</td><td>${r.booked}</td></tr>`))}
      <h4>Sitters who sent families to you</h4>${tbl(["Sitter", "Leads", "Booked"], st.fromSitters.map((r) => `<tr><td>${esc(r.sitter)}</td><td>${r.leads}</td><td>${r.booked}</td></tr>`))}
      <h4>Families who sent families to you</h4>${tbl(["Family", "Code", "Leads", "Booked"], st.fromFamilies.map((r) => `<tr><td>${esc(r.family)}</td><td>${esc(r.code)}</td><td>${r.leads}</td><td>${r.booked}</td></tr>`))}`;
    out = "";
  }
  return render;
}
