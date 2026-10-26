import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stripQuoted, triage } from "./engine.mjs";

const dir = new URL("./eval/real-threads/", import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, dir), "utf8");

// Real emails from github/email_reply_parser (MIT). `has` must survive, `lacks` must go.
const CASES = {
  "email_1_1.txt": { has: ["clear a Riak bucket"], lacks: [] },
  "email_1_2.txt": { has: ["You can list the keys", "would do it."], lacks: ["On Tue, 2011-03-01"] },
  "email_1_3.txt": { has: ["Having the function would be great"], lacks: ["wrote:"] },
  "email_1_4.txt": { has: ["Awesome!"], lacks: ["wrote:"] },
  "email_1_5.txt": { has: ["fourth bullet point", "goes on and on"], lacks: [] },
  "email_1_6.txt": { has: ["proper rendering as well"], lacks: ["Corey Donohoe", "wrote:"] },
  "email_1_7.txt": { has: [":+1:"], lacks: ["Wanstrath", "wrote"] },
  "email_1_8.txt": { has: ["I will reply under this one", "and under this."], lacks: ["okay.  Well"] },
  "email_2_1.txt": { has: ["Outlook with a reply"], lacks: ["Google Apps Sync"] },
  "email_2_2.txt": { has: ["Outlook with a reply directly above line"], lacks: ["From:"] },
  "email_one_is_not_on.txt": { has: ["really helpful", "outstanding question"], lacks: [] },
};

for (const [f, c] of Object.entries(CASES)) {
  test(`stripQuoted keeps the reply, drops the history: ${f}`, () => {
    const out = stripQuoted(read(f));
    for (const s of c.has) assert.ok(out.includes(s), `missing "${s}" in:\n${out}`);
    for (const s of c.lacks) assert.ok(!out.includes(s), `kept "${s}" in:\n${out}`);
  });
}

test("a reply typed under the quote still reaches the opt-out rule", () => {
  const msg = "On Tue, Oct 20, 2026 at 9:02 AM, Sam Ortiz <sam@example.test>\nwrote:\n\n> Want a 15 minute demo?\n\nPlease remove me from your list.";
  assert.equal(stripQuoted(msg), "Please remove me from your list.");
  assert.equal(triage({ body: stripQuoted(msg), subject: "", from: "a@b.example" }, "2026-10-24").category, "unsubscribe");
});

// A real Android reply from mailgun/talon (Apache-2.0): the quote header is Russian ("написал:").
test("stripQuoted drops a non-English attribution line (talon android.eml)", () => {
  const eml = read("talon-android.eml");
  const b64 = eml.split(/Content-Transfer-Encoding: base64\r?\n\r?\n/)[1].split(/\r?\n\r?\n/)[0].replace(/\s+/g, "");
  assert.equal(stripQuoted(Buffer.from(b64, "base64").toString("utf8")), "Hello");
});

test("German, French and Spanish attribution lines go; a reply under them is kept", () => {
  const q = "\n> Want a demo?\n";
  assert.equal(stripQuoted("Bitte entfernen Sie mich.\n\nAm 05.10.2026 um 10:12 schrieb Sam Ortiz <sam@example.test>:" + q), "Bitte entfernen Sie mich.");
  assert.equal(stripQuoted("Non merci.\n\nLe 5 oct. 2026 à 10:12, Sam <sam@example.test> a écrit :" + q), "Non merci.");
  assert.equal(stripQuoted("No gracias.\n\nEl 5 oct 2026, Sam <sam@example.test> escribió:" + q), "No gracias.");
  assert.equal(stripQuoted("Am 05.10.2026 schrieb Sam <sam@example.test>:" + q + "\nBitte abmelden."), "Bitte abmelden.");
});

test("a sentence ending in 'schrieb:' with no quote after it is not an attribution", () => {
  assert.equal(stripQuoted("Wie Sam 2026 schrieb:\nwir melden uns."), "Wie Sam 2026 schrieb:\nwir melden uns.");
});
