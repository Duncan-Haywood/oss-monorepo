// Babysitting Business Kit: the Agreements tab. Edits the agreement settings, shows each
// family's status (signed, needs re-signing, unsigned) and photo choice, makes signing
// links for the sitter's own server, records paper signatures and opens printable copies.
// The logic lives in agreements.mjs; this file only draws and wires the panel.

import * as AG from "./agreements.mjs";

const FIELDS = [
  ["paymentDue", "Payment is due", "text", "at the end of each sit"],
  ["paymentMethods", "Payment methods", "text", "cash, Venmo or Zelle"],
  ["latePaymentDays", "Late-payment fee after (days, 0 = none)", "number"],
  ["latePaymentFee", "Late-payment fee ($)", "number"],
  ["latePickupGrace", "Late pick-up grace (minutes)", "number"],
  ["latePickupFee", "Late pick-up fee per started 15 minutes ($, 0 = none)", "number"],
  ["sick", "Sick-child policy", "area"],
  ["carSeat", "Car seat rule (used only if you drive the kids)", "area"],
  ["houseRules", "House rules you hold to everywhere (families add their own in house notes)", "area"],
  ["screenTime", "Screen time", "area"],
  ["otherTerms", "Anything else", "area"],
];

export function mountAgreements(el, { getDesk, save, esc, record = () => {}, serverUrl = () => "", openPage }) {
  if (!el) return () => {};
  const now = () => new Date().toISOString();
  const open = openPage || ((html) => { const u = URL.createObjectURL(new Blob([html], { type: "text/html" })); window.open(u, "_blank"); setTimeout(() => URL.revokeObjectURL(u), 60000); });

  el.addEventListener("change", (e) => {
    const t = e.target, desk = getDesk();
    if (t.dataset.agset) {
      const a = { ...((desk.profile && desk.profile.agreement) || {}) };
      a[t.dataset.agset] = t.type === "checkbox" ? t.checked : t.type === "number" ? (t.value === "" ? "" : Number(t.value)) : t.value.trim();
      desk.profile.agreement = a;
      if (AG.ensureVersion(desk, now())) record("agreement_new_version");
      save();
    } else if (t.dataset.agphoto) {
      const i = desk.families.findIndex((f) => f.id === t.dataset.agphoto);
      if (i >= 0) { desk.families[i] = AG.recordPhotoConsent(desk.families[i], t.value, now()); record("agreement_photo_recorded"); save(); }
    }
  });

  el.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const desk = getDesk();
    const id = t.dataset.aglink || t.dataset.agpaper || t.dataset.agprint || t.dataset.agcopy;
    const i = desk.families.findIndex((f) => f.id === id);
    if (i < 0) return;
    const fam = desk.families[i];
    if (t.dataset.aglink) { AG.ensureVersion(desk, now()); desk.families[i] = AG.createInvite(fam, now()); record("agreement_link_made"); save(); }
    if (t.dataset.agprint) { open(AG.agreementPrintPage(desk, fam)); record("agreement_printed"); }
    if (t.dataset.agcopy) { navigator.clipboard?.writeText(t.dataset.text || "").catch(() => {}); t.textContent = "Copied"; }
    if (t.dataset.agpaper) {
      const name = (prompt(`Full name of the parent who signed the paper copy (version ${AG.currentVersion(desk).v}):`) || "").trim();
      if (!name) return;
      AG.ensureVersion(desk, now());
      desk.families[i] = AG.recordPaperSignature(desk, fam, name, now());
      record("agreement_paper_signed");
      save();
    }
  });

  return function render() {
    const desk = getDesk();
    const a = AG.agreementSettings(desk.profile);
    const cur = AG.currentVersion(desk);
    const sum = AG.agreementSummary(desk, Date.now());
    const url = String(serverUrl() || "").replace(/\/+$/, "");
    const field = ([k, label, type, ph = ""]) => {
      const id = `ag_${k}`, v = a[k] ?? "";
      if (type === "area") return `<label for="${id}">${esc(label)}</label><textarea id="${id}" data-agset="${k}">${esc(v)}</textarea>`;
      return `<div><label for="${id}">${esc(label)}</label><input id="${id}" data-agset="${k}" type="${type}"${type === "number" ? ' min="0" step="1"' : ""} value="${esc(v)}" placeholder="${esc(ph)}"></div>`;
    };
    const small = FIELDS.filter((f) => f[2] !== "area"), big = FIELDS.filter((f) => f[2] === "area");
    const pill = { signed: "good", "needs re-signing": "warm", unsigned: "cool" };
    const rows = desk.families.map((f) => {
      const st = AG.agreementStatus(desk, f), inv = AG.inviteState(f, Date.now()), link = AG.inviteLink(f, url);
      const msg = link && inv === "open" ? AG.signatureMessage(f, link, desk.profile) : "";
      const photo = AG.photoConsent(f);
      return `<tr><td><strong>${esc(f.name)}</strong>${st.signature ? `<br><span class="note">${esc(st.signature.name)}, ${esc(String(st.signature.at).slice(0, 10))}, v${esc(st.signature.version)} (${st.signature.via === "paper" ? "paper" : "link"})</span>` : ""}</td>
<td><span class="pill ${pill[st.status]}">${esc(st.status)}</span>${inv === "open" ? `<br><span class="note">link open</span>` : inv === "expired" ? `<br><span class="note">link expired</span>` : ""}</td>
<td><select aria-label="Photo choice for ${esc(f.name)}" data-agphoto="${esc(f.id)}">${Object.keys(AG.PHOTO_CHOICES).map((k) => `<option value="${k}"${k === photo ? " selected" : ""}>${{ none: "no photos", private: "to the family only", public: "may be posted" }[k]}</option>`).join("")}</select></td>
<td>${url ? `<button type="button" class="secondary small" data-aglink="${esc(f.id)}">${inv === "open" ? "New link" : "Signing link"}</button>` : ""}<button type="button" class="secondary small" data-agpaper="${esc(f.id)}">Record paper signature</button><button type="button" class="secondary small" data-agprint="${esc(f.id)}">Print</button>${msg ? `<div class="msg">${esc(msg)}</div><button type="button" class="secondary small" data-agcopy="${esc(f.id)}" data-text="${esc(msg)}">Copy message</button> <span class="note">Sync so the link works.</span>` : ""}</td></tr>`;
    }).join("");
    el.innerHTML = `<p class="note"><strong>${esc(AG.NOT_LEGAL_ADVICE)}</strong></p>
<p>Version <strong>${cur.v}</strong>${cur.at ? ` since ${esc(cur.at.slice(0, 10))}` : ""}. Signed: ${sum.signed} · needs re-signing: ${sum["needs re-signing"]} · not signed: ${sum.unsigned}. <span class="note">Rates, holidays and cancellation fees come from Settings; changing any term here or there makes a new version, and families who signed an older one show "needs re-signing".</span></p>
<div class="grid">${small.map(field).join("")}</div>
<label><input type="checkbox" data-agset="drives"${a.drives === true ? " checked" : ""}> I drive children (only when parents ask, with the car seat rule below)</label>
<label><input type="checkbox" data-agset="emergency"${a.emergency !== false ? " checked" : ""}> Include emergency authorization (call 911, then parents; permission to get emergency care)</label>
<label><input type="checkbox" data-agset="faithClause"${a.faithClause === true ? " checked" : ""}> Include a faith clause: faith activities only if parents ask</label>
${big.map(field).join("")}
<details><summary>Preview the agreement text</summary><div class="msg" style="white-space:pre-wrap">${esc(AG.agreementText(desk, { name: "the Example family" }))}</div></details>
<h3>Families</h3>
${desk.families.length ? `<table><thead><tr><th>Family</th><th>Agreement</th><th>Photos</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="note">Add a family first.</p>`}
<p class="note">${url ? "A signing link works once, for 14 days. The family sees the exact text, types their full name and picks a photo choice; the time, version and a SHA-256 fingerprint of the text are kept with it." : "Set your server address in Settings, Sync to send signing links; without it, print a copy and record the paper signature."} "May be posted" is the only choice that lets a child's photo go on your website, posts or flyers.</p>`;
  };
}
