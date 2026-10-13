// EU "green claims" first read for marketing copy under Directive (EU) 2024/825 (Empowering Consumers for the
// Green Transition), which amends the Unfair Commercial Practices Directive and applies from 27 September 2026.
// Pure functions, no I/O. The scan is lexical: it finds wording the Directive targets and says which rule it
// touches and what would make it defensible. It cannot know whether your evidence exists, so every result is a
// question to answer, never a clearance. Rule numbers are the new Annex I points (2a, 4a, 4b, 4c, 10a) and the
// future-performance test in the misleading-actions article; they were written from memory of the published text
// without EUR-Lex access in the building session and must be verified against CELEX 32024L0825 before quoting.
// Bad input is rejected with a message, never clamped.

export const APPLIES_FROM = "2026-09-27";
export const MAX_CHARS = 50000;

// Words are matched case-insensitively with Unicode-aware boundaries, so German, French, Spanish, Italian and
// Dutch copy is scanned as well as English.
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";

export const RULES = [
  {
    id: "offset",
    annex: "4c",
    title: "Climate or carbon neutral claim about a product",
    severity: "high",
    why: "A claim that a product is neutral, reduced or positive for greenhouse-gas emissions because the maker offsets elsewhere is banned outright, whatever the quality of the credits.",
    fix: "Drop the product-level neutral claim. State the actual footprint and the cuts you made yourself; describe offset spending separately as a company contribution, not as the product's impact.",
    terms: [
      "carbon[- ]neutral", "climate[- ]neutral", "co2[- ]neutral", "co₂[- ]neutral", "net[- ]zero", "carbon[- ]negative", "climate[- ]positive",
      "carbon[- ]positive", "carbon[- ]free", "zero[- ]carbon", "emissions[- ]free", "co2[- ]compensated", "carbon[- ]offset\\w*", "offset\\w*",
      "klimaneutral\\p{L}*", "co2[- ]neutral", "klimapositiv\\p{L}*", "co2[- ]kompensiert", "neutre en carbone", "neutre pour le climat", "neutralité carbone",
      "climatiquement neutre", "carbono neutral", "neutro en carbono", "climáticamente neutro", "neutro in carbonio", "climaticamente neutro",
      "klimaatneutraal", "co2[- ]neutraal",
    ],
  },
  {
    id: "generic",
    annex: "4a",
    title: "Generic environmental claim",
    severity: "high",
    why: "Vague words such as \"eco-friendly\" or \"green\" are banned unless you can show recognised excellent environmental performance relevant to the claim (for example an official EU Ecolabel or a national ecolabel scheme). Otherwise the specific reason must sit on the same medium, in clear and prominent terms.",
    fix: "Replace the vague word with the specific, measurable fact, next to the claim: for example \"made from 80% recycled PET (third-party verified)\" instead of \"eco-friendly bottle\".",
    terms: [
      "eco[- ]friendly", "environmentally[- ]friendly", "environment[- ]friendly", "environmentally[- ]correct", "environmentally[- ]safe",
      "eco[- ]conscious", "eco[- ]safe", "eco[- ]responsible", "eco[- ]smart", "eco[- ]product\\w*", "eco[- ]range", "eco[- ]line", "eco[- ]collection",
      "sustainable", "sustainably", "ecological", "climate[- ]friendly", "carbon[- ]friendly", "planet[- ]friendly", "earth[- ]friendly",
      "nature'?s friend", "gentle on the (environment|planet)", "kind to the (planet|environment)", "good for the (planet|environment)",
      "green (product|products|choice|range|line|collection|packaging|alternative|solution|solutions|option|options|living|cleaning|energy|brand|label)",
      "(go|going|goes) green", "100% green", "is green", "are green", "biodegradable", "bio[- ]?based", "energy[- ]efficient", "eco",
      "umweltfreundlich\\p{L}*", "umweltschonend\\p{L}*", "nachhaltig\\p{L}*", "klimafreundlich\\p{L}*", "ökologisch\\p{L}*", "grün", "naturfreundlich\\p{L}*", "ressourcenschonend\\p{L}*",
      "respectueux de l'environnement", "écologique", "éco[- ]responsable", "durable", "écoresponsable", "respectueux du climat", "vert",
      "respetuoso con el medio ambiente", "ecológico", "sostenible", "ecológica", "amigable con el medio ambiente", "respetuoso con el planeta",
      "rispettoso dell'ambiente", "ecologico", "sostenibile", "ecosostenibile", "eco[- ]compatibile", "amico dell'ambiente",
      "milieuvriendelijk\\p{L}*", "duurzaam\\p{L}*", "klimaatvriendelijk\\p{L}*", "groen", "ecologisch\\p{L}*", "planeetvriendelijk\\p{L}*",
    ],
  },
  {
    id: "label",
    annex: "2a",
    title: "Sustainability label or badge",
    severity: "check",
    why: "A sustainability label (a leaf, a seal, an \"eco\" or \"green\" badge) is banned unless it rests on a certification scheme or was set up by a public authority. A badge you designed yourself, or a self-awarded score, does not qualify.",
    fix: "Show only labels from an independent certification scheme (name the scheme and the licence number where you can) or an official public label. Remove or rename in-house badges.",
    terms: [
      "eco[- ]?label\\w*", "eco[- ]badge\\w*", "green[- ]badge\\w*", "green[- ]seal\\w*", "green[- ]label\\w*", "sustainability[- ](label|badge|seal|score|rating|mark)\\w*",
      "eco[- ](seal|mark|logo|score|rating|certified)", "planet[- ](label|badge|seal|score)", "earth[- ](label|badge|seal|score)", "climate[- ](label|badge|seal|score)",
      "certified (sustainable|green|eco)", "sustainability[- ]certified", "umweltsiegel", "nachhaltigkeitssiegel", "öko[- ]?label", "label écologique",
      "étiquette environnementale", "sello ecológico", "etiqueta ecológica", "etichetta ecologica", "marchio ecologico", "milieulabel", "duurzaamheidslabel",
    ],
  },
  {
    id: "future",
    annex: "misleading action",
    title: "Claim about future environmental performance",
    severity: "check",
    why: "A claim about a future target (\"net zero by 2030\", \"we will be plastic free\") counts as misleading unless it rests on a detailed, realistic implementation plan with measurable, time-bound targets, verified regularly by an independent third-party expert whose findings are available to consumers.",
    fix: "Publish the plan, the interim targets, the expert's name and the findings, or rephrase to what is true today. If you cannot show the plan, remove the claim.",
    terms: [
      "(net[- ]zero|carbon[- ]neutral|climate[- ]neutral|plastic[- ]free|waste[- ]free|emissions[- ]free|zero[- ]waste|zero[- ]emissions?|100% recycled|100% renewable) (by|in) (19|20)\\d\\d",
      "by (19|20)\\d\\d,? (we|our)[^.]{0,60}(net[- ]zero|neutral|plastic|zero|renewable|recycl)",
      "we (will|aim to|plan to|commit to|are committed to|are working (toward|towards) )[^.]{0,40}(be|become|reach|achieve|go|eliminate|reduce|cut|offset)",
      "(our|the) (goal|ambition|target|pledge|commitment) is[^.]{0,60}(zero|neutral|green|sustainable|recycl|renewable|emissions)",
      "road to (net[- ]zero|zero|neutral)", "on (our|the) way to (net[- ]zero|zero|neutral|sustainab)",
      "(werden|wollen|streben)[^.]{0,40}(klimaneutral|nachhaltig|emissionsfrei|plastikfrei)", "d'ici (19|20)\\d\\d[^.]{0,60}(neutre|zéro|durable)",
      "para (19|20)\\d\\d[^.]{0,60}(neutral|cero|sostenible)", "entro il (19|20)\\d\\d[^.]{0,60}(neutr|zero|sostenibil)", "tegen (19|20)\\d\\d[^.]{0,60}(neutraal|nul|duurzaam)",
    ],
  },
  {
    id: "wholepart",
    annex: "4b",
    title: "Whole-product or whole-business claim that may cover only part",
    severity: "check",
    why: "A claim that a whole product or the whole business has an environmental quality is banned when it is true only of one part (a recycled box around a non-recycled product, one factory out of five).",
    fix: "Say which part: \"the box is made from 90% recycled board\", \"our Leeds site runs on renewable electricity\". Keep the qualifier next to the claim.",
    terms: [
      "(recyclable|recycled|compostable|biodegradable|plastic[- ]free|recyclé|recyclable|reciclable|riciclabile|recyclebaar|recycelbar|wiederverwertbar)(?! (box|bag|packaging|pack|label|bottle|cap|lid|sleeve|wrapper|film|carton|content|material|board|paper|cardboard|tray|shell|cover|case|insert|part|component|layer|fibre|fiber|pulp|tube|jar|can|pouch|lining|handle|strap|tag|ink|glue|adhesive|cork))",
      "(our|the|all) (products?|range|business|company|brand|operations|collection|supply chain) (is|are|use|uses|runs?) (on )?(recycled|renewable|sustainab|eco|green|100%)",
      "100% (recycled|renewable|sustainable|natural|eco|green|plastic[- ]free)", "all (our|of our) [a-z ]{0,30}(sustainab|eco|green|recycl|renewable)",
      "(fully|completely|totally|entirely) (recyclable|recycled|compostable|biodegradable|sustainable|green|eco)",
      "(vollständig|komplett|zu 100 ?%) (recycelbar|recycelt|nachhaltig|kompostierbar)",
    ],
  },
  {
    id: "legal",
    annex: "10a",
    title: "Legal requirement shown as a distinctive feature",
    severity: "check",
    why: "Presenting something EU law already requires of every product in the category as if it were a special feature of yours is banned (for example \"CFC-free\" where CFCs are prohibited, or \"complies with EU standards\" as a selling point).",
    fix: "Delete the claim, or say what you do beyond the legal minimum and by how much (\"uses 30% less energy than the legal limit for its class\").",
    terms: [
      "cfc[- ]free", "lead[- ]free (solder|paint|petrol|gasoline)", "asbestos[- ]free", "ozone[- ](friendly|safe)", "ozone[- ]layer[- ]friendly", "ddt[- ]free",
      "complies with (all )?(eu|european) (law|laws|regulations?|standards?|requirements?|directives?)", "(eu|european)[- ](compliant|approved|regulation[- ]compliant)",
      "reach[- ]compliant", "rohs[- ]compliant", "ce[- ]marked as (safe|green)", "meets (all )?(legal|eu) (requirements|standards)",
      "frei von fckw", "ohne fckw", "sans cfc", "sin cfc", "senza cfc", "conforme aux normes européennes", "entspricht (allen )?eu[- ]vorschriften",
    ],
  },
];

