// Babysitting Business Kit: the Credentials box and business-readiness checklist in
// Settings, and expiry reminders on the Today tab. Logic lives in credentials.mjs.

import { KINDS, STRUCTURES, credentialFromForm, credentialStatus, credentialReminders, dismissReminder, readiness, normalizeBusiness, syncSiteCerts, expiryDay } from "./credentials.mjs";

const GUIDE = "babysitting-business-setup.html";

export function mountCredentials({ getDesk, save, esc, record = () => {}, today }) {
  const box = document.getElementById("credSettings");
  const todayBox = document.getElementById("credToday");
  if (!box) return () => {};
  let editing = "";

  const commit = (desk) => { syncSiteCerts(desk); save(); };

  box.addEventListener("submit", (e) => {
    if (e.target.id !== "credForm") return;
    e.preventDefault();
    const desk = getDesk();
    const fields = Object.fromEntries(new FormData(e.target));
    const list = Array.isArray(desk.credentials) ? desk.credentials : (desk.credentials = []);
    const old = list.find((c) => c.id === editing);
    const c = credentialFromForm(fields, editing || undefined);
    if (old && old.expires === c.expires && old.dismissed) c.dismissed = old.dismissed;
    if (old) list[list.indexOf(old)] = c; else list.push(c);
    editing = "";
    record(old ? "credential_edited" : "credential_added");
    commit(desk);
  });

  box.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.dataset.biz) return;
    const desk = getDesk();
    desk.business = normalizeBusiness({ ...normalizeBusiness(desk.business), [t.dataset.biz]: t.type === "checkbox" ? t.checked : t.value });
    record(`readiness_${t.dataset.biz}`);
    save();
  });

  box.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const desk = getDesk();
    if (t.dataset.credEdit) {
      editing = t.dataset.credEdit;
      render();
      box.querySelector("#cr_kind").focus();
    } else if (t.dataset.credDel) {
      if (!confirm("Delete this credential?")) return;
      desk.credentials = (desk.credentials || []).filter((c) => c.id !== t.dataset.credDel);
      // A deleted item's website line goes too: syncSiteCerts only rewrites names it tracks.
      const site = desk.profile.site;
      const gone = t.dataset.credName;
      if (site && typeof site.certs === "string" && gone) site.certs = site.certs.split(/\r?\n/).filter((l) => l.split("|")[0].trim().toLowerCase() !== gone.toLowerCase()).join("\n");
      commit(desk);
    } else if (t.dataset.credCancel !== undefined) {
      editing = "";
      render();
    }
  });

  if (todayBox) todayBox.addEventListener("click", (e) => {
    const t = e.target.closest("button[data-cred-done]");
    if (!t) return;
    const [id, step] = t.dataset.credDone.split(":");
    dismissReminder(getDesk(), id, step);
    record("credential_reminder_done");
    save();
  });

  function form(c) {
    const v = (k) => esc((c && c[k]) || "");
    const kinds = Object.entries(KINDS).map(([k, x]) => `<option value="${k}"${c && c.kind === k ? " selected" : ""}>${esc(x.label)}</option>`).join("");
    return `<form id="credForm">
      <div class="grid">
        <div><label for="cr_kind">What</label><select id="cr_kind" name="kind">${kinds}</select></div>
        <div><label for="cr_name">Name shown (blank = the kind)</label><input id="cr_name" name="name" value="${v("name")}" placeholder="Pediatric CPR and First Aid"></div>
        <div><label for="cr_provider">Provider</label><input id="cr_provider" name="provider" value="${v("provider")}" placeholder="who issued it"></div>
        <div><label for="cr_issued">Issued</label><input id="cr_issued" name="issued" type="date" value="${v("issued")}"></div>
        <div><label for="cr_expires">Expires</label><input id="cr_expires" name="expires" type="date" value="${esc(c && c.expires ? expiryDay(c.expires) : "")}"></div>
        <div><label for="cr_note">Where the file is</label><input id="cr_note" name="note" value="${v("note")}" placeholder="card in wallet; PDF in email"></div>
      </div>
      <label><input type="checkbox" name="onSite"${c ? (c.onSite ? " checked" : "") : " checked"}> Show on my website (hidden automatically once it expires)</label>
      <p class="note">Keep only names, dates and where the paper is. Never type a licence, policy or Social Security number here.</p>
      <button type="submit">${c ? "Save changes" : "Add credential"}</button>${c ? `<button type="button" class="secondary" data-cred-cancel>Cancel</button>` : ""}
    </form>`;
  }

  function render() {
    const desk = getDesk();
    const now = today();
    const creds = Array.isArray(desk.credentials) ? desk.credentials : [];
    const b = normalizeBusiness(desk.business);
    const pill = (c) => {
      const s = credentialStatus(c, now);
      if (s.state === "expired") return `<span class="pill bad">expired</span>`;
      if (s.state === "expiring") return `<span class="pill warm">${s.days} days left</span>`;
      if (s.state === "current") return `<span class="pill good">current</span>`;
      return `<span class="pill cool">no expiry date</span>`;
    };
    const rows = creds.map((c) => `<tr><td><strong>${esc(c.name || (KINDS[c.kind] || KINDS.other).label)}</strong><br><span class="note">${esc(c.provider)}${c.note ? ` · ${esc(c.note)}` : ""}</span></td><td>${esc(c.issued)}</td><td>${esc(c.expires)}<br>${pill(c)}</td><td>${c.onSite ? "yes" : "no"}</td><td><button type="button" class="secondary small" data-cred-edit="${esc(c.id)}">Edit</button><button type="button" class="secondary small" data-cred-del="${esc(c.id)}" data-cred-name="${esc(c.name)}">Delete</button></td></tr>`).join("");
    const r = readiness(desk, now);
    const check = (k, label) => `<label><input type="checkbox" data-biz="${k}"${b[k] ? " checked" : ""}> ${esc(label)}</label>`;
    const structure = `<div class="grid"><div><label for="cr_structure">Business structure</label><select id="cr_structure" data-biz="structure"><option value="">(not decided)</option>${Object.entries(STRUCTURES).map(([k, x]) => `<option value="${k}"${b.structure === k ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></div></div>`;
    box.innerHTML = `
      <p class="note">Your CPR and First Aid card, background check, insurance and any local licence, with their dates. Today reminds you 60, 30 and 7 days before each expires. Ticked items go into your website's certifications list, and the site drops one the day after it expires. Plain-language background: <a href="${GUIDE}">Setting up your babysitting business</a>.</p>
      ${form(creds.find((c) => c.id === editing))}
      ${creds.length ? `<table><thead><tr><th>Credential</th><th>Issued</th><th>Expires</th><th>On site</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="note">Nothing tracked yet.</p>`}
      <h3>Business readiness: ${r.done} of ${r.total} done</h3>
      ${structure}
      ${check("ein", "I have a taxpayer ID ready for families (an EIN, or my SSN given on Form W-10)")}
      ${check("bank", "I keep business money in a separate account")}
      ${check("records", "I record every payment and keep receipts")}
      ${check("drivesKids", "I drive children (adds driver's license and car insurance)")}
      ${check("licenseChecked", "I checked my state and city licensing rules")}
      <ul id="readinessList">${r.items.map((x) => `<li>${x.done ? `<span class="pill good">done</span>` : `<span class="pill warm">missing</span>`} <strong>${esc(x.label)}</strong> <span class="note">${esc(x.detail)} <a href="${GUIDE}#${esc(x.guide)}">Why</a></span></li>`).join("")}</ul>`;
    if (todayBox) {
      const items = credentialReminders(desk, now);
      todayBox.innerHTML = items.map((i) => `<div class="card" style="margin:10px 0"><strong>${esc(i.title)}</strong><div class="msg">${esc(i.message)}</div><button type="button" class="small" data-cred-done="${esc(i.id)}:${i.step}">Done for now</button></div>`).join("");
    }
  }
  return render;
}
