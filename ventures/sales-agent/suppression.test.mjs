import test from "node:test";
import assert from "node:assert/strict";
import { suppressionIndex, emailKey } from "./suppression.mjs";
import { runDaily } from "./daily.mjs";

const hit = (list, email, phone) => suppressionIndex(list)(email, phone);

test("every way of writing an address on the list still suppresses it", () => {
  for (const list of ["bob@x.com", "BOB@X.COM", '"bob@x.com"', "Bob <bob@x.com>", "Smith, Bob <bob@x.com>", "mailto:bob@x.com", "a@b.com;bob@x.com", "a@b.com\r\nbob@x.com"])
    assert.ok(hit(list, "bob@x.com"), list);
});
test("+tags are one person both ways", () => {
  assert.ok(hit("bob+sales@x.com", "bob@x.com"));
  assert.ok(hit("bob@x.com", "Bob+news@x.com"));
  assert.equal(emailKey("A+b@C.com"), "a@c.com");
});
test("domains and phones", () => {
  assert.match(hit("@corp.io", "x@corp.io"), /domain @corp\.io/);
  assert.match(hit("+1 (555) 010-1234", "", "555.010.1234"), /phone/);
  assert.equal(hit("@corp.io", "x@notcorp.io"), null);
  assert.equal(hit("", "x@y.com"), null);
});
test("the agent's own suppression-add.csv works, and an address quoted as evidence suppresses nobody", () => {
  const csv = 'email,reason,date,evidence\nbob@x.com,asked to stop,2026-11-01,"Please tell carol@y.com, our CEO, to stop too"\n';
  assert.ok(hit(csv, "bob@x.com"));
  assert.equal(hit(csv, "carol@y.com"), null);
});
test("the daily run drops a touch to an address written as Name <addr>", () => {
  const tasks = "date,channel,step,email\n2026-11-02,email,E1,carol@y.com\n2026-11-02,email,E1,dan@z.com\n";
  const r = runDaily({ tasks, prospects: "", suppression: "Carol <carol@y.com>", today: "2026-11-02" });
  assert.deepEqual(r.queue.map((x) => x.email), ["dan@z.com"]);
  assert.equal(r.dropped.length, 1);
});
