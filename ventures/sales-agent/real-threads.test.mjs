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
