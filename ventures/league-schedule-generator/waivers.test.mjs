import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { handler, emptyState } from "./server.mjs";
import { cleanWaiverText, waiverVersion, rememberVersion, parseSignature, parseWaiverForm, recordSignature, removeSignature, waiverStatus, waiversCsv, versionText, adminWaiversHtml, MAX_VERSIONS } from "./waivers.mjs";

const form = (o) => new URLSearchParams(o);
const TEXT = "I play at my own risk.\r\nI follow the code of conduct.   \n";
const adult = { fullname: "Ben  Ong", signature: "ben ong", agree: "1", email: "ben@example.org" };

test("a version is the hash of the cleaned text, so the same words always give the same id", () => {
  assert.equal(cleanWaiverText(TEXT), "I play at my own risk.\nI follow the code of conduct.");
  const id = waiverVersion(TEXT);
  assert.equal(id, createHash("sha256").update("I play at my own risk.\nI follow the code of conduct.").digest("hex").slice(0, 16));
  assert.equal(waiverVersion("I play at my own risk.\nI follow the code of conduct."), id);
  assert.notEqual(waiverVersion(TEXT + " Changed."), id);
  assert.equal(waiverVersion("   "), "");
});

test("a signature: tick, full name, typed signature matching the signer, and a guardian for a minor", () => {
  assert.deepEqual(parseSignature(form(adult)).sig, { name: "Ben Ong", email: "ben@example.org", minor: false, guardian: "" });
  assert.match(parseSignature(form({ ...adult, agree: "" })).error, /Tick the box/);
  assert.match(parseSignature(form({ ...adult, signature: "B. Ong" })).error, /must be your full name/);
  assert.match(parseSignature(form({ ...adult, fullname: "" })).error, /full name/);
  assert.match(parseSignature(form({ ...adult, fullname: "<b>x</b>", signature: "<b>x</b>" })).error, /cannot show/);
  assert.match(parseSignature(form({ ...adult, email: "nope" })).error, /email/);
  assert.match(parseSignature(form({ ...adult, minor: "1" })).error, /guardian/);
  // a minor: the guardian signs with their own name
  assert.match(parseSignature(form({ ...adult, minor: "1", guardian: "Mia Ong" })).error, /parent or guardian's full name/);
  assert.deepEqual(parseSignature(form({ ...adult, minor: "1", guardian: "Mia Ong", signature: "Mia Ong" })).sig, { name: "Ben Ong", email: "ben@example.org", minor: true, guardian: "Mia Ong" });
  // the sign-up form's prefixed fields
  assert.equal(parseSignature(form({ w_fullname: "Ana Diaz", w_signature: "Ana Diaz", w_agree: "1" }), { prefix: "w_" }).sig.name, "Ana Diaz");
  assert.match(parseWaiverForm(form({ ...adult, team: "9" }), ["Hawks"]).error, /Pick your team/);
  assert.equal(parseWaiverForm(form({ ...adult, team: "0" }), ["Hawks"]).req.team, "Hawks");
});

test("signatures point at the version they agreed to; a changed text leaves them on the older one", () => {
  const state = emptyState();
  assert.match(recordSignature(state, { team: "Hawks", name: "Ben Ong" }).error, /not set a waiver/);
  state.fields.waiverText = TEXT;
  const v1 = rememberVersion(state, 1000);
  const a = recordSignature(state, { team: "Hawks", name: "Ben Ong", email: "" }, 2000);
  assert.equal(a.sig.version, v1);
  // signing again (same team and name, any case) replaces the row
  const again = recordSignature(state, { team: "hawks", name: "ben ong", email: "b@example.org" }, 3000);
  assert.equal(again.replaced, true);
  assert.equal(state.waivers.length, 1);
  recordSignature(state, { team: "Hawks", name: "Cara", email: "" }, 3500);
  state.fields.waiverText = TEXT + "\nNew rule.";
  const v2 = rememberVersion(state, 4000);
  assert.notEqual(v2, v1);
  assert.equal(state.waiverVersions[v1].text, cleanWaiverText(TEXT)); // the old text is still readable
  recordSignature(state, { team: "Hawks", name: "Dev Rao", email: "" }, 5000);
  const st = waiverStatus(state, { Hawks: ["Ben", "Cara", "Dev", "Eli"], Owls: ["Fay"] }, ["Hawks", "Owls"]);
  assert.equal(st.version, v2);
  const h = st.teams[0];
  assert.deepEqual(h.signed.map((x) => x.entry), ["Dev"]);
  assert.deepEqual(h.older.map((x) => x.entry), ["Ben", "Cara"]);
  assert.deepEqual(h.missing, ["Eli"]);
  assert.deepEqual(st.counts, { roster: 5, signed: 1 });
  assert.match(versionText(state, v1), /I play at my own risk\.\nI follow the code of conduct\.\n$/);
  assert.equal(versionText(state, "nope"), null);
  const csv = waiversCsv(state);
  assert.match(csv, /^signed_utc,team,full_name,minor,guardian,email,version,version_set_utc,current,signed_on\r\n/);
  assert.equal(csv.trim().split("\r\n").length, 4);
  assert.match(csv, new RegExp(`Dev Rao,no,,,${v2},.*,yes,league page`));
  assert.match(csv, new RegExp(`hawks,ben ong,no,,b@example.org,${v1},1970-01-01T00:00:01.000Z,no,`));
  const id = state.waivers[0].id;
  assert.equal(removeSignature(state, id).sig.name, "ben ong"); // the latest signing is the one kept, as typed
  assert.match(removeSignature(state, id).error, /already gone/);
});

test("roster matching: a first name matches one person, never a guess between two", () => {
  const state = emptyState();
  state.fields.waiverText = TEXT;
  for (const name of ["Ben Ong", "Ben Ali", "Cara Lee", "Zed Unlisted"]) recordSignature(state, { team: "Hawks", name }, 1);
  recordSignature(state, { team: "Owls", name: "Dana Fox" }, 1);
  const st = waiverStatus(state, { Hawks: ["Ben", "Cara", "Ben Ali"], Owls: ["Dana Fox"] }, ["Hawks", "Owls"]);
  assert.deepEqual(st.teams[0].signed.map((x) => x.entry), ["Cara", "Ben Ali"]);
  assert.deepEqual(st.teams[0].missing, ["Ben"]); // two Bens signed: not guessed
  assert.deepEqual(st.teams[1].signed.map((x) => x.sig.name), ["Dana Fox"]);
  assert.deepEqual(st.extra.map((w) => w.name).sort(), ["Ben Ong", "Zed Unlisted"]);
  const html = adminWaiversHtml(state, "k<", { Hawks: ["Ben", "Cara", "Ben Ali"] }, ["Hawks"]);
  assert.match(html, /2 of 3<\/strong> roster players/);
  assert.match(html, /not signed: Ben/);
  assert.doesNotMatch(html, /key=k</);
});

test("old versions nobody signed are dropped past the cap; signed ones are kept", () => {
  const state = emptyState();
  state.fields.waiverText = "v0";
  rememberVersion(state, 0);
  recordSignature(state, { team: "Hawks", name: "Ben Ong" }, 1);
  for (let i = 1; i <= MAX_VERSIONS + 5; i++) { state.fields.waiverText = "v" + i; rememberVersion(state, i * 10); }
  const ids = Object.keys(state.waiverVersions);
  assert.equal(ids.length, MAX_VERSIONS);
  assert.ok(ids.includes(waiverVersion("v0")));
  assert.ok(ids.includes(waiverVersion("v" + (MAX_VERSIONS + 5))));
});

// --- through the HTTP server ---
const env = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" };
async function boot() {
  const state = emptyState();
  const srv = http.createServer(handler(state, () => {}, env, () => Date.UTC(2026, 8, 1, 18, 30)));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
const fieldsOf = (state) => Object.fromEntries(Object.entries(state.fields).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v === true ? "1" : v === false ? "" : String(v)]));

