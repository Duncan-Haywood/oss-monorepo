import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { triage, findDate, parseReplies, stripQuoted, parseCsv, toCsv, runInbox, checkDraft, draftReply, addBusinessDays, csv, SAMPLE_REPLIES, SAMPLE_PROSPECTS, SAMPLE_OFFER, CATEGORIES } from "./engine.mjs";
import { score, baselineModel } from "./eval/run.mjs";
import { train, guess, TRAINING_FILE } from "./learn.mjs";
import { MODEL } from "./model.mjs";
import { crossValidate } from "./eval/guess-cv.mjs";

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
  const s = score(load("fresh-2026-10-21.jsonl"), { model: baselineModel() });
  // README "How well it reads replies" quotes these. If a rule change moves them, re-measure on a NEW fresh set and
  // update the README; do not tune on this file.
  assert.equal(s.n, 40);
  // Scored 15/22/11 on 2026-10-21; the 2026-10-24 "cease ..." patterns moved it to 16/23/10 (see eval/README.md); the 2026-10-25 opt-out patterns to 17/24/9.
  // 2026-11-07: the "quick call" and "who do I talk to" patterns moved it to 18 (see eval/README.md).
  // 2026-11-10: the real-mail vetoes (eval/enron.mjs) stopped "Funny you should email, we were just complaining" reading as a referral: 19.
  assert.equal(s.right, 19);
  assert.equal(s.acted, 24);
  assert.equal(s.guessRight, 9);
});

test("third set (2026-10-24b): scored once at 34/41, then its two missed unsubscribes were patched; the rest stay measured", () => {
  const s = score(load("fresh-2026-10-24b.jsonl"));
  assert.equal(s.n, 41);
  // 36 before 2026-11-03, when the "are you free" meeting phrasing was added (one item).
  assert.equal(s.right, 37);
  assert.equal(s.acted, 31);
  assert.equal(s.actedRight, 31);
  assert.equal(s.unsubMissed, 0);
  assert.equal(s.overreach, 0);
});

test("opt-outs in French, German, Spanish and Italian and \"cease and desist\" suppress", () => {
  for (const body of ["Merci de me retirer de votre liste de diffusion.", "Bitte kontaktieren Sie mich nicht mehr.", "Por favor no me escriban más.", "Non contattatemi più.", "Cease and desist."]) {
    assert.equal(triage({ body }, T).category, "unsubscribe", body);
  }
});

test("second fresh set (2026-10-24, written by another session, scored once): numbers stay as measured", () => {
  const s = score(load("fresh-2026-10-24.jsonl"), { model: baselineModel() });
  assert.equal(s.n, 41);
  // 27 when scored once; 28 after 2026-11-02, when "I left X" counted as a wrong-person reply (one item, no regression).
  // Row 9 (a full mailbox, first labelled bounce) was relabelled out_of_office on 2026-11-05 when full mailboxes became soft bounces; the count stays 28.
  // 29 after 2026-11-09 ("this isn't for us" style declines, one item, no regression).
  // 30 after 2026-11-11 ("stop following up" is an opt-out, one item, no regression).
  assert.equal(s.right, 30);
  assert.equal(s.acted, 33);
  assert.equal(s.actedRight, 27);
  assert.equal(s.unsubMissed, 2);
  assert.equal(s.guessRight, 3);
});

