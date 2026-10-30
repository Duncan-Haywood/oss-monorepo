// Babysitting Business Kit: the "Sit reports and medicine" box in the Families tab.
// Write a report on a phone at the end of a sit, log medicine against the parents'
// written authorization, see each family's history, print an incident report and,
// with the sitter's own server set up for email, send the report to the parent.

import * as SR from "./sitreport.mjs";
import { newId } from "./engine.mjs";

export function mountSitReports(box, { getDesk, save, esc, record = () => {}, today, server = () => ({}) }) {
  if (!box) return () => {};
  let sel = "", histFamily = "", note = "";
  const famOf = (desk, id) => desk.families.find((f) => f.id === id) || {};
  const openPage = (html) => { const u = URL.createObjectURL(new Blob([html], { type: "text/html" })); if (!window.open(u, "_blank")) location.href = u; setTimeout(() => URL.revokeObjectURL(u), 60000); };
  const val = (id) => { const el = box.querySelector(`#${id}`); return el ? (el.type === "checkbox" ? el.checked : el.value) : ""; };
  const current = (desk) => { const [bookingId, date] = sel.split("|"); const b = desk.bookings.find((x) => x.id === bookingId); return b ? { b, date, family: famOf(desk, b.familyId) } : null; };

  function readReport(prev = {}) {
    return { ...prev, arrived: val("sr_arrived"), left: val("sr_left"), meals: val("sr_meals"), naps: val("sr_naps"), diapers: val("sr_diapers"), activities: val("sr_activities"), mood: val("sr_mood"), moodNote: val("sr_moodNote"), notes: val("sr_notes"),
      incident: { happened: val("sr_inc"), time: val("sr_incTime"), what: val("sr_incWhat"), firstAid: val("sr_incAid"), parentsTold: val("sr_incTold"), toldHow: val("sr_incHow"), followUp: val("sr_incFollow") } };
  }
  function store(report) {
    const desk = getDesk(), c = current(desk);
    if (!c) return null;
    const r = SR.saveReport(desk, c.b.id, c.date, report);
    save();
    return r;
  }

  box.addEventListener("change", (e) => {
    if (e.target.id === "sr_sit") { sel = e.target.value; note = ""; render(); }
    if (e.target.id === "sr_hist") { histFamily = e.target.value; render(); }
    if (e.target.id === "sr_inc") { const d = box.querySelector("#sr_incBox"); if (d) d.hidden = !e.target.checked; }
  });

  box.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t || !box.contains(t)) return;
    const desk = getDesk();
    if (t.id === "sr_save") {
      const c = current(desk);
      if (!c) return;
      SR.saveReport(desk, c.b.id, c.date, readReport(SR.getReport(desk, c.b.id, c.date) || {}));
      note = "Saved. Copy the message below, or email it.";
      record(SR.hasIncident(SR.getReport(desk, c.b.id, c.date)) ? "sitreport_incident" : "sitreport_saved");
      save();
    }
    if (t.id === "sr_dose") {
      const c = current(desk);
      if (!c) return;
      const auth = (c.family.medAuths || []).find((a) => a.id === val("sr_doseAuth"));
      const dose = { authId: auth ? auth.id : "", drug: auth ? auth.drug : val("sr_doseDrug"), child: auth ? auth.child : "", dose: val("sr_doseAmt") || (auth ? auth.dose : ""), at: val("sr_doseAt"), note: val("sr_doseNote") };
      const base = SR.getReport(desk, c.b.id, c.date) || readReport();
      const chk = SR.checkDose({ ...dose, id: "new" }, c.family, c.date, base.doses || []);
      if (chk.warnings.length && !confirm(`Stop and check before giving this:\n\n- ${chk.warnings.join("\n- ")}\n\nCall the parents if anything is unclear. Log it anyway (the warnings stay on the record)?`)) return;
      const out = SR.logDose({ ...readReport(base), doses: base.doses || [] }, dose, c.family, c.date, newId("dose"));
      store(out.report);
      note = out.warnings.length ? `Dose logged with ${out.warnings.length} warning(s).` : "Dose logged.";
      record("med_dose_logged");
      render();
    }
    if (t.dataset.srEmail !== undefined) {
      const c = current(desk), s = server();
      if (!c) return;
      const r = SR.getReport(desk, c.b.id, c.date);
      if (!r || !s.url || !s.key) return;
      try {
        const res = await fetch(`${s.url}/api/sitreport/email`, { method: "POST", headers: { authorization: `Bearer ${s.key}`, "content-type": "application/json" }, body: JSON.stringify({ bookingId: c.b.id, date: c.date, report: r }) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || `server said ${res.status}`);
        r.emailedAt = out.emailedAt;
        note = `Emailed to ${out.to}.`;
        record("sitreport_emailed");
        save();
      } catch (err) { note = `Not sent: ${err.message}`; render(); }
    }
    if (t.dataset.srIncident) {
      const [bookingId, date] = t.dataset.srIncident.split("|");
      const b = desk.bookings.find((x) => x.id === bookingId), r = SR.getReport(desk, bookingId, date);
      if (b && r) { openPage(SR.incidentReportPage(r, { family: famOf(desk, b.familyId), profile: desk.profile, booking: b })); record("incident_printed"); }
    }
    if (t.dataset.srOpen) { sel = t.dataset.srOpen; note = ""; render(); box.querySelector("#sr_sit")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
    if (t.id === "ma_save") {
      const f = desk.families.find((x) => x.id === val("ma_family"));
      if (!f) { alert("Choose a family."); return; }
      const a = SR.normalizeAuth({ id: newId("med"), child: val("ma_child"), drug: val("ma_drug"), dose: val("ma_dose"), times: val("ma_times"), asNeeded: val("ma_asNeeded"), windowMin: val("ma_window"), minHours: val("ma_minHours"), maxDoses: val("ma_max"), reason: val("ma_reason"), instructions: val("ma_instr"), parentName: val("ma_parent"), signedOn: val("ma_signed"), expires: val("ma_expires") });
      const s = SR.authStatus(a, today());
      if (!s.valid && !confirm(`This authorization is not complete yet:\n- ${s.problems.join("\n- ")}\nDoses against it will be flagged. Save it anyway?`)) return;
      f.medAuths = [...(f.medAuths || []), a];
      record("med_auth_saved");
      save();
    }
    if (t.dataset.maDel) {
      const [fid, aid] = t.dataset.maDel.split("|"), f = desk.families.find((x) => x.id === fid);
      if (f && confirm("Remove this authorization? Doses already logged keep their record.")) { f.medAuths = (f.medAuths || []).filter((a) => a.id !== aid); save(); }
    }
    if (t.id === "ma_print") { const f = famOf(desk, val("ma_family")); openPage(SR.medAuthFormPage(f, desk.profile)); record("med_auth_form_printed"); }
  });

  function render() {
    const desk = getDesk(), d = today();
    const sits = SR.reportableSits(desk, d);
    if (!sits.some((s) => `${s.bookingId}|${s.date}` === sel)) { const pick = sits.find((s) => s.date <= d) || sits[0]; sel = pick ? `${pick.bookingId}|${pick.date}` : ""; }
    const c = current(desk);
    const r = c ? SR.normalizeReport(SR.getReport(desk, c.b.id, c.date) || { arrived: c.b.start, left: c.b.end }, c.date) : null;
    const inc = (r && r.incident) || {};
    const opt = (v, t, on) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(t)}</option>`;
    const fld = (id, label, v, type = "text") => `<div><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(v || "")}"></div>`;
    const area = (id, label, v, ph = "") => `<label for="${id}">${label}</label><textarea id="${id}" placeholder="${esc(ph)}">${esc(v || "")}</textarea>`;
    const auths = c ? (c.family.medAuths || []) : [];
    const s = server();
    const form = !c ? `<p class="note">No sits from the last two weeks or tomorrow. Book one in the Schedule tab first.</p>` : `
      <div class="grid">${fld("sr_arrived", "Arrived", r.arrived, "time")}${fld("sr_left", "Left", r.left, "time")}
        <div><label for="sr_mood">Mood</label><select id="sr_mood">${opt("", "(choose)")}${SR.MOODS.map((m) => opt(m, m, r.mood === m)).join("")}</select></div>
        ${fld("sr_moodNote", "Mood, in a few words", r.moodNote)}</div>
      ${area("sr_meals", "Meals and snacks", r.meals, "Mac and cheese at 6, apple slices, milk")}
      ${area("sr_naps", "Nap or bedtime", r.naps, "In bed 7:45, asleep by 8:10")}
      ${area("sr_diapers", "Diapers or potty", r.diapers, "2 wet, 1 dirty at 7pm")}
      ${area("sr_activities", "Activities", r.activities, "Park, blocks, two library books")}
      ${area("sr_notes", "Anything to tell the parents", r.notes)}
      <label><input type="checkbox" id="sr_inc"${inc.happened ? " checked" : ""}> Something happened (an injury, illness, a fall, a bite, a scare)</label>
      <fieldset id="sr_incBox" style="border:2px solid var(--bad);border-radius:10px;padding:6px 12px"${inc.happened ? "" : " hidden"}><legend><span class="pill bad">Incident</span> In an emergency, call 911 first and the parents next; write this after.</legend>
        <div class="grid">${fld("sr_incTime", "When it happened", inc.time, "time")}${fld("sr_incTold", "When you told the parents", inc.parentsTold, "time")}${fld("sr_incHow", "How you told them", inc.toldHow)}</div>
        ${area("sr_incWhat", "What happened (facts: where, who, what you saw)", inc.what)}${area("sr_incAid", "First aid given", inc.firstAid, "Washed with water, bandage, ice pack 10 minutes")}${area("sr_incFollow", "What the parents should watch for or do next", inc.followUp)}</fieldset>
      <h4>Medicine during this sit <span class="note">(a record, not medical advice)</span></h4>
      ${auths.length ? `<ul>${auths.map((a) => { const st = SR.authStatus(a, c.date); return `<li>${esc(a.child ? `${a.child}: ` : "")}${esc(a.drug)} ${esc(a.dose)} at ${esc(a.asNeeded ? "as needed" : SR.normalizeAuth(a).times.map(SR.clock).join(", "))} <span class="note">signed by ${esc(a.parentName || "?")}${a.expires ? `, until ${esc(a.expires)}` : ""}</span>${st.valid ? "" : ` <span class="pill bad">${esc(st.problems.join("; "))}</span>`}</li>`; }).join("")}</ul>` : `<p class="note">No written authorization is on file for this family, so no medicine should be given. Add one below once the parents have filled in and signed the form.</p>`}
      ${(r.doses || []).length ? `<table><thead><tr><th>Time</th><th>Medicine</th><th>Check</th></tr></thead><tbody>${r.doses.map((x) => `<tr><td>${esc(SR.clock(x.at))}</td><td>${esc(x.child ? `${x.child}: ` : "")}${esc(x.drug)} ${esc(x.dose)}${x.note ? `<br><span class="note">${esc(x.note)}</span>` : ""}</td><td>${(x.warnings || []).length ? x.warnings.map((w) => `<span class="pill bad">warning</span> ${esc(w)}`).join("<br>") : `<span class="pill good">as authorized</span>`}</td></tr>`).join("")}</tbody></table>` : ""}
      <div class="grid"><div><label for="sr_doseAuth">Medicine given</label><select id="sr_doseAuth">${auths.map((a) => opt(a.id, `${a.child ? `${a.child}: ` : ""}${a.drug} ${a.dose}`)).join("")}${opt("", "(not on file)")}</select></div>
        ${fld("sr_doseDrug", "If not on file: medicine name", "")}${fld("sr_doseAmt", "Dose given (blank = authorized)", "")}${fld("sr_doseAt", "Time given", "", "time")}${fld("sr_doseNote", "Note", "")}</div>
      <button type="button" class="secondary" id="sr_dose">Log this dose</button>
      <p><button type="button" id="sr_save">Save report</button>${note ? ` <span class="note" role="status">${esc(note)}</span>` : ""}</p>
      ${SR.getReport(desk, c.b.id, c.date) ? (() => { const msg = SR.reportMessage(r, { family: c.family, profile: desk.profile }); return `<div class="msg">${esc(msg)}</div><button type="button" class="secondary small" data-copy="${esc(msg)}">Copy message</button>${s.url && s.key ? `<button type="button" class="secondary small" data-sr-email>${r.emailedAt ? "Email again" : "Email to the parent"}</button>` : ""}${r.emailedAt ? ` <span class="note">emailed ${esc(r.emailedAt.slice(0, 16).replace("T", " "))}</span>` : ""}${SR.hasIncident(r) ? `<button type="button" class="secondary small" data-sr-incident="${esc(sel)}">Print incident report</button>` : ""}`; })() : ""}
      ${s.url && s.key ? "" : `<p class="note">With your own server synced and its email set up, you can email reports straight to the parent.</p>`}`;

    if (!desk.families.some((f) => f.id === histFamily)) histFamily = (c && c.family.id) || (desk.families[0] || {}).id || "";
    const hist = histFamily ? SR.familyReports(desk, histFamily) : [];
    const stats = SR.reportStats(desk), alerts = SR.authAlerts(desk, d);
    box.innerHTML = `
      <h3>Sit reports</h3>
      <p class="note">Fill this in at the end of a sit and send it to the parents. It is saved on the sit. ${stats.reports} report(s), ${stats.incidents} incident(s), ${stats.doses} dose(s) logged${stats.flagged ? `, ${stats.flagged} with warnings` : ""}.</p>
      <div class="grid"><div><label for="sr_sit">Sit</label><select id="sr_sit">${sits.map((x) => opt(`${x.bookingId}|${x.date}`, `${x.date} ${x.start}-${x.end} ${famOf(desk, x.familyId).name || ""}${x.has ? " (report saved)" : ""}`, `${x.bookingId}|${x.date}` === sel)).join("")}</select></div></div>
      ${form}
      <h3>Report history</h3>
      <div class="grid"><div><label for="sr_hist">Family</label><select id="sr_hist">${desk.families.map((f) => opt(f.id, f.name, f.id === histFamily)).join("")}</select></div></div>
      ${hist.length ? `<table><thead><tr><th>Date</th><th>Summary</th><th></th></tr></thead><tbody>${hist.map((h) => `<tr><td>${esc(h.date)}</td><td>${SR.hasIncident(h.report) ? `<span class="pill bad">incident</span> ` : ""}${esc([h.report.mood, (h.report.doses || []).length ? `${h.report.doses.length} dose(s)` : "", h.report.emailedAt ? "emailed" : ""].filter(Boolean).join(" · "))}<details><summary>Message</summary><div class="msg">${esc(SR.reportMessage(h.report, { family: famOf(desk, histFamily), profile: desk.profile }))}</div></details></td><td>${h.bookingId && SR.reportableSits(desk, d).some((x) => x.bookingId === h.bookingId && x.date === h.date) ? `<button type="button" class="secondary small" data-sr-open="${esc(`${h.bookingId}|${h.date}`)}">Edit</button>` : ""}${SR.hasIncident(h.report) ? `<button type="button" class="secondary small" data-sr-incident="${esc(`${h.bookingId}|${h.date}`)}">Print incident</button>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="note">No reports for this family yet.</p>`}
      <h3>Medication authorizations</h3>
      <p class="note">Give medicine only with the parents' written authorization: the medicine, the dose, the times, the parent's name and the date. The app warns when a dose is outside those times or the authorization is missing or expired. It is a record, not medical advice; when in doubt, call the parents.</p>
      ${alerts.length ? `<p>${alerts.map((a) => `<span class="pill bad">check</span> ${esc(a.family)}: ${esc(a.child ? `${a.child}, ` : "")}${esc(a.drug || "medicine")}: ${esc(a.problems.join("; "))}`).join("<br>")}</p>` : ""}
      ${desk.families.filter((f) => (f.medAuths || []).length).map((f) => `<p><strong>${esc(f.name)}</strong><br>${f.medAuths.map((a) => `${esc(a.child ? `${a.child}: ` : "")}${esc(a.drug)} ${esc(a.dose)}, ${esc(a.asNeeded ? `as needed${a.minHours ? `, every ${a.minHours}h at most` : ""}` : SR.normalizeAuth(a).times.map(SR.clock).join(", "))} <span class="note">(${esc(a.parentName || "no parent name")}, ${esc(a.signedOn || "no date")} to ${esc(a.expires || "no end date")})</span> <button type="button" class="secondary small" data-ma-del="${esc(`${f.id}|${a.id}`)}">Remove</button>`).join("<br>")}</p>`).join("")}
      <details><summary>Add an authorization the parents signed</summary>
        <div class="grid"><div><label for="ma_family">Family</label><select id="ma_family">${desk.families.map((f) => opt(f.id, f.name, f.id === histFamily)).join("")}</select></div>
          ${fld("ma_child", "Child", "")}${fld("ma_drug", "Medicine (as on the label)", "")}${fld("ma_dose", "Dose (e.g. 5 ml)", "")}${fld("ma_times", "Times (e.g. 8am, 8pm)", "")}${fld("ma_window", "On time if within (minutes)", SR.DEFAULT_WINDOW_MIN, "number")}
          ${fld("ma_minHours", "As needed: at least hours apart", "", "number")}${fld("ma_max", "Most doses in one sit", "", "number")}${fld("ma_reason", "As needed: for what", "")}${fld("ma_parent", "Parent who signed", "")}${fld("ma_signed", "Signed on", "", "date")}${fld("ma_expires", "Valid until", "", "date")}</div>
        <label><input type="checkbox" id="ma_asNeeded"> As needed (no fixed times)</label>
        ${area("ma_instr", "Instructions (how to give it, storage, what to watch for)", "")}
        <button type="button" id="ma_save">Save authorization</button><button type="button" class="secondary" id="ma_print">Print a blank form for the parents</button>
      </details>`;
  }
  return render;
}
