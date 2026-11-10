import test from "node:test";
import assert from "node:assert/strict";
import { triage } from "./engine.mjs";
import { readAsServer, looksAuto, looksBounce } from "./eval/enron.mjs";

// Phrasings found on real mail (eval/enron.mjs on the Enron corpus, 2026-11-10; eval/README.md "Real mail: the Enron
// corpus"). Paraphrased, no names from the corpus. Each fired a stop (a lead suppressed, paused or marked departed) on
// real writing that asks for nothing of the kind.
const cat = (body, extra = {}) => triage({ body, subject: "", from: "pat@example.test", ...extra }, "2026-11-10").category;

const NOT_A_STOP = [
  "If you have received this email in error, please notify the sender and delete this message from your system.",
  "To unsubscribe from this group, send an email to: list-unsubscribe@example.test",
  "If you no longer wish to receive this alert, click here to unsubscribe.",
  "The contract has a one day opt-out clause.",
  "If you have any questions, please contact me at 555-0100.",
  "Please contact Sam Ortiz for the weekly dial-in number and passcode.",
  "I left you a voicemail this morning about the renewal.",
  "I have left Jordan a message asking her to call you.",
  "When I left the meeting I thought we had a plan.",
  "Please let us know how you would like us to handle this.",
  "There is no need to amend the schedule.",
  "Thanks, I'll pass it on to the rest of the team.",
  "I will pass your comments on to the committee.",
  "It is my understanding that the counterparty is not interested in an option.",
  "We are fine with changing the issue to yellow.",
  "Please advise if you are planning to be out of the office in June.",
  "She stepped out of the office for a minute.",
  "Sign it and I will return a fully executed copy to you.",
  "That adds about $800,ooo to this year's earnings.",
];
for (const body of NOT_A_STOP) {
  test(`real-mail phrasing is not a stop: ${body.slice(0, 60)}`, () => {
    assert.ok(!["unsubscribe", "bounce", "left_company", "not_interested", "out_of_office"].includes(cat(body)), cat(body));
  });
}

// The real asks found in the same mail still stop.
const STILL = {
  "Take me off this list, please.": "unsubscribe",
  "Please remove me from your distribution list.": "unsubscribe",
  "Please take my name off of your emails, I am no longer in that group.": "unsubscribe",
  "I am out of the office until Monday.": "out_of_office",
  "I will be back in the office on Thursday.": "out_of_office",
  "I am on maternity leave.": "out_of_office",
  "I am no longer with the gas desk.": "left_company",
  "Susan handles that function.": "left_company",
  "Not interested.": "not_interested",
  "Thanks but I will pass for now.": "not_interested",
  "I'll pass on this one, good luck with it.": "not_interested",
  "Thanks but we're all set with our current provider.": "not_interested",
};
for (const [body, want] of Object.entries(STILL)) test(`real ask still stops: ${body}`, () => assert.equal(cat(body), want));

test("an auto-reply sent from postmaster@ is an away notice, not a bounce (real: maternity leave, referrals)", () => {
  const t = triage({ from: "postmaster@mail.example.test", subject: "Auto Reply to your message ...", body: "----- The following text is an automated response to your message -----\nThanks for your message, I am on maternity leave. In my absence, please contact Dana, dana@example.test" }, "2026-11-10");
  assert.equal(t.category, "out_of_office");
});

test("a person replying under an 'Undeliverable' subject is not a bounce; a daemon still is", () => {
  assert.notEqual(cat("Did this reach you? It came back the first time.", { subject: "RE: Fw: Undeliverable: Fw: Last schedule" }), "bounce");
  assert.equal(triage({ from: "mailer-daemon@mx.example.test", subject: "Undeliverable: hello", body: "User unknown" }, "2026-11-10").category, "bounce");
});

test("readAsServer reads a raw message the way the self-host server does (quoted-printable, history cut)", () => {
  const raw = "Message-ID: <1@example.test>\nFrom: pat@example.test\nSubject: RE: hello\nContent-Type: text/plain; charset=us-ascii\nContent-Transfer-Encoding: quoted-printable\n\nPlease take me off this list, th=\nanks.\n\n-----Original Message-----\nFrom: us@example.test\nWant a demo?";
  const got = readAsServer(raw);
  assert.equal(got.headers.messageId, "<1@example.test>");
  assert.equal(got.reply.body, "Please take me off this list, thanks.");
  assert.equal(triage(got.reply, "2026-11-10").category, "unsubscribe");
});

test("recall checks: auto-reply subjects only (not people asking for vacation days), daemon bounces", () => {
  assert.ok(looksAuto({ subject: "Out of Office AutoReply: budget" }));
  assert.ok(!looksAuto({ subject: "Vacation days" }) && !looksAuto({ subject: "Re: Out of office" }));
  assert.ok(looksBounce({ from: "Mail Delivery Subsystem <MAILER-DAEMON@mx.example.test>", subject: "Returned mail" }));
  assert.ok(!looksBounce({ from: "postmaster@x.example.test", subject: "Auto Reply to your message" }));
});
