// Lesson logic for the hands-free drill: phrase packs, answer grading,
// spoken commands, spaced review (Leitner boxes), XP and daily streaks.
// No DOM, no network -- index.html wires this to the browser's speech APIs.

export const PACKS = {
  es: {
    name: "Spanish",
    voiceLang: "es-ES",
    commands: { repeat: ["repite", "otra vez"], skip: ["siguiente"], stop: ["para", "basta"] },
    phrases: [
      { en: "Hello, how are you?", tl: "Hola, ¿cómo estás?" },
      { en: "Good morning", tl: "Buenos días" },
      { en: "Thank you very much", tl: "Muchas gracias" },
      { en: "My name is Ana", tl: "Me llamo Ana" },
      { en: "Where is the bathroom?", tl: "¿Dónde está el baño?" },
      { en: "I would like a coffee, please", tl: "Quisiera un café, por favor" },
      { en: "How much does it cost?", tl: "¿Cuánto cuesta?" },
      { en: "I don't understand", tl: "No entiendo" },
      { en: "Can you speak more slowly?", tl: "¿Puede hablar más despacio?" },
      { en: "See you tomorrow", tl: "Hasta mañana" },
      { en: "I am learning Spanish", tl: "Estoy aprendiendo español" },
      { en: "The check, please", tl: "La cuenta, por favor" },
    ],
  },
  fr: {
    name: "French",
    voiceLang: "fr-FR",
    commands: { repeat: ["répète", "encore"], skip: ["suivant"], stop: ["arrête"] },
    phrases: [
      { en: "Hello, how are you?", tl: "Bonjour, comment ça va ?" },
      { en: "Thank you very much", tl: "Merci beaucoup" },
      { en: "My name is Paul", tl: "Je m'appelle Paul" },
      { en: "Where is the station?", tl: "Où est la gare ?" },
      { en: "I would like a coffee, please", tl: "Je voudrais un café, s'il vous plaît" },
      { en: "How much is it?", tl: "C'est combien ?" },
      { en: "I don't understand", tl: "Je ne comprends pas" },
      { en: "Can you speak more slowly?", tl: "Pouvez-vous parler plus lentement ?" },
      { en: "See you tomorrow", tl: "À demain" },
      { en: "I am learning French", tl: "J'apprends le français" },
      { en: "Excuse me", tl: "Excusez-moi" },
      { en: "Have a good day", tl: "Bonne journée" },
    ],
  },
  de: {
    name: "German",
    voiceLang: "de-DE",
    commands: { repeat: ["wiederholen", "nochmal"], skip: ["weiter"], stop: ["stopp", "halt"] },
    phrases: [
      { en: "Hello, how are you?", tl: "Hallo, wie geht's?" },
      { en: "Good morning", tl: "Guten Morgen" },
      { en: "Thank you very much", tl: "Vielen Dank" },
      { en: "My name is Lena", tl: "Ich heiße Lena" },
      { en: "Where is the train station?", tl: "Wo ist der Bahnhof?" },
      { en: "I would like a coffee, please", tl: "Ich hätte gern einen Kaffee, bitte" },
      { en: "How much does it cost?", tl: "Wie viel kostet das?" },
      { en: "I don't understand", tl: "Ich verstehe nicht" },
      { en: "Can you speak more slowly?", tl: "Können Sie langsamer sprechen?" },
      { en: "See you tomorrow", tl: "Bis morgen" },
      { en: "I am learning German", tl: "Ich lerne Deutsch" },
      { en: "Excuse me", tl: "Entschuldigung" },
    ],
  },
  it: {
    name: "Italian",
    voiceLang: "it-IT",
    commands: { repeat: ["ripeti", "ancora"], skip: ["avanti", "prossima"], stop: ["basta", "fermati"] },
    phrases: [
      { en: "Hello, how are you?", tl: "Ciao, come stai?" },
      { en: "Good morning", tl: "Buongiorno" },
      { en: "Thank you very much", tl: "Grazie mille" },
      { en: "My name is Marco", tl: "Mi chiamo Marco" },
      { en: "Where is the station?", tl: "Dov'è la stazione?" },
      { en: "I would like a coffee, please", tl: "Vorrei un caffè, per favore" },
      { en: "How much does it cost?", tl: "Quanto costa?" },
      { en: "I don't understand", tl: "Non capisco" },
      { en: "Can you speak more slowly?", tl: "Può parlare più lentamente?" },
      { en: "See you tomorrow", tl: "A domani" },
      { en: "I am learning Italian", tl: "Sto imparando l'italiano" },
      { en: "The check, please", tl: "Il conto, per favore" },
    ],
  },
  pt: {
    name: "Portuguese (Brazil)",
    voiceLang: "pt-BR",
    commands: { repeat: ["repete", "de novo"], skip: ["próxima"], stop: ["para", "chega"] },
    phrases: [
      { en: "Hello, how are you?", tl: "Oi, tudo bem?" },
      { en: "Good morning", tl: "Bom dia" },
      { en: "Thank you very much", tl: "Muito obrigado" },
      { en: "My name is João", tl: "Meu nome é João" },
      { en: "Where is the bathroom?", tl: "Onde fica o banheiro?" },
      { en: "I would like a coffee, please", tl: "Eu queria um café, por favor" },
      { en: "How much does it cost?", tl: "Quanto custa?" },
      { en: "I don't understand", tl: "Não entendi" },
      { en: "Can you speak more slowly?", tl: "Você pode falar mais devagar?" },
      { en: "See you tomorrow", tl: "Até amanhã" },
      { en: "I am learning Portuguese", tl: "Estou aprendendo português" },
      { en: "The check, please", tl: "A conta, por favor" },
    ],
  },
};