// A specification near a generic term does not make the claim lawful, but it is what the Directive's
// definition of "generic" turns on: the reason must be on the same medium, clear and prominent.
const SPEC = new RegExp(
  "(\\d+([.,]\\d+)?\\s?%|\\d+([.,]\\d+)?\\s?(kg|g|tonnes?|t|co2e?|co₂e?)|made (from|with|of|using)|contains?|certified|certification|iso\\s?\\d+|ecolabel|ecovadis|fsc|pefc|cradle to cradle|because|thanks to|reduced? by|aus |hergestellt|fabriqué|hecho|prodotto|gemaakt|weil|parce que|porque|perché|omdat)",
  "iu",
);
const NEAR = 90;

const COMPILED = RULES.map((rule) => ({
  rule,
  re: new RegExp(`${B}(?:${[...new Set(rule.terms)].join("|")})${E}`, "giu"),
}));

export const SAMPLE = {
  text: "Our eco-friendly bottle is 100% recyclable and carbon neutral. Sustainable by design, it carries our Green Seal badge. We will be net zero by 2030. CFC-free and compliant with all EU regulations. Made from 40% recycled PET (RecyClass certified).",
  today: "2026-10-13",
};

function toDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

export function daysSince(from, today) {
  return Math.round((toDate(today) - toDate(from)) / 86400000);
}

