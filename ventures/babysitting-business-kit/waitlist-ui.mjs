// Babysitting Business Kit: the Waitlist tab (waitlist.mjs in the browser). Spots to offer
// when a sit is cancelled, the waitlist itself, 24/48-hour holds, and peak nights with the
// priority order and a note to regulars. It also draws holds and reserved peak nights on
// the Schedule tab's week grid, after the app draws it.

import * as W from "./waitlist.mjs";
import { weekGrid } from "./slots.mjs";

const pct = (x) => `${(x * 100).toFixed(2)}%`;

export function mountWaitlist(box, { getDesk, save, esc, record = () => {}, today, now = () => Date.now() }) {
  if (!box) return () => {};
  const copy = (text) => `<button type="button" class="secondary small" data-copy="${esc(text)}">Copy message</button>`;
  const famOpts = (desk, blank) => `<option value="">${esc(blank)}</option>` + desk.families.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
  const timeFields = (p) => `<div><label for="${p}_date">Date</label><input id="${p}_date" name="date" type="date" required></div><div><label for="${p}_start">Start</label><input id="${p}_start" name="start" type="time" required></div><div><label for="${p}_end">End</label><input id="${p}_end" name="end" type="time" required></div>`;
  const read = (form) => Object.fromEntries([...form.elements].filter((el) => el.name).map((el) => [el.name, el.type === "checkbox" ? el.checked : el.value.trim()]));

  box.innerHTML = `
    <h2>Waitlist, holds and busy nights</h2>
    <p class="note">When you're booked, families can wait in line for a time (here, or from your server's <code>/book</code> page). When a sit is cancelled, the time is offered to the waitlist in order. Busy nights go to your regular families first. The order only ever uses how often you've sat for a family this past year and when someone joined the line.</p>
    <h3>Spots to offer</h3><div id="wl_offers"></div>
    <h3>Holds (24 or 48 hours)</h3>
    <p class="note">Pencil a family in while they check with their partner. A hold can't overlap a sit, a request or another hold, keeps that time off your booking page, and lapses on its own.</p>
    <form id="wl_holdForm"><div class="grid">
      <div><label for="wl_hfam">Family</label><select id="wl_hfam" name="familyId"></select></div>
      <div><label for="wl_hname">Or a name</label><input id="wl_hname" name="name" maxlength="120"></div>
      ${timeFields("wl_h")}
      <div><label for="wl_hours">Hold for</label><select id="wl_hours" name="hours"><option value="24">24 hours</option><option value="48">48 hours</option></select></div>
    </div><button type="submit">Hold this time</button> <span id="wl_holdOut" class="note" aria-live="polite"></span></form>
    <div id="wl_holds"></div>
    <h3>The waitlist</h3>
    <form id="wl_addForm"><div class="grid">
      <div><label for="wl_afam">Family</label><select id="wl_afam" name="familyId"></select></div>
      <div><label for="wl_aname">Or a new person's name</label><input id="wl_aname" name="name" maxlength="120"></div>
      <div><label for="wl_acontact">Their phone or email</label><input id="wl_acontact" name="contact" maxlength="200"></div>
      ${timeFields("wl_a")}
    </div><button type="submit">Add to the waitlist</button> <span id="wl_addOut" class="note" aria-live="polite"></span></form>
    <div id="wl_list"></div>
    <h3>Busy nights</h3>
    <div id="wl_peak"></div>
    <details><summary>Edit busy nights and the rules</summary>
      <form id="wl_settings"><div class="grid">
        <div><label for="wl_min">Regular family: sits in the last 12 months</label><input id="wl_min" name="minSits" type="number" min="1"></div>
        <div><label for="wl_ann">Tell regulars this many days ahead</label><input id="wl_ann" name="announceDays" type="number" min="0"></div>
        <div><label for="wl_reg">Regulars-only days</label><input id="wl_reg" name="regularsDays" type="number" min="0"></div>
        <div><label for="wl_off">Hours a family has to answer an offer</label><input id="wl_off" name="offerHours" type="number" min="1"></div>
      </div>
      <label><input type="checkbox" name="peakOn"> Keep busy nights off my booking page until they open to everyone</label>
      <label><input type="checkbox" name="publicJoin"> Let families join the waitlist from my booking page</label>
      <label for="wl_nights">Busy nights, one per line: date start-end name (blank = the usual list)</label>
      <textarea id="wl_nights" name="nights" rows="6" placeholder="2026-12-31 18:00-01:00 New Year's Eve"></textarea>
      <button type="submit">Save</button></form>
    </details>`;

  const $ = (id) => box.querySelector(`#${id}`);
  const parseNights = (text) => String(text).split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(.+)$/.exec(l);
    if (!m) throw new Error(`Line ${i + 1} should look like "2026-12-31 18:00-01:00 New Year's Eve"`);
    return { id: `n-${m[1]}-${i}`, date: m[1], start: m[2].padStart(5, "0"), end: m[3].padStart(5, "0"), name: m[4].slice(0, 80) };
  });

  function render() {
    const desk = getDesk(), t = today(), at = now();
    if (desk.waitlist) W.expireHolds(desk, at);
    const w = W.waitlistOf(desk);
    for (const id of ["wl_hfam", "wl_afam"]) { const s = $(id), v = s.value; s.innerHTML = famOpts(desk, id === "wl_hfam" ? "(someone new)" : "(not a family yet)"); s.value = v; }

    const offers = W.offerSlots(desk, { today: t, at });
    $("wl_offers").innerHTML = offers.length ? offers.map((s) => `<div class="card" style="margin:8px 0"><strong>${esc(W.whenText(s))}</strong> <span class="note">${esc(s.label)} · ${s.candidates.length} waiting</span>${s.offered ? `<p>Offered to <strong>${esc(s.offered.entry.name)}</strong> until ${esc(W.deadlineText(Date.parse(s.offered.entry.offer.until)))}.</p><button type="button" class="small" data-wlyes="${esc(s.offered.entry.id)}">They said yes: book it</button><button type="button" class="secondary small" data-wlno="${esc(s.offered.entry.id)}">No, or no answer: next family</button>` : s.next ? `<p>Next in line: <strong>${esc(s.next.entry.name)}</strong>${s.next.fits ? "" : " (asked for a slightly different time)"}</p><div class="msg">${esc(s.message)}</div>${copy(s.message)}<button type="button" class="small" data-wloffer="${esc(s.next.entry.id)}" data-slot="${esc(JSON.stringify({ key: s.key, date: s.date, start: s.start, end: s.end }))}">Sent, start the clock</button>` : `<p class="note">Nobody is waiting for this time. Post it in your openings.</p>`}</div>`).join("") : `<p class="note">No cancelled sits or open busy nights to offer right now.</p>`;

    const holds = W.activeHolds(desk, at);
    $("wl_holds").innerHTML = holds.length ? holds.map((h) => `<div class="card" style="margin:8px 0"><strong>${esc(h.name)}</strong> · ${esc(W.whenText(h))} <span class="pill warm">until ${esc(W.deadlineText(Date.parse(h.expiresAt)))}</span><div class="msg">${esc(W.holdMessage(h, desk.profile))}</div>${copy(W.holdMessage(h, desk.profile))}${h.familyId ? `<button type="button" class="small" data-wlconfirm="${esc(h.id)}">They said yes: book it</button>` : `<span class="note">Add them as a family to book it.</span>`}<button type="button" class="secondary small" data-wlrelease="${esc(h.id)}">Let it go</button></div>`).join("") : `<p class="note">No holds right now.</p>`;

    const open = w.entries.filter((e) => e.status === "waiting" || e.status === "offered").sort((a, b) => (a.date + a.created).localeCompare(b.date + b.created));
    $("wl_list").innerHTML = open.length ? `<table><thead><tr><th>Who</th><th>When</th><th>Place</th><th></th></tr></thead><tbody>${open.map((e) => { const place = W.placeInLine(desk, e.id); return `<tr><td><strong>${esc(e.name)}</strong><br><span class="note">${esc(e.contact)}${e.source === "book" ? " · from /book" : ""}</span></td><td>${esc(W.whenText(e))}</td><td>${place}${e.status === "offered" ? ` <span class="pill warm">offered</span>` : ""}</td><td><details><summary>"You're on the list"</summary><div class="msg">${esc(W.joinedMessage(e, place, desk.profile))}</div>${copy(W.joinedMessage(e, place, desk.profile))}</details><button type="button" class="secondary small" data-wlremove="${esc(e.id)}">Remove</button></td></tr>`; }).join("")}</tbody></table>` : `<p class="note">Nobody is waiting.</p>`;

    const nights = W.peakNights(desk, t).filter((n) => n.phase !== "past").slice(0, 8);
    const regs = W.regulars(desk, t);
    const phase = { upcoming: (n) => `tell regulars on ${n.regularsFrom}`, regulars: (n) => `regulars only until ${n.openFrom}`, open: () => "open to everyone" };
    $("wl_peak").innerHTML = `<p class="note">Regular families now: ${regs.length ? regs.map((r) => `${esc(r.name)} (${r.sits})`).join(", ") : "none yet"}.</p>` + nights.map((n) => {
      const booked = desk.bookings.some((b) => b.date === n.date && b.status !== "cancelled");
      const list = W.priorityList(desk, n, t);
      const ann = W.announcement(desk, n, t);
      return `<details class="card" style="margin:8px 0"><summary><strong>${esc(n.name)}</strong> · ${esc(W.whenText(n))} · <span class="pill ${n.phase === "regulars" ? "warm" : n.phase === "open" ? "good" : "cool"}">${esc(phase[n.phase](n))}</span>${booked ? ` <span class="pill good">booked</span>` : ""}</summary><ol>${list.map((r) => `<li>${esc(r.name)} <span class="note">${esc(r.reason)}</span></li>`).join("") || "<li class=\"note\">No regulars or waitlist yet.</li>"}</ol><div class="msg">${esc(ann)}</div>${copy(ann)}</details>`;
    }).join("") + `<details><summary>How I decide, in plain words</summary><div class="msg">${esc(W.priorityRules(desk).join("\n\n"))}</div>${copy(W.priorityRules(desk).join("\n\n"))}</details>`;

    const f = $("wl_settings");
    if (!f.contains(document.activeElement)) {
      for (const k of ["minSits", "announceDays", "regularsDays", "offerHours"]) f.elements[k].value = w.settings[k];
      f.elements.peakOn.checked = !!w.settings.peakOn;
      f.elements.publicJoin.checked = !!w.settings.publicJoin;
      f.elements.nights.value = (w.nights || []).map((n) => `${n.date} ${n.start}-${n.end} ${n.name}`).join("\n");
    }
  }

  // Holds and reserved busy nights on the Schedule tab's week grid, drawn after the app's.
  function decorateGrid() {
    const grid = document.getElementById("weekGrid"), week = document.getElementById("gridWeek");
    if (!grid || !week || !week.value) return;
    const cols = grid.querySelectorAll(".wk .col");
    if (cols.length !== 7) return;
    let g;
    try { g = weekGrid(getDesk(), week.value, { today: today() }); } catch { return; }
    g.days.forEach((d, i) => {
      for (const h of d.holds || []) cols[i].insertAdjacentHTML("beforeend", `<div class="sit wl-hold" style="top:${pct(h.top)};min-height:${pct(h.height)};background:#fdf0d5;border-left:3px dashed #8a5a00" title="${esc(h.label)}"><strong>${esc(h.start)}-${esc(h.end)}</strong> ${esc(h.label)}</div>`);
    });
  }
  const grid = document.getElementById("weekGrid");
  if (grid && typeof MutationObserver === "function") new MutationObserver(() => { decorateGrid(); render(); }).observe(grid, { childList: true });

  box.addEventListener("submit", (e) => {
    e.preventDefault();
    const desk = getDesk(), o = read(e.target), at = now(), t = today();
    if (e.target.id === "wl_holdForm") {
      const r = W.placeHold(desk, o, { at, today: t, bufferMin: Number(desk.profile.travelBufferMin ?? 30) });
      $("wl_holdOut").textContent = r.ok ? "Held." : `Can't hold it: ${r.why.join("; ")}`;
      if (r.ok) { e.target.reset(); record("hold_placed"); save(); }
    } else if (e.target.id === "wl_addForm") {
      const r = W.addToWaitlist(desk, o, { today: t, at });
      $("wl_addOut").textContent = r.ok ? `Added, number ${W.placeInLine(desk, r.entry.id)} in line.` : r.why;
      if (r.ok) { e.target.reset(); record("waitlist_added"); save(); }
    } else if (e.target.id === "wl_settings") {
      let nights;
      try { nights = o.nights ? parseNights(o.nights) : null; } catch (err) { alert(err.message); return; }
      const wl = W.ensureWaitlist(desk);
      wl.settings = { ...wl.settings, minSits: Number(o.minSits), announceDays: Number(o.announceDays), regularsDays: Number(o.regularsDays), offerHours: Number(o.offerHours), peakOn: o.peakOn, publicJoin: o.publicJoin };
      if (nights) wl.nights = nights; else delete wl.nights;
      record("waitlist_settings_saved");
      document.activeElement?.blur?.();
      save();
    }
  });

  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const desk = getDesk(), at = now(), t = today();
    try {
      if (b.dataset.wloffer) { W.offerTo(desk, b.dataset.wloffer, JSON.parse(b.dataset.slot), { at }); record("waitlist_offered"); }
      else if (b.dataset.wlyes) { W.answerOffer(desk, b.dataset.wlyes, true, { today: t }); record("waitlist_booked"); }
      else if (b.dataset.wlno) { W.answerOffer(desk, b.dataset.wlno, false, { today: t }); record("waitlist_passed"); }
      else if (b.dataset.wlconfirm) { W.confirmHold(desk, b.dataset.wlconfirm, { at, today: t }); record("hold_booked"); }
      else if (b.dataset.wlrelease) { W.releaseHold(desk, b.dataset.wlrelease); record("hold_released"); }
      else if (b.dataset.wlremove) { const x = W.waitlistOf(desk).entries.find((y) => y.id === b.dataset.wlremove); if (x) { x.status = "removed"; x.closed = t; } }
      else return;
    } catch (err) { alert(err.message); return; }
    save();
  });

  render();
  return render;
}