// English command words work in every pack; recognisers set to the target
// language usually still transcribe them.
const ENGLISH_COMMANDS = { repeat: ["repeat", "again"], skip: ["skip", "next"], stop: ["stop", "pause"] };

export const PASS = 0.8;
export const CLOSE = 0.55;
export const MAX_BOX = 5;

export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(heard, expected) {
  const a = normalize(heard);
  const b = normalize(expected);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Speech recognisers return several alternatives; grade the best one.
export function grade(alternatives, expected) {
  const list = Array.isArray(alternatives) ? alternatives : [alternatives];
  let best = 0;
  for (const alt of list) best = Math.max(best, similarity(alt, expected));
  const verdict = best >= PASS ? "pass" : best >= CLOSE ? "close" : "miss";
  return { score: Math.round(best * 100) / 100, verdict };
}

export function parseCommand(heard, packId) {
  const norm = normalize(heard);
  // Only a short utterance counts as a command, so a phrase that happens
  // to contain "para" ("para mí") is still graded as an answer.
  if (!norm || norm.split(" ").length > 3) return null;
  const text = ` ${norm} `;
  const own = PACKS[packId]?.commands ?? {};
  for (const name of ["stop", "repeat", "skip"]) {
    const words = [...ENGLISH_COMMANDS[name], ...(own[name] ?? [])];
    if (words.some((w) => text.includes(` ${normalize(w)} `))) return name;
  }
  return null;
}

export function xpFor(verdict) {
  return verdict === "pass" ? 10 : verdict === "close" ? 4 : 1;
}

export function newProgress() {
  return { xp: 0, streak: 0, lastDay: null, boxes: {} };
}

function dayNumber(isoDay) {
  return Math.floor(Date.parse(`${isoDay}T00:00:00Z`) / 86400000);
}

// A streak counts calendar days with at least one completed session.
export function updateStreak(progress, isoDay) {
  const out = { ...progress };
  if (out.lastDay === isoDay) return out;
  const gap = out.lastDay ? dayNumber(isoDay) - dayNumber(out.lastDay) : null;
  out.streak = gap === 1 ? out.streak + 1 : 1;
  out.lastDay = isoDay;
  return out;
}

export function phraseKey(packId, index) {
  return `${packId}:${index}`;
}

// Leitner: a pass moves the phrase up a box, anything else sends it to box 0.
export function recordAnswer(progress, packId, index, verdict) {
  const key = phraseKey(packId, index);
  const box = progress.boxes[key] ?? 0;
  const next = verdict === "pass" ? Math.min(box + 1, MAX_BOX) : 0;
  return { ...progress, xp: progress.xp + xpFor(verdict), boxes: { ...progress.boxes, [key]: next } };
}

// Lowest boxes first (new and missed phrases), pack order breaking ties, so a
// session reviews what you get wrong before moving on to what you know.
export function planSession(progress, packId, size = 8) {
  const pack = PACKS[packId];
  if (!pack) throw new Error(`Unknown pack: ${packId}`);
  return pack.phrases
    .map((_, i) => ({ i, box: progress.boxes[phraseKey(packId, i)] ?? 0 }))
    .sort((a, b) => a.box - b.box || a.i - b.i)
    .slice(0, Math.min(size, pack.phrases.length))
    .map((p) => p.i);
}

export function mastered(progress, packId) {
  const pack = PACKS[packId];
  return pack.phrases.filter((_, i) => (progress.boxes[phraseKey(packId, i)] ?? 0) >= 3).length;
}

export function shareText(progress, packId) {
  const pack = PACKS[packId];
  return `I'm on a ${progress.streak}-day streak learning ${pack.name} hands-free: ${progress.xp} XP, ` +
    `${mastered(progress, packId)}/${pack.phrases.length} phrases mastered. Practise by voice, no screen needed:`;
}