test("server: the organiser sets the text, a player signs from the league link, /admin shows who is left", async () => {
  const s = await boot();
  const teams = s.state.fields.teams.split("\n").map((x) => x.trim()).filter(Boolean);
  assert.equal((await fetch(s.base + "/league/waiver?t=tok")).status, 404); // no text yet
  assert.equal((await fetch(s.base + "/league/waiver?t=wrong")).status, 401);
  await post(s.base + "/admin/save?key=adm", { ...fieldsOf(s.state), waiverText: TEXT, rosters: `${teams[0]}: Ben, Cara`, act: "publish" });
  const v = waiverVersion(TEXT);
  assert.ok(s.state.waiverVersions[v]);
  const league = await (await fetch(s.base + "/league?t=tok")).text();
  assert.match(league, /href="\/league\/waiver\?t=tok">Sign the league waiver/);
  const pageHtml = await (await fetch(s.base + "/league/waiver?t=tok")).text();
  assert.match(pageHtml, /I play at my own risk\./);
  assert.match(pageHtml, new RegExp(`Version ${v}`));
  const bad = await post(s.base + "/league/waiver?t=tok", { ...adult, team: "0", signature: "someone else" });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /value="Ben  Ong"/); // what was typed is kept
  const ok = await post(s.base + "/league/waiver?t=tok", { ...adult, team: "0" });
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), new RegExp(`Signed: Ben Ong for ${teams[0]}, version ${v}, 2026-09-01 18:30 UTC`));
  const admin = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.match(admin, /<strong>1 of 2<\/strong> roster players/);
  assert.match(admin, /not signed: Cara/);
  assert.match(admin, /not legal advice/);
  const csv = await (await fetch(s.base + "/admin/waivers.csv?key=adm")).text();
  assert.match(csv, /Ben Ong,no,,ben@example.org/);
  assert.equal((await fetch(s.base + "/admin/waivers.csv?key=x")).status, 401);
  assert.match(await (await fetch(s.base + `/admin/waiver.txt?key=adm&v=${v}`)).text(), /I follow the code of conduct/);
  // a changed text: Ben now shows as signed an earlier version
  await post(s.base + "/admin/save?key=adm", { ...fieldsOf(s.state), waiverText: TEXT + "\nAdded a line.", act: "save" });
  assert.match(await (await fetch(s.base + "/admin?key=adm")).text(), /signed an earlier version: Ben/);
  const id = s.state.waivers[0].id;
  const r = await post(s.base + "/admin/waiver?key=adm", { id: String(id), act: "remove" });
  assert.match(decodeURIComponent(r.headers.get("location")), /Removed Ben Ong's signature/);
  assert.equal(s.state.waivers.length, 0);
  s.close();
});