function sentenceAround(text, start, end) {
  let a = start;
  while (a > 0 && !/[.!?\n]/.test(text[a - 1])) a--;
  let b = end;
  while (b < text.length && !/[.!?\n]/.test(text[b])) b++;
  return text.slice(a, Math.min(b + 1, text.length)).trim();
}

export function scan(text, today) {
  const t = toDate(today);
  if (!t) return { errors: ["Reference date must be a real date in YYYY-MM-DD form."] };
  if (typeof text !== "string" || !text.trim()) return { errors: ["Paste the marketing copy to scan (a product page, ad, packaging text or label text)."] };
  if (text.length > MAX_CHARS) return { errors: [`The text is ${text.length} characters; the limit is ${MAX_CHARS}. Scan a page at a time.`] };

  const found = [];
  for (const { rule, re } of COMPILED) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      const window = text.slice(Math.max(0, start - NEAR), Math.min(text.length, end + NEAR));
      const spec = rule.id === "generic" && SPEC.test(window);
      found.push({
        rule: rule.id,
        annex: rule.annex,
        title: rule.title,
        severity: spec ? "check" : rule.severity,
        matched: m[0],
        start,
        end,
        sentence: sentenceAround(text, start, end),
        specificationNearby: spec,
      });
    }
  }
  // A phrase caught by a stricter rule is not reported again as a looser one over the same characters.
  const rank = { offset: 0, future: 1, label: 2, legal: 3, generic: 4, wholepart: 5 };
  found.sort((a, b) => a.start - b.start || rank[a.rule] - rank[b.rule]);
  const findings = [];
  for (const f of found) {
    if (findings.some((g) => f.start < g.end && g.start < f.end)) continue;
    findings.push(f);
  }
  const byRule = Object.fromEntries(RULES.map((r) => [r.id, findings.filter((f) => f.rule === r.id).length]));
  const high = findings.filter((f) => f.severity === "high").length;
  const check = findings.length - high;
  const inForce = daysSince(APPLIES_FROM, today) >= 0;
  return {
    today,
    inForce,
    daysSinceApplication: daysSince(APPLIES_FROM, today),
    chars: text.length,
    findings,
    byRule,
    counts: { high, check, total: findings.length },
    verdict: high ? "fix" : check ? "review" : "none",
  };
}

