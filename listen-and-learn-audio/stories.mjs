// Graded bilingual stories and the playlist builder that turns one into a
// sequence of spoken lines. No DOM, no network: index.html reads the
// playlist aloud with the browser's speech synthesis.

export const LANGS = {
  es: { name: "Spanish", voiceLang: "es-ES" },
  fr: { name: "French", voiceLang: "fr-FR" },
  de: { name: "German", voiceLang: "de-DE" },
  it: { name: "Italian", voiceLang: "it-IT" },
};

export const STORIES = [
  {
    id: "es-cafe", lang: "es", level: "A1", title: "El café de la esquina", titleEn: "The café on the corner",
    lines: [
      ["Me llamo Lucía y vivo en Madrid.", "My name is Lucía and I live in Madrid."],
      ["Todas las mañanas voy al café de la esquina.", "Every morning I go to the café on the corner."],
      ["El camarero se llama Tomás.", "The waiter's name is Tomás."],
      ["Siempre me pregunta: «¿Lo de siempre?»", "He always asks me: \"The usual?\""],
      ["Y yo siempre digo: «Sí, un café con leche, por favor.»", "And I always say: \"Yes, a coffee with milk, please.\""],
      ["Pero hoy quiero algo diferente.", "But today I want something different."],
      ["«Hoy no, Tomás. Hoy quiero un chocolate caliente.»", "\"Not today, Tomás. Today I want a hot chocolate.\""],
      ["Tomás me mira con sorpresa.", "Tomás looks at me in surprise."],
      ["Luego sonríe y dice: «¡Por fin!»", "Then he smiles and says: \"Finally!\""],
    ],
  },
  {
    id: "es-tren", lang: "es", level: "A2", title: "El tren equivocado", titleEn: "The wrong train",
    lines: [
      ["El sábado pasado quería visitar a mi abuela en Toledo.", "Last Saturday I wanted to visit my grandmother in Toledo."],
      ["Llegué a la estación con diez minutos de sobra.", "I got to the station with ten minutes to spare."],
      ["Compré un billete, subí al tren y me dormí enseguida.", "I bought a ticket, got on the train and fell asleep straight away."],
      ["Cuando me desperté, el paisaje era muy extraño: había montañas y nieve.", "When I woke up, the landscape was very strange: there were mountains and snow."],
      ["Le pregunté a una señora: «Perdone, ¿falta mucho para Toledo?»", "I asked a lady: \"Excuse me, is it much further to Toledo?\""],
      ["Ella se rió. «¿Toledo? Este tren va a Segovia.»", "She laughed. \"Toledo? This train goes to Segovia.\""],
      ["Llamé a mi abuela para contarle lo que había pasado.", "I called my grandmother to tell her what had happened."],
      ["«No te preocupes», me dijo. «Tráeme un ponche segoviano y estamos en paz.»", "\"Don't worry,\" she said. \"Bring me a Segovian ponche cake and we're even.\""],
    ],
  },
  {
    id: "fr-chat", lang: "fr", level: "A1", title: "Le chat de Madame Martin", titleEn: "Madame Martin's cat",
    lines: [
      ["Madame Martin habite au troisième étage.", "Madame Martin lives on the third floor."],
      ["Elle a un gros chat roux qui s'appelle Biscuit.", "She has a big ginger cat called Biscuit."],
      ["Chaque soir, Biscuit disparaît.", "Every evening, Biscuit disappears."],
      ["Madame Martin le cherche partout : sous le lit, dans la cuisine, sur le balcon.", "Madame Martin looks for him everywhere: under the bed, in the kitchen, on the balcony."],
      ["Un jour, elle frappe à la porte de son voisin.", "One day, she knocks on her neighbour's door."],
      ["Le voisin ouvre la porte avec un sourire.", "The neighbour opens the door with a smile."],
      ["Biscuit est sur son canapé, et il mange du poisson !", "Biscuit is on his sofa, eating fish!"],
      ["« Il vient ici tous les soirs », dit le voisin. « Vous voulez dîner avec nous ? »", "\"He comes here every evening,\" says the neighbour. \"Would you like to have dinner with us?\""],
    ],
  },
  {
    id: "de-berlin", lang: "de", level: "A1", title: "Ein Samstag in Berlin", titleEn: "A Saturday in Berlin",
    lines: [
      ["Heute ist Samstag und Jonas hat frei.", "Today is Saturday and Jonas has the day off."],
      ["Er frühstückt um neun Uhr: Brötchen, Käse und Kaffee.", "He has breakfast at nine o'clock: bread rolls, cheese and coffee."],
      ["Dann fährt er mit dem Fahrrad in den Park.", "Then he rides his bike to the park."],
      ["Im Park trifft er seine Freundin Mia.", "In the park he meets his friend Mia."],
      ["Sie spielen Tischtennis, aber Mia gewinnt immer.", "They play table tennis, but Mia always wins."],
      ["Am Nachmittag essen sie ein Eis am Kanal.", "In the afternoon they eat ice cream by the canal."],
      ["„Nächsten Samstag gewinne ich“, sagt Jonas.", "\"Next Saturday I'll win,\" says Jonas."],
      ["Mia lacht: „Das sagst du jede Woche!“", "Mia laughs: \"You say that every week!\""],
    ],
  },
  {
    id: "it-nonna", lang: "it", level: "A1", title: "La pizza della nonna", titleEn: "Grandma's pizza",
    lines: [
      ["Ogni domenica andiamo a pranzo dalla nonna.", "Every Sunday we go to Grandma's for lunch."],
      ["La nonna fa la pizza più buona del mondo.", "Grandma makes the best pizza in the world."],
      ["Prepara l'impasto la mattina presto.", "She makes the dough early in the morning."],
      ["Io la aiuto con il pomodoro e la mozzarella.", "I help her with the tomato and the mozzarella."],
      ["Mio fratello, invece, mangia le olive di nascosto.", "My brother, on the other hand, sneaks the olives."],
      ["Quando la pizza esce dal forno, tutti stanno zitti.", "When the pizza comes out of the oven, everyone goes quiet."],
      ["«Allora, com'è?» chiede la nonna.", "\"So, how is it?\" asks Grandma."],
      ["«Perfetta, come sempre!» rispondiamo insieme.", "\"Perfect, as always!\" we answer together."],
    ],
  },
];

export const MODES = {
  "tl-en": "Target language, then English",
  "en-tl": "English, then target language",
  tl: "Target language only",
};

// Pause after a line, long enough to replay it in your head (or shadow it
// aloud), scaled by length so long sentences get more room.
export function pauseAfter(text, base = 700) {
  return base + Math.min(String(text).length, 120) * 25;
}

export function playlist(story, mode = "tl-en", { shadow = false } = {}) {
  if (!MODES[mode]) throw new Error(`Unknown mode: ${mode}`);
  const tlLang = LANGS[story.lang].voiceLang;
  const items = [
    { text: story.title, lang: tlLang, pauseMs: 400 },
    { text: story.titleEn, lang: "en-US", pauseMs: 900 },
  ];
  for (const [tl, en] of story.lines) {
    const target = { text: tl, lang: tlLang, pauseMs: shadow ? pauseAfter(tl, 1200) : pauseAfter(tl) };
    const english = { text: en, lang: "en-US", pauseMs: 600 };
    if (mode === "tl-en") items.push(target, english);
    else if (mode === "en-tl") items.push(english, target);
    else items.push(target);
  }
  return items;
}

export function storiesFor(lang) {
  return STORIES.filter((s) => s.lang === lang);
}