test("server: with a waiver set, the captain signs on the team sign-up form", async () => {
  const s = await boot();
  Object.assign(s.state.fields, { regOpen: true, waiverText: TEXT });
  rememberVersion(s.state, 0);
  const signup = { team: "Pickle Rick", captain: "Ana", email: "ana@example.org", players: "Ben" };
  assert.match(await (await fetch(s.base + "/register")).text(), /name="w_signature"/);
  const missing = await post(s.base + "/register", signup);
  assert.equal(missing.status, 400);
  assert.match(await missing.text(), /Waiver: .*full name/);
  assert.equal(s.state.registrations.length, 0);
  const ok = await post(s.base + "/register", { ...signup, w_fullname: "Ana Diaz", w_signature: "Ana Diaz", w_agree: "1" });
  assert.equal(ok.status, 200);
  assert.equal(s.state.waivers.length, 1);
  assert.deepEqual({ team: s.state.waivers[0].team, name: s.state.waivers[0].name, email: s.state.waivers[0].email, via: s.state.waivers[0].via }, { team: "Pickle Rick", name: "Ana Diaz", email: "ana@example.org", via: "signup" });
  s.close();
});

test("server: a league with no waiver text keeps the sign-up form and league page as they were", async () => {
  const s = await boot();
  s.state.fields.regOpen = true;
  assert.doesNotMatch(await (await fetch(s.base + "/register")).text(), /w_signature/);
  assert.equal((await post(s.base + "/register", { team: "Owls Two", captain: "Ana", email: "ana@example.org" })).status, 200);
  assert.equal(s.state.waivers.length, 0);
  s.close();
});
