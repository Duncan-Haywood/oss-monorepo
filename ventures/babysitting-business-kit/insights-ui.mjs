// Babysitting Business Kit: the Insights tab. Draws insights.mjs's numbers into its panel
// and redraws whenever the panel is shown, so the page's main render() needs no hook.
// Settings it edits (assumed drive speed, the sitter's own local comparison rate, each
// family's round-trip drive minutes) are saved on the desk like every other field.

import * as IN from "./insights.mjs";

const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Number(x) || 0).toFixed(2)}`;

export function mountInsights(panel, { getDesk, save, esc, record = () => {}, today }) {
  if (!panel) return () => {};
  const state = { newRate: "", effective: "", letterYear: "", addressee: "", purpose: "", includeNet: false, honorBooked: true };

  const table = (head, rows) => rows.length
    ? `<div style="overflow-x:auto"><table><thead><tr>${head.map((h) => `<th${h.n ? ' class="n"' : ""}>${h.t || h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
    : `<p class="note">Nothing here yet.</p>`;
  const bar = (v, max) => `<span aria-hidden="true" style="display:inline-block;height:9px;border-radius:4px;background:var(--accent);width:${max > 0 ? Math.round((Math.max(0, v) / max) * 120) : 0}px"></span>`;

  function render() {
    const desk = getDesk();
    const t = today();
    const s = IN.insightSettings(desk.profile);
    const fr = IN.familyRates(desk, { today: t });
    const pat = IN.incomePatterns(desk, { today: t });
    const cap = IN.capacity(desk, t);
    const years = [...new Set([t.slice(0, 4), ...IN.yearsWithData(desk, t).map(String)])].sort().reverse();
    if (!state.letterYear || !years.includes(state.letterYear)) state.letterYear = years[0];
    const plan = state.newRate || state.effective ? IN.raisePlan(desk, { newRate: state.newRate, effective: state.effective, today: t, honorBooked: state.honorBooked }) : null;
    const yoy = IN.yearOverYear(desk, t);
    const maxDay = Math.max(...pat.byWeekday.map((d) => d.earned));
    const maxSeason = Math.max(...pat.bySeason.map((d) => d.earned));

    panel.innerHTML = `
      <h2>Insights</h2>
      <p class="note">Numbers from your own records: sits that happened (not cancelled) and payments you recorded. Estimates to help you decide, not financial or tax advice.</p>

      <h3>What each family pays per real hour (last 12 months)</h3>
      <p class="note">"At the house" is what a sit earned divided by the hours you were there. "Per real hour" subtracts the car (round-trip miles at the IRS standard mileage rate) and adds the drive there and back to the hours. Drive time you type for a family wins; otherwise it is estimated from miles at the speed below.</p>
      <div class="grid">
        <div><label for="in_mph">Assumed average driving speed (mph)</label><input id="in_mph" type="number" min="1" step="1" data-in-setting="travelMph" value="${esc(s.travelMph)}"></div>
      </div>
      ${table(["Family", { t: "Sits", n: 1 }, { t: "Hours there", n: 1 }, { t: "Drive hours", n: 1 }, { t: "Earned", n: 1 }, { t: "Car cost", n: 1 }, { t: "At the house", n: 1 }, { t: "Per real hour", n: 1 }, "Round-trip drive (min)"],
        fr.rows.map((r) => { const f = desk.families.find((x) => x.id === r.familyId); return `<tr><td>${esc(r.family)}</td><td class="n">${r.sits}</td><td class="n">${r.hours}</td><td class="n">${r.travelHours}</td><td class="n">${money(r.earned)}</td><td class="n">${money(r.mileageCost)}</td><td class="n">${money(r.perSitHour)}</td><td class="n"><strong>${money(r.effectiveHourly)}</strong></td><td>${f ? `<input type="number" min="0" step="1" style="max-width:90px" aria-label="Round-trip drive minutes for ${esc(r.family)}" data-in-travel="${esc(f.id)}" value="${esc(f.travelMinutes ?? "")}">` : ""}</td></tr>`; }))}
      ${fr.rows.length ? `<p><span class="stat">All families, per real hour<b>${money(fr.total.effectiveHourly)}</b></span><span class="stat">At the house<b>${money(fr.total.perSitHour)}</b></span><span class="stat">Minimum-hour padding<b>${fr.total.paddingHours} h</b><span class="note">${money(fr.total.paddingEarned)}</span></span></p>` : ""}
      ${fr.notes.length ? `<ul>${fr.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}

      <h3>When the money comes in (last 12 months)</h3>
      ${table(["Day", { t: "Sits", n: 1 }, { t: "Hours", n: 1 }, { t: "Earned", n: 1 }, ""], pat.byWeekday.map((d) => `<tr><td>${d.day}</td><td class="n">${d.sits}</td><td class="n">${d.hours}</td><td class="n">${money(d.earned)}</td><td>${bar(d.earned, maxDay)}</td></tr>`))}
      ${table(["Season", { t: "Sits", n: 1 }, { t: "Hours", n: 1 }, { t: "Earned", n: 1 }, ""], pat.bySeason.map((d) => `<tr><td>${esc(d.label)}</td><td class="n">${d.sits}</td><td class="n">${d.hours}</td><td class="n">${money(d.earned)}</td><td>${bar(d.earned, maxSeason)}</td></tr>`))}

      <h3>How full your week is</h3>
      ${cap.availableWeek ? `<p><span class="stat">Available a week<b>${cap.availableWeek} h</b><span class="note">from your availability in Settings</span></span><span class="stat">Booked, last 8 weeks<b>${cap.pastAvgHours} h</b><span class="note">${cap.pastPct}% of your time</span></span><span class="stat">Booked, next 4 weeks<b>${cap.aheadAvgHours} h</b><span class="note">${cap.aheadPct}%; ${cap.openHoursAhead} h still open</span></span></p>
      ${table(["Day", { t: "Available", n: 1 }, { t: "Booked a week (avg, last 8)", n: 1 }, { t: "Full", n: 1 }], cap.byDay.filter((d) => d.available > 0).map((d) => `<tr><td>${d.day}</td><td class="n">${d.available} h</td><td class="n">${d.booked} h</td><td class="n">${d.pct}%</td></tr>`))}` : `<p class="note">Add your weekly availability in Settings to see this.</p>`}
      ${cap.errors.length ? `<p class="note">${cap.errors.map(esc).join("; ")}</p>` : ""}

      <h3>Plan a rate raise</h3>
      <p class="note">Your current base rate is ${money((desk.profile.rates || {}).hourly)} an hour. The change per family is their usual billed hours over the last 90 days times the difference; extra-child and other charges stay as they are. If you want a comparison, type what you know about local rates yourself (from sitters or families you know); the app never guesses one.</p>
      <div class="grid">
        <div><label for="in_rate">New hourly rate</label><input id="in_rate" type="number" min="0" step="0.5" data-in-state="newRate" value="${esc(state.newRate)}"></div>
        <div><label for="in_eff">Starts on</label><input id="in_eff" type="date" data-in-state="effective" value="${esc(state.effective)}"></div>
        <div><label for="in_local">Your local comparison ($/h, optional)</label><input id="in_local" type="number" min="0" step="0.5" data-in-setting="localRate" value="${esc(s.localRate)}"></div>
        <div><label for="in_localnote">Where that comes from</label><input id="in_localnote" data-in-setting="localRateNote" value="${esc(s.localRateNote)}" placeholder="e.g. two sitters I know"></div>
      </div>
      <label style="display:inline"><input type="checkbox" data-in-state="honorBooked"${state.honorBooked ? " checked" : ""}> Sits booked before the start date keep the current rate</label>
      ${plan ? plan.errors.length ? `<p class="note">${plan.errors.map(esc).join(" ")}</p>` : `
        ${table(["Family", { t: "Billed h / month", n: 1 }, { t: "Now / month", n: 1 }, { t: "New / month", n: 1 }, { t: "Change", n: 1 }], plan.rows.map((r) => `<tr><td>${esc(r.family)}</td><td class="n">${r.hoursPerMonth}</td><td class="n">${money(r.nowMonthly)}</td><td class="n">${money(r.newMonthly)}</td><td class="n">${money(r.change)}${r.pct !== null ? ` (${r.pct}%)` : ""}</td></tr>`))}
        <p><span class="stat">Change a month<b>${money(plan.monthlyChange)}</b></span><span class="stat">Change a year<b>${money(plan.yearlyChange)}</b><span class="note">if every family stays and books the same</span></span></p>
        <ul>${plan.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
        ${plan.rows.map((r) => `<details><summary>Message to ${esc(r.family)}</summary><div class="msg">${esc(r.message)}</div><button type="button" class="secondary small" data-copy="${esc(r.message)}">Copy message</button></details>`).join("")}` : ""}

      <h3>Income letter for a landlord or lender</h3>
      <p class="note">Totals by month from the payments you recorded, with a line for your signature. It says plainly that it is a self-prepared summary, not a tax document. A lender may still ask for your tax return or bank statements.</p>
      <div class="grid">
        <div><label for="in_ly">Year</label><select id="in_ly" data-in-state="letterYear">${years.map((y) => `<option${y === state.letterYear ? " selected" : ""}>${y}</option>`).join("")}</select></div>
        <div><label for="in_to">Addressed to (optional)</label><input id="in_to" data-in-state="addressee" value="${esc(state.addressee)}" placeholder="To whom it may concern"></div>
        <div><label for="in_why">Purpose sentence (optional)</label><input id="in_why" data-in-state="purpose" value="${esc(state.purpose)}" placeholder="I am applying to rent 4B at 10 Oak St."></div>
      </div>
      <label style="display:inline"><input type="checkbox" data-in-state="includeNet"${state.includeNet ? " checked" : ""}> Also show net after my recorded expenses and mileage</label>
      <pre class="msg" id="in_letter">${esc(IN.incomeLetter(desk, { year: state.letterYear, today: t, addressee: state.addressee, purpose: state.purpose, includeNet: state.includeNet }).text)}</pre>
      <p><button type="button" class="secondary" data-in-print>Print or save the letter</button></p>

      <h3>This year against last year</h3>
      ${yoy ? `
        <p><span class="stat">Paid, ${yoy.thisYear.year} to ${esc(yoy.thisYear.through.slice(5))}<b>${money(yoy.thisYear.paid)}</b></span><span class="stat">Same stretch of ${yoy.lastYear.year}<b>${money(yoy.lastYear.paid)}</b></span><span class="stat">Change<b>${money(yoy.change.paid)}</b><span class="note">${yoy.change.paidPct === null ? "" : `${yoy.change.paidPct > 0 ? "+" : ""}${yoy.change.paidPct}%`}</span></span></p>
        ${table(["", { t: String(yoy.lastYear.year), n: 1 }, { t: String(yoy.thisYear.year), n: 1 }], [
          ["Sits", yoy.lastYear.sits, yoy.thisYear.sits], ["Hours at the house", yoy.lastYear.hours, yoy.thisYear.hours], ["Families", yoy.lastYear.families, yoy.thisYear.families],
          ["Per real hour", money(yoy.lastYear.effectiveHourly), money(yoy.thisYear.effectiveHourly)],
        ].map(([k, a, b]) => `<tr><td>${k}</td><td class="n">${a}</td><td class="n">${b}</td></tr>`))}
        ${table(["Month", { t: String(yoy.lastYear.year), n: 1 }, { t: String(yoy.thisYear.year), n: 1 }, { t: "Change", n: 1 }], yoy.months.map((m) => `<tr><td>${m.name}</td><td class="n">${money(m.lastYear)}</td><td class="n">${money(m.thisYear)}</td><td class="n">${money(m.change)}</td></tr>`))}
        ${table(["Year", { t: "Paid", n: 1 }, { t: "Sits", n: 1 }, { t: "Per real hour", n: 1 }], yoy.fullYears.map((y) => `<tr><td>${y.year}${y.partial ? " (so far)" : ""}</td><td class="n">${money(y.paid)}</td><td class="n">${y.sits}</td><td class="n">${money(y.effectiveHourly)}</td></tr>`))}` : `<p class="note">This appears once you have recorded sits or payments in two different years.</p>`}`;
  }

  const update = (fn) => { const desk = getDesk(); desk.profile.insights = { ...((desk.profile && desk.profile.insights) || {}) }; fn(desk); save(); render(); };
  panel.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.inSetting) {
      const k = el.dataset.inSetting;
      update((d) => { d.profile.insights[k] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value.trim(); });
    } else if (el.dataset.inTravel) {
      update((d) => { const f = d.families.find((x) => x.id === el.dataset.inTravel); if (f) f.travelMinutes = el.value === "" ? "" : Number(el.value); });
    } else if (el.dataset.inState) {
      const k = el.dataset.inState;
      state[k] = el.type === "checkbox" ? el.checked : el.value;
      if (k === "newRate" || k === "effective") record("insights_raise_planned");
      render();
    }
  });
  panel.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.hasAttribute("data-in-print")) {
      const L = IN.incomeLetter(getDesk(), { year: state.letterYear, today: today(), addressee: state.addressee, purpose: state.purpose, includeNet: state.includeNet });
      const u = URL.createObjectURL(new Blob([L.html], { type: "text/html" }));
      if (!window.open(u, "_blank")) location.href = u;
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      record("insights_letter_printed");
    }
  });
  // Redraw each time the tab is opened, so numbers follow edits made on other tabs.
  new MutationObserver(() => { if (!panel.hidden) render(); }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  render();
  return render;
}
