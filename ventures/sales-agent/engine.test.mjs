import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { triage, findDate, parseReplies, stripQuoted, parseCsv, toCsv, runInbox, checkDraft, draftReply, addBusinessDays, csv, SAMPLE_REPLIES, SAMPLE_PROSPECTS, SAMPLE_OFFER, CATEGORIES } from "./engine.mjs";
import { score } from "./eval/run.mjs";
import { train, guess } from "./learn.mjs";
import { MODEL } from "./model.mjs";

const T = "2026-10-21"; // a Wednesday
const load = (f) => readFileSync(new URL(`./eval/${f}`, import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("dates: month-day, numeric, weekday, relative, quarters, seasons", () => {
  assert.equal(findDate("back on March 3", T).date, "2027-03-03");
  assert.equal(findDate("until 4 November", T).date, "2026-11-04");
  assert.equal(findDate("back on 11/10", T).date, "2026-11-10");
  assert.equal(findDate("returning 2026-12-01", T).date, "2026-12-01");
  assert.equal(findDate("back on Monday", T).date, "2026-10-26");
  assert.equal(findDate("in two weeks", T).date, "2026-11-04");
  assert.equal(findDate("in 3 months", T).date, "2027-01-21");
  assert.equal(findDate("try me in Q1", T).date, "2027-01-01");
  assert.equal(findDate("next quarter", T).date, "2027-01-01");
  assert.equal(findDate("after June", T).date, "2027-07-01");
  assert.equal(findDate("in the spring", T).date, "2027-03-01");
  assert.equal(findDate("no date here", T), null);
  assert.equal(addBusinessDays("2026-10-23", 1), "2026-10-26"); // Friday -> Monday
});

test("parsing: blocks split on --- or From:, headers read, quoted history dropped", () => {
  const r = parseReplies(SAMPLE_REPLIES);
  assert.equal(r.length, 6);
  assert.equal(r[0].from, "dana@brightline.example");
  assert.equal(r[0].name, "Dana Reyes");
  assert.match(r[0].subject, /route planning/);
  const q = stripQuoted("Sounds good, send times.\n\nOn Tue, Oct 20, 2026 at 9:00 AM Sam <sam@x.example> wrote:\n> Hi Dana,\n> unsubscribe here");
  assert.equal(q, "Sounds good, send times.");
  assert.doesNotMatch(stripQuoted("Yes.\n-- \nDana\nunsubscribe link"), /unsubscribe/);
  const two = parseReplies("From: a@x.example\nhi\nFrom: b@y.example\nyo");
  assert.deepEqual(two.map((x) => x.from), ["a@x.example", "b@y.example"]);
});

test("CSV: quotes, commas, formulas neutralised", () => {
  const rows = parseCsv('Email,First Name\n"a@x.example","Ann, Jr"\n');
  assert.deepEqual(rows, [{ email: "a@x.example", first_name: "Ann, Jr" }]);
  assert.equal(toCsv([{ a: "=HYPERLINK(1)" }], ["a"]), "a\n'=HYPERLINK(1)\n");
});

test("precedence: any request for less contact wins", () => {
  assert.equal(triage({ body: "Sounds interesting but please take us off this list." }, T).category, "unsubscribe");
  assert.equal(triage({ body: "Not interested, please stop emailing." }, T).category, "unsubscribe");
  assert.equal(triage({ body: "We use RouteWorks, but happy to take a look, send me some times." }, T).category, "interested");
  assert.equal(triage({ body: "Not right now. Try me in Q1." }, T).category, "not_now");
  assert.equal(triage({ from: "mailer-daemon@mx.example", body: "could not be delivered" }, T).category, "bounce");
  assert.equal(triage({ body: "ok" }, T).category, "unclear");
});

test("the tuned eval sets score perfectly (a regression floor, not an accuracy claim)", () => {
  for (const f of ["replies.jsonl", "heldout.jsonl"]) {
    const s = score(load(f), { useGuess: false });
    assert.equal(s.right, s.n, `${f}: ${JSON.stringify(s.misses)}`);
  }
});

test("the fresh set is reported, not tuned: numbers recorded in README stay as measured", () => {
  const s = score(load("fresh-2026-10-21.jsonl"));
  // README "How well it reads replies" quotes these. If a rule change moves them, re-measure on a NEW fresh set and
  // update the README; do not tune on this file.
  assert.equal(s.n, 40);
  // Scored 15/22/11 on 2026-10-21; the 2026-10-24 "cease ..." patterns moved it to 16/23/10 (see eval/README.md); the 2026-10-25 opt-out patterns to 17/24/9.
  assert.equal(s.right, 17);
  assert.equal(s.acted, 24);
  assert.equal(s.guessRight, 9);
});

test("third set (2026-10-24b): scored once at 34/41, then its two missed unsubscribes were patched; the rest stay measured", () => {
  const s = score(load("fresh-2026-10-24b.jsonl"));
  assert.equal(s.n, 41);
  assert.equal(s.right, 36);
  assert.equal(s.acted, 31);
  assert.equal(s.actedRight, 30);
  assert.equal(s.unsubMissed, 0);
  assert.equal(s.overreach, 0);
});

test("opt-outs in French, German, Spanish and Italian and \"cease and desist\" suppress", () => {
  for (const body of ["Merci de me retirer de votre liste de diffusion.", "Bitte kontaktieren Sie mich nicht mehr.", "Por favor no me escriban más.", "Non contattatemi più.", "Cease and desist."]) {
    assert.equal(triage({ body }, T).category, "unsubscribe", body);
  }
});

test("second fresh set (2026-10-24, written by another session, scored once): numbers stay as measured", () => {
  const s = score(load("fresh-2026-10-24.jsonl"));
  assert.equal(s.n, 41);
  assert.equal(s.right, 27);
  assert.equal(s.acted, 31);
  assert.equal(s.actedRight, 24);
  assert.equal(s.unsubMissed, 2);
  assert.equal(s.guessRight, 4);
});

test("word model: rebuilt from the training files exactly, and it guesses", () => {
  const rows = ["replies.jsonl", "heldout.jsonl"].flatMap(load);
  assert.deepEqual(train(rows), MODEL);
  assert.equal(guess({ subject: "Re: hi", body: "please remove me" }).category, "unsubscribe");
  assert.equal(guess({ subject: "", body: "x" }, null), null);
});

test("the inbox agent: suppresses, pauses, drafts, and queues for approval", () => {
  const r = runInbox({ replies: SAMPLE_REPLIES, prospects: SAMPLE_PROSPECTS, offer: SAMPLE_OFFER, today: T });
  const by = Object.fromEntries(r.items.map((i) => [i.from, i]));
  assert.equal(by["omar@peakdental.example"].triage.category, "unsubscribe");
  assert.equal(by["omar@peakdental.example"].draft, null);
  assert.deepEqual(r.suppression.map((s) => s.email), ["omar@peakdental.example"]);
  assert.equal(r.suppression[0].evidence, "Please remove me from your list.");
  const li = r.prospects.find((p) => p.email === "li.wei@harbourfoods.example");
  assert.equal(li.status, "paused");
  assert.equal(li.paused_until, "2027-03-04"); // back Wed 3 March 2027 -> business day after
  assert.equal(by["dana@brightline.example"].approval, "needs_approval");
  assert.ok(by["dana@brightline.example"].lint.ok, JSON.stringify(by["dana@brightline.example"].lint));
  assert.equal(r.deals[0].stage, "qualified");
  assert.equal(by["tom@riverbendhvac.example"].lint.ok, false); // placeholder must be filled before approval
  assert.ok(r.tasks.some((t) => t.email === "ops@harbourfoods.example"));
  // nothing is ever marked sent
  assert.ok(r.items.every((i) => ["needs_approval", "nothing_to_send", "guess_check_first"].includes(i.approval)));
  assert.match(csv.suppression(r), /^email,reason,date,evidence\n/);
});

test("already-suppressed addresses are not added twice; unknown senders become prospects", () => {
  const r = runInbox({ replies: "From: new@co.example\nUnsubscribe", suppression: "new@co.example", today: T });
  assert.equal(r.suppression.length, 0);
  assert.equal(r.prospects[0].email, "new@co.example");
  assert.equal(r.prospects[0].status, "unsubscribed");
});

test("guesses suggest but never act", () => {
  const r = runInbox({ replies: "From: x@co.example\nSubject: Re: hi\nGo on then, convince me.", today: T }, { guessFn: () => ({ category: "unsubscribe", margin: 3 }) });
  assert.equal(r.items[0].triage.category, "unclear");
  assert.equal(r.items[0].triage.guess.category, "unsubscribe");
  assert.equal(r.suppression.length, 0);
  assert.equal(r.prospects[0].status, "paused");
  const g = runInbox({ replies: "From: x@co.example\nhmm", offer: SAMPLE_OFFER, today: T }, { guessFn: () => ({ category: "interested", margin: 1 }) });
  assert.equal(g.items[0].approval, "guess_check_first");
  assert.equal(g.deals.length, 0);
});

test("draft checks: invented numbers, spam phrases, placeholders, opt-out", () => {
  const ok = draftReply({ category: "interested" }, { first_name: "Dana" }, { subject: "x", body: "" }, SAMPLE_OFFER);
  assert.ok(checkDraft(ok, Object.values(SAMPLE_OFFER).join(" ")).ok);
  const bad = checkDraft({ subject: "Re: x", body: "We cut costs 40% guaranteed. Act now. [name]" }, "");
  assert.ok(bad.errors.some((e) => /40%/.test(e)));
  assert.ok(bad.errors.some((e) => /guarantee/.test(e)));
  assert.ok(bad.errors.some((e) => /urgency/.test(e)));
  assert.ok(bad.errors.some((e) => /placeholder/.test(e)));
  assert.ok(bad.errors.some((e) => /opt out/.test(e)));
  assert.ok(checkDraft({ body: "They mentioned 12 drivers. Reply unsubscribe to stop." }, "pricing for 12 drivers").ok);
  for (const [k, v] of Object.entries(CATEGORIES)) if (!v.outbound) assert.equal(draftReply({ category: k }, {}, { body: "" }, SAMPLE_OFFER), null, k);
});

test("an explicit ask anywhere in the reply makes it clear, and dates keep the writer's case", () => {
  const t = triage({ body: "This sounds interesting. Could you send over a few times next week for a quick call?" }, T);
  assert.equal(t.confidence, "clear");
  assert.match(t.evidence, /send over a few times/);
  assert.equal(findDate("Try me again in Q1.", T).text, "Q1");
  assert.equal(findDate("back on March 3", T).text, "March 3");
});

test("fourth set (2026-10-25): scored once at 25/42 with 9 of 18 unsubscribes missed, then those were patched; the rest stay measured", () => {
  const s = score(load("fresh-2026-10-25.jsonl"));
  assert.equal(s.n, 42);
  assert.equal(s.right, 34);
  assert.equal(s.acted, 34);
  assert.equal(s.actedRight, 34);
  assert.equal(s.unsubMissed, 0);
});

test("non-English auto-replies and opt-outs are named, not left as unclear (agent-written phrasings)", () => {
  const t = (subject, body) => triage({ from: "p@example.com", name: "", subject, body }, "2026-10-26").category;
  const oof = [["Abwesenheitsnotiz: Frage", "Ich bin bis zum 3. November nicht im Büro."], ["Réponse automatique : Question", "Je suis absent du bureau jusqu'au 3 novembre."],
    ["Respuesta automática: Pregunta", "Estaré fuera de la oficina hasta el 3 de noviembre."], ["Risposta automatica", "Sono fuori ufficio fino al 3 novembre."],
    ["Resposta automática", "Estou ausente até 3 de novembro."], ["Automatisch antwoord", "Ik ben afwezig tot 3 november."]];
  for (const [s, b] of oof) assert.equal(t(s, b), "out_of_office", s);
  const out = ["Bitte entfernen Sie mich aus Ihrem Verteiler.", "Ne m'envoyez plus d'emails s'il vous plaît.", "Por favor, quiero darme de baja de su lista.",
    "Cancellatemi dalla vostra lista.", "Não me envie mais emails.", "Graag uitschrijven, ik wil dit niet meer."];
  for (const b of out) assert.equal(t("Re: hello", b), "unsubscribe", b);
});