export const VERDICTS = {
  fix: "Wording the Directive bans on its face. Fix before publishing.",
  review: "No outright-banned wording found; each flagged phrase needs evidence or a qualifier.",
  none: "No flagged wording. This is a keyword scan, not clearance: images, logos and claims in other languages are not read.",
};

export function ruleById(id) {
  return RULES.find((r) => r.id === id);
}

export function summaryText(r) {
  const lines = [
    "EU green claims scan (Directive (EU) 2024/825)",
    `Reference date: ${r.today} — ${r.inForce ? `in application for ${r.daysSinceApplication} days (since ${APPLIES_FROM})` : `applies from ${APPLIES_FROM} (in ${-r.daysSinceApplication} days)`}`,
    `Scanned ${r.chars} characters. Banned-on-its-face: ${r.counts.high}. Needs evidence or a qualifier: ${r.counts.check}.`,
    VERDICTS[r.verdict],
    "",
  ];
  for (const f of r.findings) {
    const rule = ruleById(f.rule);
    lines.push(`[${f.severity.toUpperCase()}] "${f.matched}" — ${f.title} (Annex I ${f.annex})`);
    lines.push(`  In: ${f.sentence}`);
    if (f.specificationNearby) lines.push("  A specification appears nearby; it must be clear, prominent and on the same medium.");
    lines.push(`  Why: ${rule.why}`);
    lines.push(`  Fix: ${rule.fix}`);
    lines.push("");
  }
  lines.push("Keyword scan only; not legal advice. Check the text of Directive (EU) 2024/825, your national transposition and the Commission guidance.");
  return lines.join("\n");
}

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
export function findingsCsv(r) {
  const rows = [["severity", "phrase", "rule", "annex_i_point", "sentence", "fix"]];
  for (const f of r.findings) rows.push([f.severity, f.matched, f.title, f.annex, f.sentence, ruleById(f.rule).fix]);
  return rows.map((row) => row.map(q).join(",")).join("\n");
}

// Marks each finding in the original text; returns safe HTML segments for the page to render.
export function highlight(text, findings) {
  const out = [];
  let at = 0;
  for (const f of findings) {
    if (f.start < at) continue;
    out.push({ text: text.slice(at, f.start) });
    out.push({ text: text.slice(f.start, f.end), severity: f.severity, rule: f.rule });
    at = f.end;
  }
  out.push({ text: text.slice(at) });
  return out;
}
