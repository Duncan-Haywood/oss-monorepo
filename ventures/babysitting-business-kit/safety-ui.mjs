// Babysitting Business Kit: the Safety tab. The late-sit check-in is started here and
// lives on the sitter's own server (safety-server.mjs), which is the only thing that
// can send an alert; the emergency card and house checklist work offline in the browser.

import { newCheckin, checkinAction, safetyState, upsertCheckin, sharedPlace, safetyToken, GRACE_DEFAULT, GRACE_MIN, GRACE_MAX, checklistState, setChecklistItem, emergencyCard, emergencyCardData, deadline } from "./safety.mjs";

export function mountSafety(root, { getDesk, save, esc, record = () => {}, today, server = () => ({ url: "", key: "" }), openPage }) {
  if (!root) return () => {};
  let famId = "";
  let message = "";

  const fmt = (iso) => { try { return new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };
  const localInput = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

  async function push(c) {
    const { url, key } = server();
    if (!/^https?:\/\//.test(url) || !key) throw new Error("Add your server address and admin key in Settings (Sync) first: only your own server can send the alert.");
    const r = await fetch(`${url}/api/safety/checkin`, { method: "PUT", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(c) });
    let out = {};
    try { out = await r.json(); } catch { /* not JSON */ }
    if (!r.ok || !out.ok) throw new Error(out.why || `server said ${r.status}`);
    return out;
  }

  async function act(id, action, minutes) {
    const desk = getDesk();
    const c = safetyState(desk).checkins.find((x) => x.id === id);
    if (!c) return;
    const r = checkinAction(c, action, Date.now(), minutes);
    if (!r.ok) { message = r.why; render(); return; }
    try {
      const out = await push(r.checkin);
      upsertCheckin(desk, out.checkin);
      message = action === "home" ? "Glad you're home." : action === "extend" ? `Extended to ${fmt(out.checkin.homeBy)}.` : "Cancelled.";
      record(`safety_${action}`);
    } catch (e) { message = `Not saved: ${e.message}`; }
    save();
  }

  root.addEventListener("submit", async (e) => {
    if (e.target.id !== "sf_form") return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const desk = getDesk();
    const fam = desk.families.find((x) => x.id === f.family) || null;
    const homeMs = Date.parse(f.homeBy); // datetime-local: read in this browser's time zone
    if (!Number.isFinite(homeMs)) { message = "Enter the time you expect to be home."; render(); return; }
    if (homeMs < Date.now() - 5 * 60000) { message = "That home-by time has already passed."; render(); return; }
    const n = newCheckin({ contactName: f.contactName, contactPhone: f.contactPhone, contactEmail: f.contactEmail, place: sharedPlace(fam, desk.profile, f.share), homeBy: new Date(homeMs).toISOString(), graceMin: f.graceMin }, { id: `chk_${Date.now().toString(36)}`, token: safetyToken(crypto.getRandomValues(new Uint8Array(16))), nowMs: Date.now() });
    if (!n.ok) { message = n.why; render(); return; }
    try {
      const out = await push(n.checkin);
      upsertCheckin(desk, out.checkin);
      desk.profile.safetyContact = { name: n.checkin.contactName, phone: n.checkin.contactPhone, email: n.checkin.contactEmail, share: f.share };
      message = "Check-in started.";
      record("safety_checkin_started");
    } catch (err) { message = `Not started: ${err.message}`; }
    save();
  });

  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.sfAct) { const [id, action, min] = t.dataset.sfAct.split(":"); act(id, action, Number(min) || 30); }
    if (t.dataset.sfCard) { openPage(emergencyCard(getDesk(), t.dataset.sfCard, today())); record("emergency_card_opened"); }
  });

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "sf_fam") { famId = t.value; render(); return; }
    if (t.id === "sf_family" || t.name === "share") { const out = root.querySelector("#sf_place"); if (out) out.textContent = placePreview(); return; }
    if (t.dataset.sfItem) {
      const desk = getDesk();
      const i = desk.families.findIndex((x) => x.id === famId);
      if (i < 0) return;
      desk.families[i] = setChecklistItem(desk.families[i], t.dataset.sfItem, t.type === "checkbox" ? { done: t.checked } : { note: t.value }, today());
      record("safety_checklist_edited");
      save();
    }
  });

  function placePreview() {
    const desk = getDesk();
    const fam = desk.families.find((x) => x.id === (root.querySelector("#sf_family") || {}).value);
    const share = (root.querySelector("input[name=share]:checked") || {}).value || "town";
    const p = sharedPlace(fam, desk.profile, share);
    return p ? `Your contact will see: "${p}".` : "Your contact will see no place, only the time.";
  }

  function render() {
    const desk = getDesk();
    const { url } = server();
    const list = safetyState(desk).checkins.slice().reverse();
    const open = list.filter((c) => c.status === "active" || c.status === "alerted");
    const done = list.filter((c) => !open.includes(c)).slice(0, 5);
    const sc = desk.profile.safetyContact || {};
    const link = (c) => (url ? `${url}/safe/${c.token}` : "");
    const openRows = open.map((c) => `<div class="card" style="margin:10px 0"><strong>${c.status === "alerted" ? `<span class="pill bad">${esc(c.contactName)} was alerted</span>` : `Home by ${esc(fmt(c.homeBy))}`}</strong><br><span class="note">${esc(c.contactName)} is alerted at ${esc(fmt(new Date(deadline(c)).toISOString()))}${c.place ? `, told "${esc(c.place)}"` : ""}.</span><br>
      <button type="button" data-sf-act="${esc(c.id)}:home">I'm home safe</button>${c.status === "active" ? `<button type="button" class="secondary small" data-sf-act="${esc(c.id)}:extend:30">+30 min</button><button type="button" class="secondary small" data-sf-act="${esc(c.id)}:extend:60">+1 hour</button><button type="button" class="secondary small" data-sf-act="${esc(c.id)}:cancel">Cancel</button>` : ""}
      ${link(c) ? `<p class="note">Your private link for your phone (bookmark it; works without the app): <button type="button" class="secondary small" data-copy="${esc(link(c))}">Copy link</button></p>` : ""}</div>`).join("");
    const fams = desk.families.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
    if (!desk.families.some((f) => f.id === famId)) famId = (desk.families[0] || {}).id || "";
    const fam = desk.families.find((f) => f.id === famId);
    let cardBox = `<p class="note">Add a family first.</p>`;
    if (fam) {
      const cl = checklistState(fam);
      const d = emergencyCardData(desk, fam.id, today());
      cardBox = `<label for="sf_fam">Family</label><select id="sf_fam">${desk.families.map((f) => `<option value="${esc(f.id)}"${f.id === famId ? " selected" : ""}>${esc(f.name)}</option>`).join("")}</select>
        <p><button type="button" data-sf-card="${esc(fam.id)}">Open the emergency card (print or keep offline)</button></p>
        ${d.missing.length ? `<p class="note">The card is missing: ${esc(d.missing.join(", "))}. Ask at the meet-and-greet, or send the info sheet from the Families tab.</p>` : `<p class="note">The card has an address, cross streets, a parent's phone, an emergency contact and the doctor.</p>`}
        <label for="sf_cross">Nearest cross streets (for 911)</label><input id="sf_cross" data-sf-item="crossStreets" value="${esc(cl.crossStreets)}" placeholder="Oak St and 5th Ave">
        <h3>House safety walk-through (${cl.done} of ${cl.total})</h3>
        <p class="note">Walk through these with the parents on the first visit. Notes on exits, the first-aid kit and medicines print on the card.${cl.checkedOn ? ` Last updated ${esc(cl.checkedOn)}.` : ""}</p>
        ${cl.rows.map((r) => `<div style="margin:8px 0"><label><input type="checkbox" data-sf-item="${r.id}"${r.done ? " checked" : ""}> <strong>${esc(r.label)}</strong></label><input aria-label="${esc(r.label)}: notes" data-sf-item="${r.id}" value="${esc(r.note)}" placeholder="${esc(r.ask)}"></div>`).join("")}`;
    }
    root.innerHTML = `
      <h3>Late-sit check-in</h3>
      <p class="note">Before a late sit, name someone you trust and when you expect to be home. If you have not tapped "I'm home safe" by then plus the grace period, your own server texts or emails them, at any hour (quiet hours do not apply to this). They are told only your name, your phone, the time and the place you choose below, never anything about the children. It needs your server with texts (Twilio) or email (Resend) set up; see <a href="self-host.html">self-hosting</a>.</p>
      ${message ? `<p class="msg">${esc(message)}</p>` : ""}
      ${openRows}
      <form id="sf_form">
        <div class="grid">
          <div><label for="sf_cn">Trusted contact</label><input id="sf_cn" name="contactName" required value="${esc(sc.name)}"></div>
          <div><label for="sf_cp">Their mobile</label><input id="sf_cp" name="contactPhone" type="tel" value="${esc(sc.phone)}"></div>
          <div><label for="sf_ce">or their email</label><input id="sf_ce" name="contactEmail" type="email" value="${esc(sc.email)}"></div>
          <div><label for="sf_hb">Home by</label><input id="sf_hb" name="homeBy" type="datetime-local" required value="${esc(localInput(Date.now() + 4 * 36e5))}"></div>
          <div><label for="sf_g">Grace period (minutes)</label><input id="sf_g" name="graceMin" type="number" min="${GRACE_MIN}" max="${GRACE_MAX}" value="${GRACE_DEFAULT}"></div>
          <div><label for="sf_family">Sit with (optional)</label><select id="sf_family" name="family"><option value="">(not saying)</option>${fams}</select></div>
        </div>
        <fieldset><legend>What your contact may see about where you are</legend>
          ${[["town", "the family's town"], ["street", "the street and town (no house number)"], ["none", "nothing, only the time"]].map(([v, t]) => `<label><input type="radio" name="share" value="${v}"${(sc.share || "town") === v ? " checked" : ""}> ${t}</label>`).join("")}
          <p class="note" id="sf_place"></p></fieldset>
        <button type="submit">Start check-in</button>
      </form>
      ${done.length ? `<p class="note">Recent: ${done.map((c) => `${esc(fmt(c.homeBy))} ${esc(c.status)}`).join("; ")}</p>` : ""}
      <h3>Emergency card and house checklist</h3>
      <p class="note">Built from the family's record and info sheet. It opens offline in this browser. <strong>Call 911 first</strong> in an emergency; Poison Help is 1-800-222-1222.</p>
      ${cardBox}`;
    const pp = root.querySelector("#sf_place");
    if (pp) pp.textContent = placePreview();
  }
  return render;
}