test("word model: rebuilt from the training files exactly, and it guesses", () => {
  const files = readdirSync(new URL("./eval/", import.meta.url)).filter((f) => TRAINING_FILE.test(f)).sort();
  assert.ok(files.length >= 25 && files.includes("replies.jsonl") && files.includes("fresh-2026-10-21.jsonl"));
  assert.deepEqual(train(files.flatMap(load)), MODEL);
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
  // 34 before 2026-11-02, when "I left Orchid in August" started counting as a wrong-person reply (one item).
  // 35 before 2026-11-03, when "X left the company" was added as a wrong-person phrasing (one item).
  // 37 after 2026-11-04, when "isn't something we'd ever need" became a decline (one item).
  // 38 after 2026-11-11 ("stop following up" is an opt-out, one item).
  // 39 after 2026-11-10 ("doesn't fit a business our size" is an objection, one item).
  assert.equal(s.right, 39);
  assert.equal(s.acted, 39);
  assert.equal(s.actedRight, 39);
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

test("non-English opt-outs probed 2026-11-02 are all unsubscribes, and ordinary replies are not", () => {
  const optOuts = [
    "Ne plus me contacter.", "Ne me contactez plus, merci.", "No gracias, quítame de tu lista", "Bórrame de la lista por favor", "No quiero más correos.",
    "Por favor remova meu email da lista.", "Não quero mais receber seus emails.", "Pare de me enviar mensagens.",
    "Stuur mij geen e-mails meer.", "Geen mailtjes meer alstublieft.", "Verwijder mijn gegevens.", "Schrijf mij uit.",
  ];
  for (const body of optOuts) assert.equal(triage({ body }, T).category, "unsubscribe", body);
  for (const body of ["Sounds interesting, can you send pricing?", "Let's talk next quarter", "Quítame una duda: ¿cuánto cuesta?"]) assert.notEqual(triage({ body }, T).category, "unsubscribe", body);
});

test("opt-outs in SV, DA, NO, PL, FI, TR, CS, HU, RO, RU, JA, ZH and DE/EN probed 2026-11-02 are unsubscribes, and ordinary replies are not", () => {
  const optOuts = [
    "Ta bort mig från er lista.", "Sluta skicka mejl till mig.", "Fjern mig fra jeres liste.", "Send mig ikke flere mails.", "Slett meg fra listen deres.",
    "Proszę usunąć mnie z listy mailingowej.", "Nie przesyłajcie mi więcej maili.", "Poista minut postituslistaltanne.", "Älkää lähettäkö minulle enää sähköpostia.",
    "Beni listenizden çıkarın.", "Bana bir daha e-posta göndermeyin.", "Odhlaste mě prosím z odběru.", "Kérem, töröljenek a listáról.", "Vă rog să mă ștergeți din listă.",
    "Не пишите мне больше.", "Удалите меня из рассылки.", "メールの配信を停止してください。", "退订", "请不要再给我发邮件",
    "Please refrain from emailing me further.", "Take me off.", "Bitte keine Werbung mehr senden.", "Ich möchte keine weiteren Nachrichten erhalten.",
  ];
  for (const body of optOuts) assert.equal(triage({ body }, T).category, "unsubscribe", body);
  for (const body of ["Sounds interesting, can you send pricing?", "Kan du skicka en offert?", "Prześlij proszę cennik.", "Можете прислать цены?", "请发一份报价单"]) assert.notEqual(triage({ body }, T).category, "unsubscribe", body);
});

test("non-English 'not interested' replies close the thread (PT, DE, FR, ES, IT, NL), 2026-11-02", () => {
  for (const b of ["Não tenho interesse, obrigado.", "Kein Interesse, danke.", "Pas intéressé, merci.", "No me interesa, gracias.", "Non siamo interessati.", "Geen interesse, bedankt."]) {
    assert.equal(triage({ subject: "Re: hi", body: b, from: "a@b.example" }, "2026-11-02").category, "not_interested", b);
  }
  assert.equal(triage({ subject: "Re: hi", body: "Kein Interesse, bitte entfernen Sie mich.", from: "a@b.example" }, "2026-11-02").category, "unsubscribe");
});

// A stop is sticky (2026-11-02): later messages from the same person in the same batch, or from someone already
// unsubscribed in the table or on the suppression list, never un-stop them or earn a draft.
import { runInbox as runInboxSticky } from "./engine.mjs";
const stickyRun = (bodies, prospects = "email,first_name,company,status\ndana@x.example,Dana,X,active\n", suppression = "") =>
  runInboxSticky({ replies: bodies.map((body) => ({ from: "dana@x.example", name: "Dana", subject: "Re: hi", body, raw: body })), prospects, suppression, today: "2026-11-02", offer: { sender: "S" } });

test("unsubscribe then an out-of-office keeps the person unsubscribed", () => {
  const o = stickyRun(["Please remove me from your list.", "I am out of office until Nov 20 with limited access."]);
  assert.equal(o.prospects[0].status, "unsubscribed");
  assert.equal(o.prospects[0].paused_until, undefined);
  assert.equal(o.suppression.length, 1);
});
test("unsubscribe then 'tell me more' drafts nothing and asks a person to read both", () => {
  const o = stickyRun(["Please remove me from your list.", "Sure, tell me more, how about Tuesday?"]);
  assert.equal(o.prospects[0].status, "unsubscribed");
  assert.ok(o.items.every((i) => !i.draft));
  assert.ok(o.tasks.some((t) => /asked to stop/.test(t.task)));
});
test("a prospect already unsubscribed in the table gets no draft for a later interested reply", () => {
  const o = stickyRun(["Sure, tell me more."], "email,first_name,company,status\ndana@x.example,Dana,X,unsubscribed\n");
  assert.equal(o.prospects[0].status, "unsubscribed");
  assert.equal(o.items[0].draft, null);
});
test("an unlisted prospect on the suppression list gets no draft", () => {
  const o = stickyRun(["Sure, tell me more."], undefined, "dana@x.example\n");
  assert.equal(o.items[0].draft, null);
  assert.notEqual(o.prospects[0].status, "replied");
});

test("referrals: who owns the decision, 'I left', and 'wrong person' in six languages route to left_company with the named address (2026-11-02, invented probes)", () => {
  const cases = [
    ["Not me, but cc'ing my colleague Raj who runs this: raj@acme.example", "raj@acme.example"],
    ["Please direct all inquiries to procurement@acme.example", "procurement@acme.example"],
    ["No soy la persona indicada, escriba a luis@acme.example", "luis@acme.example"],
    ["Je ne suis pas la bonne personne, contactez marie@acme.example", "marie@acme.example"],
    ["Ich bin nicht zuständig, bitte wenden Sie sich an hans@acme.example", "hans@acme.example"],
    ["I left Acme in March. Reach my replacement at kim@acme.example.", "kim@acme.example"],
    ["Thanks but this goes to Dave in finance, dave@acme.example, he decides on these.", "dave@acme.example"],
  ];
  for (const [body, email] of cases) {
    const r = triage({ from: "x@acme.example", subject: "Re: hi", body }, T);
    assert.equal(r.category, "left_company", body);
    assert.equal(r.referral?.email, email, body);
  }
  // A referral with no address still routes, with nothing to add.
  const r = triage({ from: "x@acme.example", body: "I've passed your note on to our IT director, Priya." }, T);
  assert.equal(r.category, "left_company");
  assert.equal(r.referral, null);
  // An interested reply is not turned into a referral by the word "owns".
  assert.equal(triage({ body: "Sounds good. Can we set up a call Tuesday? I own this budget." }, T).category, "interested");
});

test("quoted Outlook/forwarded headers under a reply are not read as second replies (2026-11-03)", () => {
  const outlook = `From: Dana <dana@x.example>\nSubject: RE: Routing\n\nSounds interesting, can you do Thursday at 3?\n\nFrom: Sam Ortiz <sam@ex.example>\nSent: Monday, November 2, 2026 9:14 AM\nTo: Dana <dana@x.example>\nSubject: Routing\n\nIf you'd rather not hear from me, reply stop and I will unsubscribe you.`;
  const orig = `From: Dana <dana@x.example>\nSubject: RE: Routing\n\nThanks, send pricing.\n\n-----Original Message-----\nFrom: Sam\nPlease let me know and I'll remove you from my list.`;
  const under = `From: Dana <dana@x.example>\n\nLet's talk.\n\n________________________________\nFrom: Sam Ortiz\nNo worries if not interested.`;
  for (const t of [outlook, orig, under]) {
    const r = parseReplies(t);
    assert.equal(r.length, 1);
    assert.equal(r[0].from, "dana@x.example");
    assert.equal(triage(r[0], "2026-11-03").category, "interested");
  }
  // genuinely separate messages still split
  assert.equal(parseReplies("From: a@x.example\n\nstop\n\nFrom: b@y.example\n\nyes please").length, 2);
});

test("sixth set (2026-11-03b): non-opt-out replies, scored once at 37/50 before the change, patched to 50/50; a tuned set", () => {
  const s = score(load("fresh-2026-11-03b.jsonl"));
  assert.equal(s.n, 50);
  assert.equal(s.right, 50);
  assert.equal(s.actedRight, s.acted);
  assert.equal(s.overreach, 0);
});

test("seventh set (2026-11-03c): 24 opt-outs scored once at 10 missed before the change; all caught after; a tuned set, 4 non-opt-outs wrong in the safe direction", () => {
  const rows = load("fresh-2026-11-03c.jsonl");
  const s = score(rows);
  assert.equal(s.n, 30);
  assert.equal(s.unsubMissed, 0);
  assert.equal(s.right, 26);
});

test("eighth set (2026-11-04): quoted footers and signatures stripped as in production; 14/20 before the change (6 misses, 2 of them my label errors), 20/20 after; a tuned set", () => {
  const s = score(load("fresh-2026-11-04.jsonl"));
  assert.equal(s.n, 20);
  assert.equal(s.unsubMissed, 0);
  assert.equal(s.right, 20);
});

test("ninth set (2026-11-04b): 30 mixed replies, scored once before the change at 23/30 (0 overreach, 0 opt-outs missed), 28/30 after; a tuned set. The two left are deliberate: a forward-and-call-ask is a handover, and 'how did you get my email' goes to a person", () => {
  const s = score(load("fresh-2026-11-04b.jsonl"));
  assert.equal(s.n, 30);
  assert.equal(s.unsubMissed, 0);
  assert.equal(s.overreach, 0);
  assert.equal(s.right, 29);
});

test("an unsubscribe link line inside an auto-reply is not an opt-out, but a first-person ask in one still is", () => {
  const away = "I am out of the office until Nov 12. To stop these messages unsubscribe in settings.";
  assert.equal(triage({ subject: "Automatic reply", body: away }, "2026-11-04").category, "out_of_office");
  assert.equal(triage({ subject: "Automatic reply", body: "I am out of the office until Nov 12. Please unsubscribe me." }, "2026-11-04").category, "unsubscribe");
  assert.equal(triage({ subject: "Re: hi", body: "I'd rather not get any more of these." }, "2026-11-04").category, "unsubscribe");
});

test("\"not interested in switching unless you integrate\" is an objection, not a decline", () => {
  const t = triage({ subject: "Re: hi", body: "Not interested in switching unless you integrate with Xero." }, "2026-11-03");
  assert.equal(t.category, "objection");
});

test("GDPR erasure asks stop contact (found as unclear in a 2026-11-04 probe)", () => {
  for (const body of ["Please delete all my personal data under GDPR Article 17.", "I invoke my right to erasure.", "Erase all of my contact details from your systems."])
    assert.equal(triage({ subject: "Re: hi", body }, "2026-11-04").category, "unsubscribe", body);
  assert.notEqual(triage({ subject: "Re: hi", body: "Can you send the data processing details for your product?" }, "2026-11-04").category, "unsubscribe");
});

test("opt-outs in SV, DA, NO, PL, FI, CS, RO probed 2026-11-04 (second batch) are unsubscribes, and ordinary replies are not", () => {
  const optOuts = [
    "Avsluta min prenumeration, tack.", "Stop med at sende mig mails.", "Jeg vil ikke have flere mails.", "Afmeld mig venligst.",
    "Slutt å sende meg e-post.", "Fjern meg fra listen deres.", "Jeg ønsker ikke flere e-poster.", "Nie chcę otrzymywać więcej wiadomości.",
    "Proszę o zaprzestanie wysyłania maili.", "Wypisz mnie.", "Poistakaa minut postituslistaltanne.", "Už mi nepište.", "Vă rog să mă scoateți din listă.",
  ];
  for (const body of optOuts) assert.equal(triage({ body }, T).category, "unsubscribe", body);
  for (const body of ["Kan du skicka en offert?", "Prześlij proszę cennik.", "Jeg vil gerne have flere detaljer.", "Vil du sende flere eksempler?"]) assert.notEqual(triage({ body }, T).category, "unsubscribe", body);
});

test("threats, \"stop mailing\" and Italian stop asks are opt-outs; a forward to a colleague is a handover, not interest (probe 2026-11-04)", () => {
  for (const body of ["My lawyer will be in touch if I hear from you again.", "Stop mailing me or I'll block your domain.", "Smettete di contattarmi.", "I will report you to my provider.", "Stop texting me."])
    assert.equal(triage({ subject: "Re: hi", body }, "2026-11-04").category, "unsubscribe", body);
  const fwd = triage({ subject: "Re: hi", body: "Forwarding this to our head of logistics, cc'd here." }, "2026-11-04");
  assert.equal(fwd.category, "left_company");
  for (const body of ["Our lawyer already approved the contract, send the invoice.", "We should block time next week to talk.", "Happy to forward this to our team, can you send pricing?"])
    assert.notEqual(triage({ subject: "Re: hi", body }, "2026-11-04").category, "unsubscribe", body);
});

test("fresh set 2026-11-05: terse interest, price, trust and dead-inbox replies land in the right bucket", () => {
  const T = "2026-11-05";
  const cases = [
    ["Intrigued. Send me 2-3 times and I'll pick one.", "interested"], ["yes - call me on 555-0142 after 4", "interested"],
    ["Sounds expensive. We're a small shop.", "objection"], ["I don't trust AI writing my emails. Customers can tell.", "objection"],
    ["This inbox is no longer monitored. Contact support@brightline.example.", "left_company"], ["We're not the right company for this - we're a non-profit.", "not_interested"],
  ];
  for (const [body, want] of cases) assert.equal(triage({ subject: "Re: hi", body }, T).category, want, body);
});

test("fresh set 2026-11-06: scored once at 25/30 (0 overreach, 0 opt-outs missed), 28/30 after three narrow patches; a tuned set. Left on purpose: a forward with a demo ask reads as a handover, and a frozen budget reads as not-now", () => {
  const s = score(load("fresh-2026-11-06.jsonl"));
  assert.equal(s.right, 28);
  assert.equal(s.overreach, 0);
  assert.equal(s.unsubMissed, 0);
  const T = "2026-11-06";
  for (const [body, want] of [["Legal won't let us send customer emails through a third-party model.", "objection"], ["Honestly our reps hate anything that adds clicks to their day.", "objection"], ["I've moved to a different role and no longer handle vendor tools. Try Sam Okafor, sam@harborline.example.", "left_company"]])
    assert.equal(triage({ subject: "Re: hi", body }, T).category, want, body);
});

test("fresh set 2026-11-07: scored once at 26/30 (1 overreach), 29/30 after three narrow patches; a tuned set. Left on purpose: a one-pager to forward to a CFO reads as a forward", () => {
  const s = score(load("fresh-2026-11-07.jsonl"));
  assert.equal(s.right, 29);
  assert.equal(s.unsubMissed, 0);
  const T = "2026-11-07";
  for (const [body, want] of [["I'd like to see this. Can we do a quick call tomorrow?", "interested"], ["This is exactly what we need. Who should I talk to to get started?", "interested"], ["Honestly it looks like another tool that will spam our prospects and hurt our domain reputation.", "objection"]])
    assert.equal(triage({ subject: "Re: hi", body }, T).category, want, body);
});

test("fresh set 2026-11-08: scored once at 25/30 (1 overreach, 1 opt-out missed), 30/30 after three narrow patches and two label rulings; a tuned set", () => {
  const s = score(load("fresh-2026-11-08.jsonl"));
  assert.equal(s.right, 30);
  assert.equal(s.unsubMissed, 0);
  const T = "2026-11-08";
  for (const [body, want] of [["Haal me van je lijst af alstublieft. Geen mails meer.", "unsubscribe"], ["Come back to me once we close our funding round, probably spring.", "not_now"], ["Sounds like another tool that sends spam under our name. We got burned by that before.", "objection"]])
    assert.equal(triage({ subject: "Re: hi", body }, T).category, want, body);
});

test("fresh set 2026-11-09: scored once at 18/30 (1 overreach, 2 opt-outs missed), 30/30 after narrow patches; a tuned set", () => {
  const s = score(load("fresh-2026-11-09.jsonl"));
  assert.equal(s.n, 30);
  assert.equal(s.right, 30);
  assert.equal(s.unsubMissed, 0);
  const T = "2026-11-09";
  for (const [body, want] of [["Proszę usunąć mój adres z waszej listy mailingowej.", "unsubscribe"], ["How many times do I need to say it? Out. Of. Your. Database.", "unsubscribe"], ["Appreciate the persistence but this isn't for us. Best of luck.", "not_interested"], ["Reach out again once that's done, likely end of Q2.", "not_now"], ["Tack för ditt mejl. Jag är på semester till och med 24 november.", "out_of_office"], ["Can you send me a time that works for a 20 minute demo next week?", "interested"]])
    assert.equal(triage({ subject: "Re: hi", body }, T).category, want, body);
});

// Full mailbox (2026-11-05). First tried as a soft bounce; 8 of the 117 real bounces in eval/bounce-corpus are final
// "returned to sender" notices for a full mailbox, so the category stays bounce. The subtype only changes the task.
test("a full mailbox stays a bounce, tagged mailbox_full, and the task says the address may be real", () => {
  for (const body of ["The recipient's mailbox is full and can't accept messages now. 452 4.2.2", "552 5.2.2 Mailbox full: over quota", "Quota exceeded (mailbox for user is full)"]) {
    const t = triage({ from: "mailer-daemon@x.com", subject: "Undelivered Mail Returned to Sender", body });
    assert.equal(t.category, "bounce", body);
    assert.equal(t.subtype, "mailbox_full", body);
  }
  const u = triage({ from: "mailer-daemon@x.com", subject: "Delivery Status Notification (Failure)", body: "550 5.1.1 User unknown" });
  assert.equal(u.category, "bounce");
  assert.equal(u.subtype, null);
  const r = runInbox({ replies: "From: MAILER-DAEMON@x.com\nSubject: Mail delivery failed\n\nThe following address failed: mark@oldco.example (mailbox is full / user over quota)", prospects: "email,name,company\nmark@oldco.example,Mark,OldCo\n", offer: SAMPLE_OFFER, today: T });
  assert.ok(JSON.stringify(r).includes("mailbox is full, so the address is probably still real"), JSON.stringify(r.tasks));
});

// 2026-11-05: probed with fresh agent-written replies; both fell to "unclear" before.
test("a bare 'not the right person' with a referral is a handover, 'just signed with' a rival is a competitor objection", async () => {
  const { triage } = await import("./engine.mjs");
  const a = triage("Not the right person, try our head of ops, Mike Lin (mike@acme.io).", "2026-11-05");
  assert.equal(a.category, "left_company");
  assert.equal(a.referral.email, "mike@acme.io");
  const b = triage("Thanks but we just signed with a competitor last week. Good luck!", "2026-11-05");
  assert.equal(b.category, "objection");
  assert.equal(b.subtype, "competitor");
});

test("negated, product-feature and third-party stop words are not opt-outs (2026-11-08 probe)", () => {
  const notStop = [
    "Please don't stop sending the pricing details, I'd like to see them before our call on Thursday.",
    "Love it. Don't take me off the shortlist, send over the case study please.",
    "Do you handle unsubscribe links and suppression lists for us?",
    "My colleague asked me to unsubscribe from a different vendor's emails, not yours. Can you tell me what your product does exactly?",
    "Not unsubscribing, quite the opposite. Tell me more about the pilot.",
  ];
  for (const body of notStop) assert.notEqual(triage({ from: "p@x.example", subject: "Re: hi", body }, "2026-11-08").category, "unsubscribe", body);
  // look-alikes that still stop
  for (const body of ["How do I unsubscribe?", "Please don't contact me again.", "Unsubscribe me.", "Don't stop by, just remove me from your list."])
    assert.equal(triage({ from: "p@x.example", subject: "Re: hi", body }, "2026-11-08").category, "unsubscribe", body);
});

test("'was out of the office' in a past-tense apology is not an away notice", () => {
  const t = triage({ from: "p@x.example", subject: "Re: hi", body: "Sorry for the late reply, I was out of the office. Yes, let's set up a 20 minute call." }, "2026-11-08");
  assert.notEqual(t.category, "out_of_office");
});

test("fresh set 2026-11-08c (sixteenth, a false-interested probe): scored once at 13/20 (3 overreach), 17/20 after narrow patches; a tuned set", () => {
  const s = score(load("fresh-2026-11-08c.jsonl"));
  assert.equal(s.n, 20);
  assert.equal(s.right, 17);
  assert.equal(s.overreach, 1); // "we just signed with another vendor" drafts an objection answer; the label says not_interested, arguably wrong
  assert.equal(s.unsubMissed, 0);
  const T = "2026-11-08";
  for (const [body, want] of [["Happy to chat in theory, but our board froze all new tooling for good. Please close the file.", "not_interested"], ["I'd be open to a demo after our fiscal year ends on 30 June. Please come back then.", "not_now"], ["Yes, let's talk. Does Wednesday at 3pm work? Not interested in the other plan, just the starter one.", "interested"]])
    assert.equal(triage({ subject: "Re: hi", body }, T).category, want, body);
});

test("fresh set 2026-11-08d (seventeenth, a false-bounce and false-away probe): scored once at 9/20, 16/20 after one narrow veto; a tuned set", () => {
  const s = score(load("fresh-2026-11-08d.jsonl"));
  assert.equal(s.n, 20);
  assert.equal(s.right, 16);
  assert.equal(s.overreach, 0);
  const T = "2026-11-08";
  for (const [body, want] of [["Your message wasn't delivered to my colleague, can you resend it to me instead? Also, what does it cost?", "question"], ["I'm travelling for work until the 20th, so ping me after that and we can talk.", "not_now"], ["Our team is on leave for the whole quarter and we've no appetite for new tools. Please close the file.", "not_interested"]])
    assert.equal(triage({ subject: "Re: hi", body }, T).category, want, body);
  // machines still win: a daemon sender or a header signal is never a person, whatever it says
  assert.equal(triage({ from: "mailer-daemon@x.example", subject: "Undeliverable", body: "Delivery has failed. Can we help? 550 5.1.1 user unknown" }, T).category, "bounce");
  assert.equal(triage({ subject: "Automatic reply", body: "I am out of the office until 12 December with limited access to email." }, T).category, "out_of_office");
});

test("fresh set 2026-11-08e (nineteenth, a false-not-now and wrong-person probe): scored once at 9/20, 15/20 after three narrow changes (16/20 with the 2026-11-11 vetoes); a tuned set", () => {
  const s = score(load("fresh-2026-11-08e.jsonl"));
  assert.equal(s.n, 20);
  assert.equal(s.right, 16);
  assert.equal(s.overreach, 0);
  const T = "2026-11-08";
  for (const [body, want] of [["We're in the middle of a CRM migration. Does your tool work with HubSpot imports?", "question"], ["Timing isn't right for us because the price is double what we pay for our current tool. Can you do better?", "objection"], ["Not now, not later, not ever. We have no use for this. Please close the file.", "not_interested"], ["Wrong person, but also wrong product. We'd never buy this. Don't follow up.", "not_interested"], ["Swamped until the end of the quarter. Ping me in February and I'll look then.", "not_now"]])
    assert.equal(triage({ subject: "Re: hi", body }, T).category, want, body);
});

test("fresh set 2026-11-11 (eighteenth, a false not-now and wrong-person probe): scored once at 9/20 (6 live leads read as a departed contact), 18/20 after narrow vetoes; a tuned set", () => {
  const s = score(load("fresh-2026-11-11.jsonl"));
  assert.equal(s.n, 20);
  assert.equal(s.right, 18);
  assert.equal(s.overreach, 0);
  const T = "2026-11-11";
  for (const [body, want] of [
    ["I'm not the right person for budget but I'm the one who'd use it. Happy to see a demo, I'll loop in finance. Friday?", "interested"],
    ["Wrong time, not wrong person. Reach out in January.", "not_now"],
    ["Please stop following up.", "unsubscribe"],
    ["Call me later today, around 3pm. I'm free after lunch.", "interested"],
    ["I'm not the right contact for this. Try our CFO, Priya Rao (priya@acmefreight.example).", "left_company"],
    ["Sam no longer works here. For anything else please email info@acmefreight.example.", "left_company"],
    ["Check back in March when our contract renews.", "not_now"],
  ]) assert.equal(triage({ subject: "Re: hi", body }, T).category, want, body);
});

test("twenty-first set (2026-11-13 file): question, objection and interest probe, 17/20 before patches, 19/20 after; the Dan handover stays a wrong-person read", () => {
  const s = score(load("fresh-2026-11-13.jsonl"));
  assert.equal(s.n, 20);
  assert.equal(s.right, 19);
  assert.equal(s.overreach, 0);
});

test("word model, leave-one-set-out (eval/guess-cv.mjs): the wider model beats the first one on unseen sets", () => {
  const { totals } = crossValidate();
  // 2026-11-11: 28/57 right, overreach 2, no unsubscribe drafted; the 120-reply model 19/57, overreach 7, 1 unsubscribe drafted.
  assert.deepEqual([totals.cvFresh.right, totals.cvFresh.handoffs, totals.cvFresh.overreach, totals.cvFresh.unsubAsOutbound], [28, 57, 2, 0]);
  assert.deepEqual([totals.shippedFresh.right, totals.shippedFresh.overreach, totals.shippedFresh.unsubAsOutbound], [19, 7, 1]);
});
