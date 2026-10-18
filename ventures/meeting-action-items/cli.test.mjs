import test from "node:test";
import assert from "node:assert/strict";
import { main } from "./cli.mjs";

const io = (files) => { const out = [], err = []; return { out, err, log: (x) => out.push(x), err_: err, error: null, read: async (f) => { if (!(f in files)) throw new Error("ENOENT"); return files[f]; }, errFn: (x) => err.push(x) }; };
const mk = (files) => { const o = io(files); return { o, deps: { log: o.log, err: o.errFn, read: o.read } }; };

test("exit 0 when every action has an owner, 1 when one does not, 2 on bad input", async () => {
  let m = mk({ "a.txt": "Ben: I'll fix the toggle by Friday." });
  assert.equal(await main(["a.txt", "--date", "2026-10-19", "--format", "csv"], m.deps), 0);
  assert.match(m.o.out[0], /Fix the toggle,Ben,2026-10-23,high/);
  m = mk({ "b.txt": "We need to update the checklist." });
  assert.equal(await main(["b.txt"], m.deps), 1);
  m = mk({});
  assert.equal(await main(["missing.txt"], m.deps), 2);
  assert.equal(await main([], m.deps), 2);
  m = mk({ "a.txt": "x" });
  assert.equal(await main(["a.txt", "--format", "pdf"], m.deps), 2);
});

test("--ai with no key falls back to the rules and says so", async () => {
  const errs = [];
  const code = await main(["n.txt", "--ai", "--format", "json"], { log() {}, err: (m) => errs.push(m), read: async () => "Cleo will book the venue next Friday.", env: {} });
  assert.equal(code, 0);
  assert.match(errs[0], /AI pass off: no key/);
});

test("--ai adds a supported suggestion and reports counts on stderr", async () => {
  const errs = [], out = [];
  const list = JSON.stringify([{ owner: "Dana", task: "Send the quote", quote: "Dana owes us a quote" }]);
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: list }] }), text: async () => "" });
  await main(["n.txt", "--ai", "--format", "json"], { log: (m) => out.push(m), err: (m) => errs.push(m), read: async () => "Cleo will book the venue.\nDana owes us a quote.", env: { ANTHROPIC_API_KEY: "k" }, fetch });
  assert.match(errs[0], /added 1 item/);
  assert.equal(JSON.parse(out[0]).actions.at(-1).via, "ai");
});

test("--previous lists last meeting's actions that are overdue, open or discussed again", async () => {
  const prev = JSON.stringify({ actions: [
    { task: "Fix the Safari toggle", owner: "Ben", due: "2026-10-14" },
    { task: "Draft the launch email", owner: "Ana", due: "2026-10-30" },
    { task: "Renew the domain", owner: "Dev", due: "2026-10-12" },
  ] });
  const m = mk({ "n.txt": "Ben: I'll fix the Safari toggle by Friday.", "p.json": prev });
  const code = await main(["n.txt", "--date", "2026-10-19", "--previous", "p.json", "--format", "json"], m.deps);
  assert.equal(code, 0);
  const j = JSON.parse(m.o.out[0]).carryOver;
  assert.deepEqual(j.again.map((a) => a.owner), ["Ben"]);
  assert.deepEqual(j.overdue.map((a) => a.owner), ["Dev"]);
  assert.deepEqual(j.open.map((a) => a.owner), ["Ana"]);
  const t = mk({ "n.txt": "Ben: I'll fix the Safari toggle by Friday.", "p.json": prev });
  await main(["n.txt", "--date", "2026-10-19", "--previous", "p.json"], t.deps);
  assert.match(t.o.out[0], /Past due and not mentioned today[\s\S]*Renew the domain/);
  const bad = mk({ "n.txt": "x", "p.json": "{nope" });
  assert.equal(await main(["n.txt", "--previous", "p.json"], bad.deps), 2);
});

test("--format slack prints Slack mrkdwn", async () => {
  const m = mk({ "n.txt": "Ben: I'll fix the toggle by Friday." });
  await main(["n.txt", "--date", "2026-10-19", "--format", "slack"], m.deps);
  assert.match(m.o.out[0], /^\*Meeting \(2026-10-19\)\*[\s\S]*• Fix the toggle — \*Ben\*, by 2026-10-23/);
});

test("workload flags an owner with three actions or two due the same day", async () => {
  const notes = "Ben will fix the toggle by Friday.\nBen will update the docs by Friday.\nCleo will book the venue by Monday.";
  const m = mk({ "n.txt": notes });
  await main(["n.txt", "--date", "2026-10-19", "--format", "json"], m.deps);
  const j = JSON.parse(m.o.out[0]);
  assert.equal(j.workload.people[0].owner, "Ben");
  assert.deepEqual(j.workload.flagged.map((p) => p.owner), ["Ben"]);
  const md = mk({ "n.txt": notes });
  await main(["n.txt", "--date", "2026-10-19"], md.deps);
  assert.match(md.o.out[0], /Heads-up: loaded owners[\s\S]*\*\*Ben\*\*: 2 due 2026-10-23/);
  const csv = mk({ "n.txt": notes });
  await main(["n.txt", "--date", "2026-10-19", "--format", "csv"], csv.deps);
  assert.doesNotMatch(csv.o.out[0], /Heads-up/);
});
