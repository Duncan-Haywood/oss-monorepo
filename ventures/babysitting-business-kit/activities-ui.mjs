// The "Activities" tab: a plan for each sit, the bag of tricks per family, a printable plan
// for the parents, and the activity library. DOM code only; the logic is activities.mjs.
import * as ACT from "./activities.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const openPage = (html) => { const u = URL.createObjectURL(new Blob([html], { type: "text/html" })); if (!window.open(u, "_blank")) location.href = u; setTimeout(() => URL.revokeObjectURL(u), 60000); };
const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(t)}</option>`;

/**
 * mountActivities(root, { getDesk, save, record, today })
 * `save` stores the desk (and re-renders the app). The panel refreshes itself whenever it
 * is shown.
 */
export function mountActivities(root, { getDesk, save, record = () => {}, today }) {
  let plan = null;
  let shuffle = 0;
  root.innerHTML = `
    <p class="note">A plan for each sit from ${ACT.LIBRARY.length} activities, balanced between active, calm, creative, a snack and winding down, fitted to the kids' ages, the weather and the time of day. Anything that clashes with a child's allergies on the family record is left out, and so are small parts for children under 3. Always check food with the parents.</p>
    <div class="grid">
      <div><label for="ac_sit">Sit</label><select id="ac_sit"></select></div>
      <div><label for="ac_family">Or plan for a family</label><select id="ac_family"></select></div>
      <div><label for="ac_weather">Weather</label><select id="ac_weather">${ACT.WEATHER.map((w) => opt(w, ACT.WEATHER_LABEL[w])).join("")}</select></div>
      <div><label for="ac_bed">Bedtime (this family)</label><input id="ac_bed" type="time"></div>
    </div>
    <div class="grid" id="ac_famopts"></div>
    <p><button type="button" id="ac_go">Make a plan</button><button type="button" class="secondary" id="ac_again">Different ideas</button><button type="button" class="secondary" id="ac_print">Print for the parents</button><button type="button" class="secondary" id="ac_save">Save plan to this sit</button><button type="button" class="secondary" id="ac_bag">Bag of tricks</button></p>
    <div id="ac_out" aria-live="polite"></div>
    <h3>Activity library</h3>
    <div class="grid">
      <div><label for="ac_band">Age</label><select id="ac_band">${opt("", "All ages")}${ACT.BANDS.map((b) => opt(b, ACT.BAND_LABEL[b])).join("")}</select></div>
      <div><label for="ac_kind">Type</label><select id="ac_kind">${opt("", "All types")}${ACT.KINDS.map((k) => opt(k, ACT.KIND_LABEL[k])).join("")}</select></div>
      <div><label for="ac_place">Where</label><select id="ac_place">${opt("", "Inside or out")}${opt("in", "Inside")}${opt("out", "Outside")}</select></div>
    </div>
    <div id="ac_lib"></div>`;
  const $ = (id) => root.querySelector(`#${id}`);

  const family = () => getDesk().families.find((f) => f.id === $("ac_family").value) || null;
  const sit = () => ACT.upcomingSits(getDesk(), today()).find((b) => b.key === $("ac_sit").value) || null;

  function refreshSelects() {
    const desk = getDesk();
    const keepSit = $("ac_sit").value, keepFam = $("ac_family").value;
    const famName = (id) => (desk.families.find((f) => f.id === id) || {}).name || "family";
    const sits = ACT.upcomingSits(desk, today());
    $("ac_sit").innerHTML = opt("", sits.length ? "Choose a sit" : "No sits in the next 30 days") + sits.map((b) => opt(b.key, `${b.date} ${b.start}-${b.end} ${famName(b.familyId)}`, b.key === keepSit)).join("");
    $("ac_family").innerHTML = opt("", desk.families.length ? "Choose a family" : "Add a family first") + desk.families.map((f) => opt(f.id, f.name || "family", f.id === keepFam)).join("");
    famOpts();
  }

  function famOpts() {
    const desk = getDesk();
    const f = family();
    $("ac_bed").value = (f && f.bedtime) || "";
    const faithOn = desk.profile.showFaith && String(desk.profile.faithActivities || "").trim();
    $("ac_famopts").innerHTML = f ? `<label><input type="checkbox" id="ac_screens"${f.screensOk ? " checked" : ""}> The parents allow a show or movie</label>${faithOn ? `<label><input type="checkbox" id="ac_faith"${f.faithActivities ? " checked" : ""}> The parents asked for faith-based activities</label>` : ""}` : "";
  }

  function make() {
    const desk = getDesk();
    const b = sit();
    const f = family();
    if (!b && !f) { $("ac_out").innerHTML = `<p class="note">Choose a sit or a family.</p>`; plan = null; return; }
    const opts = { weather: $("ac_weather").value, seed: shuffle ? `${shuffle}` : undefined };
    plan = b ? ACT.planForBooking(desk, b, opts) : ACT.planSit(desk, { ...opts, familyId: f.id, date: today(), start: "15:00", end: "18:00", avoid: ACT.recentActivityIds(desk, f.id) });
    const kids = plan.kids.map((k) => `${esc(k.name)}${k.band ? ` <span class="note">(${esc(ACT.BAND_LABEL[k.band])})</span>` : ""}${k.allergens.length ? ` <span class="pill bad">${esc(k.allergyText)}</span>` : ""}`).join(", ");
    const rows = plan.slots.map((s) => `<tr><td>${esc(s.at)}</td><td>${esc(ACT.KIND_LABEL[s.kind])}</td><td><strong>${esc(s.title)}</strong>${s.faith ? ' <span class="pill cool">faith</span>' : ""}<br><span class="note">${esc(s.how)}</span>${s.side.map((x) => `<br>For ${esc(x.child)}: <strong>${esc(x.title)}</strong>`).join("")}${s.note ? `<br><span class="note">${esc(s.note)}</span>` : ""}</td><td class="n">${s.minutes}</td></tr>`).join("");
    const left = [...new Map(plan.avoided.map((a) => [a.id, a])).values()];
    $("ac_out").innerHTML = `
      ${plan.warnings.map((w) => `<p class="msg">${esc(w)}</p>`).join("")}
      <p>${kids || "No kids on record."} ${plan.bedtime ? `Bedtime ${esc(plan.bedtime)}${plan.asleep ? `, then about ${Math.round(plan.asleep / 6) / 10} h asleep` : ""}.` : ""}</p>
      <div style="overflow-x:auto"><table><thead><tr><th>Time</th><th>Type</th><th>Activity</th><th class="n">Min</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${plan.free >= 15 ? `<p class="note">${plan.free} minutes left for free play.</p>` : ""}
      <h4>Supplies</h4><ul>${plan.supplies.map((s) => `<li>${esc(s.item)}${s.food ? " <span class=\"note\">(food: check with the parents)</span>" : ""}</li>`).join("") || "<li>Nothing special</li>"}</ul>
      ${left.length ? `<p class="note">Left out for allergies or ages: ${left.map((a) => `${esc(a.title)} (${esc(a.reason)}, ${esc(a.child)})`).join("; ")}.</p>` : ""}
      ${savedHtml()}`;
    record("activity_plan_made");
  }

  function savedHtml() {
    const desk = getDesk();
    if (!plan || !plan.bookingKey) return "";
    const saved = (desk.activityPlans || []).find((p) => p.bookingKey === plan.bookingKey && p.date === plan.date);
    if (!saved) return "";
    return `<h4>Saved for this sit: tick what you did</h4><ul style="list-style:none;padding-left:0">${saved.items.map((it, i) => `<li><label><input type="checkbox" data-acdone="${i}"${it.done !== false ? " checked" : ""}> ${esc(it.title)}${it.kids && it.kids.length ? ` <span class="note">(${esc(it.kids.join(", "))})</span>` : ""}</label></li>`).join("")}</ul>`;
  }

  function renderLib() {
    const list = ACT.library({ band: $("ac_band").value || undefined, kind: $("ac_kind").value || undefined, place: $("ac_place").value || undefined });
    $("ac_lib").innerHTML = `<p class="note">${list.length} activit${list.length === 1 ? "y" : "ies"}.</p>` + list.map((a) => `<details><summary><strong>${esc(a.title)}</strong> <span class="note">${esc(ACT.KIND_LABEL[a.kind])}, ${a.minutes} min, ${a.place === "out" ? "outside" : a.place === "in" ? "inside" : "inside or out"}${a.mess ? `, ${a.mess > 1 ? "messy" : "a little mess"}` : ""}</span></summary><p>${esc(a.how)}</p>${a.supplies.length ? `<p class="note">Supplies: ${esc(a.supplies.join(", "))}</p>` : ""}${a.safety ? `<p class="note">${esc(a.safety)}</p>` : ""}<p class="note">Ages: ${a.ages.map((b) => esc(ACT.BAND_LABEL[b])).join(", ")}${a.allergens.length ? `. Contains: ${esc(a.allergens.join(", "))}` : ""}</p></details>`).join("");
  }

  $("ac_sit").addEventListener("change", () => { const b = sit(); if (b) $("ac_family").value = b.familyId || ""; famOpts(); shuffle = 0; make(); });
  $("ac_family").addEventListener("change", () => { $("ac_sit").value = ""; famOpts(); shuffle = 0; make(); });
  $("ac_weather").addEventListener("change", make);
  $("ac_go").addEventListener("click", () => { shuffle = 0; make(); });
  $("ac_again").addEventListener("click", () => { shuffle += 1; make(); });
  $("ac_bed").addEventListener("change", () => { const f = family(); if (!f) return; f.bedtime = $("ac_bed").value; save(); make(); });
  root.addEventListener("change", (e) => {
    const f = family();
    if (e.target.id === "ac_screens" && f) { f.screensOk = e.target.checked; save(); make(); }
    if (e.target.id === "ac_faith" && f) { f.faithActivities = e.target.checked; save(); make(); }
    if (e.target.dataset && e.target.dataset.acdone !== undefined && plan) {
      const desk = getDesk();
      const saved = (desk.activityPlans || []).find((p) => p.bookingKey === plan.bookingKey && p.date === plan.date);
      if (saved && saved.items[Number(e.target.dataset.acdone)]) { saved.items[Number(e.target.dataset.acdone)].done = e.target.checked; save(); }
    }
  });
  $("ac_print").addEventListener("click", () => { if (!plan) make(); if (plan) { openPage(ACT.planPage(plan, getDesk().profile)); record("activity_plan_printed"); } });
  $("ac_save").addEventListener("click", () => {
    if (!plan) make();
    if (!plan || !plan.bookingKey) { $("ac_out").insertAdjacentHTML("afterbegin", `<p class="msg">Choose a sit to save the plan to.</p>`); return; }
    const desk = getDesk();
    desk.activityPlans = ACT.savePlan(desk, ACT.planRecord(plan));
    record("activity_plan_saved");
    save();
    make();
  });
  $("ac_bag").addEventListener("click", () => { const f = family(); if (!f) { $("ac_out").innerHTML = `<p class="note">Choose a family (or a sit) first.</p>`; return; } openPage(ACT.bagPage(ACT.bagOfTricks(getDesk(), f.id, today()))); record("bag_of_tricks"); });
  for (const id of ["ac_band", "ac_kind", "ac_place"]) $(id).addEventListener("change", renderLib);

  // refresh the lists whenever the tab is shown (families and sits change elsewhere)
  const panel = root.closest("[data-panel]");
  if (panel && typeof MutationObserver === "function") new MutationObserver(() => { if (!panel.hidden) refreshSelects(); }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  refreshSelects();
  renderLib();
}
