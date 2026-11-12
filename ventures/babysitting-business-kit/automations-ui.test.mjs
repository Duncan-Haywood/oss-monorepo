// The Automations box and the Today tab's "sent automatically" list (automations-ui.mjs).
// It had no test of its own: a red-team run on 2026-11-12 seeded 8 faults in it and none
// was caught (opt-out pills shown for families who never opted out, texts listed as
// emails, the last-7-days list shrunk to today). A two-element fake DOM is enough.
import test from "node:test";
import assert from "node:assert/strict";
import { mountAutomations } from "./automations-ui.mjs";
import { RULES, setOptOut } from "./automations.mjs";

function fakeDom() {
  const els = {};
  for (const id of ["autoSettings", "autoToday"]) els[id] = { innerHTML: "", listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } };
  globalThis.document = { getElementById: (id) => els[id] || null };
  return els;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const isoDaysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();

function mount(desk) {
  desk.bookings ||= [];
  const els = fakeDom();
  let saves = 0;
  const render = mountAutomations({ getDesk: () => desk, save: () => { saves++; }, esc });
  render();
  return { els, render, saves: () => saves };
}

test("opt-out pill: only for a contact that actually opted out, per channel", () => {
  const desk = {
    profile: {},
    families: [
      { id: "a", name: "Ames", email: "ames@example.com", phone: "555-201-0001" },
      { id: "b", name: "Bell", email: "bell@example.com", phone: "555-201-0002" },
      { id: "c", name: "Cruz", email: "cruz@example.com", phone: "555-201-0003" },
    ],
  };
  setOptOut(desk, "sms", "555-201-0002", true, "STOP", isoDaysAgo(1));
  setOptOut(desk, "email", "cruz@example.com", true, "link", isoDaysAgo(1));
  const { els } = mount(desk);
  const rows = els.autoSettings.innerHTML.split("<tr>").slice(1);
  const row = (name) => rows.find((r) => r.includes(name));
  assert.ok(!row("Ames").includes("pill bad"), "Ames never opted out");
  assert.ok(row("Bell").includes("texted STOP") && !row("Bell").includes("unsubscribed from email"));
  assert.ok(row("Cruz").includes("unsubscribed from email") && !row("Cruz").includes("texted STOP"));
});

test("server log: full timestamp and the rule's label", () => {
  const desk = { profile: {}, families: [], automations: { log: [{ at: "2026-11-10T14:30:59.000Z", channel: "sms", family: "Ames", rule: "reminder", ok: true }] } };
  const { els } = mount(desk);
  assert.ok(els.autoSettings.innerHTML.includes(`<li>2026-11-10 14:30 sms to Ames: ${RULES.reminder} </li>`), els.autoSettings.innerHTML.slice(-300));
});

test("Today list: last 7 days, text vs email, exact date", () => {
  const at3 = isoDaysAgo(3);
  const at9 = isoDaysAgo(9);
  const desk = {
    profile: {},
    families: [],
    automations: { log: [
      { at: at9, channel: "email", family: "Old", rule: "rebook", ok: true },
      { at: at3, channel: "sms", family: "Ames", rule: "reminder", ok: true },
    ] },
  };
  const { els } = mount(desk);
  const today = els.autoToday.innerHTML;
  assert.ok(today.includes(`<li>${at3.slice(0, 10)}: text to Ames, ${RULES.reminder}</li>`), today);
  assert.ok(!today.includes("Old"), "a 9-day-old send is outside the week");
});

test("changing a rule writes only automation settings, not the rest of the profile", () => {
  const desk = { profile: { name: "Sam's Sitting", rebookAfterDays: 45 }, families: [] };
  const { els, saves } = mount(desk);
  els.autoSettings.listeners.change({ target: { dataset: { rule: "reminder" }, checked: true } });
  assert.deepEqual(desk.profile.automations, { reminder: true });
  assert.equal(saves(), 1);
  els.autoSettings.listeners.change({ target: { dataset: { rule: "confirm" }, checked: true } });
  assert.deepEqual(desk.profile.automations, { reminder: true, confirm: true });
});
