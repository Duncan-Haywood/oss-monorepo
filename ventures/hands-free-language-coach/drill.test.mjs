import test from "node:test";
import assert from "node:assert/strict";
import {
  PACKS, normalize, similarity, grade, parseCommand, newProgress, updateStreak,
  recordAnswer, planSession, mastered, shareText, xpFor, MAX_BOX, PASS, CLOSE,
} from "./drill.mjs";

test("normalize drops case, accents and punctuation", () => {
  assert.equal(normalize("¿Cómo   ESTÁS?"), "como estas");
  assert.equal(normalize("Je m'appelle Paul"), "je m appelle paul");
  assert.equal(normalize(undefined), "");
});

test("a recogniser transcript without accents or punctuation still passes", () => {
  assert.equal(grade("hola como estas", "Hola, ¿cómo estás?").verdict, "pass");
  assert.equal(grade("muchas gracia", "Muchas gracias").verdict, "pass");
  assert.equal(grade("banana", "Muchas gracias").verdict, "miss");
});

test("grade uses the best of several alternatives", () => {
  const r = grade(["dog days", "buenos dias"], "Buenos días");
  assert.equal(r.verdict, "pass");
  assert.equal(r.score, 1);
});

test("similarity is 0 for an empty answer and 1 for identical text", () => {
  assert.equal(similarity("", "hola"), 0);
  assert.equal(similarity("Hola", "hola!"), 1);
});

test("spoken commands work in English and the target language, short utterances only", () => {
  assert.equal(parseCommand("stop", "es"), "stop");
  assert.equal(parseCommand("Repite", "es"), "repeat");
  assert.equal(parseCommand("next please", "fr"), "skip");
  assert.equal(parseCommand("Wiederholen", "de"), "repeat");
  assert.equal(parseCommand("es para mi amigo de la escuela", "es"), null);
  assert.equal(parseCommand("", "es"), null);
});

test("no phrase in any pack is mistaken for a command", () => {
  for (const [id, pack] of Object.entries(PACKS)) {
    for (const p of pack.phrases) assert.equal(parseCommand(p.tl, id), null, `${id}: ${p.tl}`);
  }
});

test("every pack is well formed", () => {
  for (const [id, pack] of Object.entries(PACKS)) {
    assert.match(pack.voiceLang, /^[a-z]{2}-[A-Z]{2}$/, id);
    assert.ok(pack.phrases.length >= 10, id);
    for (const p of pack.phrases) assert.ok(p.en && p.tl, id);
  }
});

test("streak counts consecutive days and resets after a gap", () => {
  let p = newProgress();
  p = updateStreak(p, "2026-10-01");
  assert.equal(p.streak, 1);
  p = updateStreak(p, "2026-10-01");
  assert.equal(p.streak, 1);
  p = updateStreak(p, "2026-10-02");
  assert.equal(p.streak, 2);
  p = updateStreak(p, "2026-10-05");
  assert.equal(p.streak, 1);
});

test("Leitner boxes rise on a pass, reset on a miss, and cap", () => {
  let p = newProgress();
  for (let i = 0; i < 10; i++) p = recordAnswer(p, "es", 0, "pass");
  assert.equal(p.boxes["es:0"], MAX_BOX);
  assert.equal(p.xp, 10 * xpFor("pass"));
  p = recordAnswer(p, "es", 0, "close");
  assert.equal(p.boxes["es:0"], 0);
});

test("sessions review weak phrases first", () => {
  let p = newProgress();
  p = recordAnswer(p, "es", 0, "pass");
  p = recordAnswer(p, "es", 1, "pass");
  const plan = planSession(p, "es", 4);
  assert.deepEqual(plan, [2, 3, 4, 5]);
  assert.equal(planSession(p, "es", 99).length, PACKS.es.phrases.length);
  assert.throws(() => planSession(p, "xx"));
});

test("share text states streak, XP and mastery without personal data", () => {
  let p = newProgress();
  for (let i = 0; i < 3; i++) p = recordAnswer(p, "fr", 2, "pass");
  p = updateStreak(p, "2026-10-01");
  assert.equal(mastered(p, "fr"), 1);
  assert.match(shareText(p, "fr"), /1-day streak learning French hands-free: 30 XP, 1\/12/);
});

// Quality audit 2026-11-09 (portfolio/quality/audits/2026-11-09-hands-free-language-coach.json):
// meaning-inverting near-misses passed, and PASS, CLOSE and the streak gap
// were not pinned by any test.
test("a dropped or swapped negation is never a pass", () => {
  for (const heard of ["Yo entiendo", "Lo entiendo"]) {
    const g = grade(heard, "No entiendo");
    assert.notEqual(g.verdict, "pass", heard);
    assert.equal(g.negationMismatch, true, heard);
  }
  assert.notEqual(grade("Je comprends pas", "Je ne comprends pas").verdict, "pass");
  assert.notEqual(grade("Ich verstehe", "Ich verstehe nicht").verdict, "pass");
  assert.notEqual(grade("Nao entendi", "Entendi").verdict, "pass");
  assert.equal(grade("no entiendo", "No entiendo").verdict, "pass");
  assert.equal(grade("nao entendi", "Não entendi").verdict, "pass");
});

test("the alternative that keeps the negation wins", () => {
  const g = grade(["Lo entiendo", "No entiendo"], "No entiendo");
  assert.equal(g.verdict, "pass");
  assert.equal(g.score, 1);
});

test("PASS and CLOSE bands sit where the page says", () => {
  assert.equal(PASS, 0.8);
  assert.equal(CLOSE, 0.55);
  // "abcdefghij" vs one, three and five substitutions: 0.9, 0.7, 0.5.
  assert.equal(grade("abcdefghiX", "abcdefghij").verdict, "pass");
  assert.equal(grade("abcdefgXXX", "abcdefghij").verdict, "close");
  assert.equal(grade("abcdeXXXXX", "abcdefghij").verdict, "miss");
  // 0.75 is close, not pass: a 0.6 threshold would pass it.
  assert.equal(grade("abcXdefX", "abcydefz").verdict, "close");
});

test("a missed day breaks the streak", () => {
  let p = updateStreak(newProgress(), "2026-10-01");
  p = updateStreak(p, "2026-10-03");
  assert.equal(p.streak, 1);
  p = updateStreak(p, "2026-10-04");
  assert.equal(p.streak, 2);
});
