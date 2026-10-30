// Babysitting Business Kit: the Automations box in Settings and the "sent automatically"
// list on the Today tab. The browser never sends; it edits the rules and previews what
// the sitter's own server would send (automations-server.mjs).

import { RULES, automationSettings, planAutomations, automationState, contactsOf, isOptedOut, recentSends, maskAddress } from "./automations.mjs";

export function mountAutomations({ getDesk, save, esc, record = () => {} }) {
  const box = document.getElementById("autoSettings");
  const todayBox = document.getElementById("autoToday");
  if (!box) return () => {};

  const update = (fn) => {
    const desk = getDesk();
    desk.profile.automations = { ...((desk.profile && desk.profile.automations) || {}) };
    fn(desk.profile.automations, desk);
    save();
  };

  box.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.rule) { update((a) => { a[t.dataset.rule] = t.checked; }); record(`automation_${t.dataset.rule}_${t.checked ? "on" : "off"}`); }
    else if (t.dataset.setting) update((a) => { a[t.dataset.setting] = t.value.trim(); });
    else if (t.dataset.famflag) {
      const [id, flag] = t.dataset.famflag.split(":");
      const desk = getDesk();
      const f = desk.families.find((x) => x.id === id);
      if (f) { f[flag] = t.checked; save(); }
    }
  });

  function render() {
    const desk = getDesk();
    const a = automationSettings(desk.profile);
    const plan = planAutomations(desk, { now: Date.now() });
    const rules = Object.entries(RULES).map(([k, label]) => `<label><input type="checkbox" data-rule="${k}"${a[k] ? " checked" : ""}> ${esc(label)}</label>`).join("");
    const fams = desk.families.map((f) => {
      const c = contactsOf(f);
      const out = [c.email && isOptedOut(desk, "email", c.email) ? "unsubscribed from email" : "", c.phone && isOptedOut(desk, "sms", c.phone) ? "texted STOP" : ""].filter(Boolean);
      return `<tr><td>${esc(f.name)}<br><span class="note">${esc([c.email, c.phone].filter(Boolean).join(" · ") || "no email or 10-digit mobile on file")}</span></td><td><input type="checkbox" aria-label="Birthday notes for ${esc(f.name)}" data-famflag="${esc(f.id)}:birthdayNotes"${f.birthdayNotes ? " checked" : ""}></td><td><input type="checkbox" aria-label="No automated messages for ${esc(f.name)}" data-famflag="${esc(f.id)}:optOut"${f.optOut ? " checked" : ""}></td><td>${out.length ? `<span class="pill bad">${esc(out.join(", "))}</span>` : ""}</td></tr>`;
    }).join("");
    const preview = plan.messages.length
      ? plan.messages.map((m) => `<div class="msg"><strong>${esc(m.channel === "sms" ? "Text" : "Email")} to ${esc(m.family)} (${esc(maskAddress(m.to))}), ${esc(RULES[m.rule])}</strong>\n${esc(m.body)}</div>`).join("")
      : `<p class="note">${plan.rulesOn.length ? "Nothing is due right now." : "Turn on a rule above to see what it would send."}</p>`;
    const held = plan.held.length ? `<p class="note">Held back: ${plan.held.map((h) => `${esc(h.family)} (${esc(RULES[h.rule])}): ${esc(h.reason)}`).join("; ")}</p>` : "";
    const log = automationState(desk).log.slice(-15).reverse();
    box.innerHTML = `
      <p class="note">Your own server (see the README) sends these with your Resend and Twilio keys; this page never sends anything. Nothing goes out between ${esc(a.quietStart)} and ${esc(a.quietEnd)}, nothing is sent twice, and every email has an unsubscribe line and every text says "Reply STOP to opt out". Only message families who gave you their number or email and are happy to hear from you.</p>
      ${rules}
      <div class="grid">
        <div><label for="a_rebook">Invite back after (quiet days)</label><input id="a_rebook" type="number" min="1" data-setting="rebookDays" value="${esc(a.rebookDays)}"></div>
        <div><label for="a_prefer">Send by</label><select id="a_prefer" data-setting="prefer">${[["email", "email, or text if no email"], ["sms", "text, or email if no mobile"], ["both", "both"]].map(([v, t]) => `<option value="${v}"${a.prefer === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>
        <div><label for="a_qs">Quiet from</label><input id="a_qs" type="time" data-setting="quietStart" value="${esc(a.quietStart)}"></div>
        <div><label for="a_qe">Quiet until</label><input id="a_qe" type="time" data-setting="quietEnd" value="${esc(a.quietEnd)}"></div>
        <div><label for="a_link">Testimonial link (blank = ask in the message)</label><input id="a_link" data-setting="testimonialLink" value="${esc(a.testimonialLink)}" placeholder="https://..."></div>
        <div><label for="a_addr">Mailing address for email footers (a PO box is fine)</label><input id="a_addr" data-setting="mailingAddress" value="${esc(a.mailingAddress)}"></div>
      </div>
      <h3>Families</h3>
      ${desk.families.length ? `<table><thead><tr><th>Family</th><th>Birthday notes</th><th>No automated messages</th><th>Opted out</th></tr></thead><tbody>${fams}</tbody></table>` : `<p class="note">Add a family first.</p>`}
      <h3>What would be sent now (${esc(plan.date)} ${esc(plan.time)}${plan.quiet ? `, quiet hours: held until ${esc(plan.quietUntil)}` : ""})</h3>
      <p class="note">Assumes email and texts are both set up on your server. The server's own preview is <code>/api/automations/preview</code>.</p>
      ${preview}${held}
      <h3>Recently sent by your server</h3>
      ${log.length ? `<ul>${log.map((e) => `<li>${esc(String(e.at).slice(0, 16).replace("T", " "))} ${esc(e.channel)} to ${esc(e.family)}: ${esc(RULES[e.rule] || e.rule)} ${e.ok ? "" : `<span class="pill bad">failed${e.error ? `: ${esc(e.error)}` : ""}</span>`}</li>`).join("")}</ul>` : `<p class="note">Nothing yet. Sync with your server to see what it sent.</p>`}`;

    if (todayBox) {
      const recent = recentSends(desk, new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
      todayBox.innerHTML = recent.length ? `<h3>Sent automatically in the last 7 days</h3><ul>${recent.slice(0, 20).map((e) => `<li>${esc(String(e.at).slice(0, 10))}: ${esc(e.channel === "sms" ? "text" : "email")} to ${esc(e.family)}, ${esc(RULES[e.rule] || e.rule)}</li>`).join("")}</ul>` : "";
    }
  }
  return render;
}
