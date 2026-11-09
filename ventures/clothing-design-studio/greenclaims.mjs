/**
 * Green-claims check for clothing product copy.
 *
 * Paste the words from a product page, hangtag or ad; the checker lists
 * phrases that EU consumer law now treats as risky and says what to add or
 * cut. The rules come from Directive (EU) 2024/825 ("empowering consumers
 * for the green transition"), which amends the Unfair Commercial Practices
 * Directive and which member states apply from 27 September 2026. Each
 * country wrote its own version into national law, and a regulator or court
 * decides a case, so a clean result here is not clearance: it only means no
 * listed phrase was found. The word list is short and in English; it will
 * miss claims in other languages and ones phrased in ways not listed.
 * Not legal advice. Read the directive's Annex I (the banned practices)
 * and your national version before you publish.
 *
 * Why this exists: a small brand's copy writer reaches for "eco-friendly"
 * and "carbon neutral" first, and those are the two things the directive
 * most clearly takes away. Honest wording ("made of 100% GOTS-certified
 * organic cotton") is allowed and sells.
 */

/** Each rule: id, label, patterns, severity ("ban" or "proof"), why, and a safer way to write it. */
export const RULES = [
  { id: "generic", label: "Generic environmental claim", severity: "ban",
    re: /\b(eco[- ]?friendly|environment(?:ally)?[- ]friendly|planet[- ]friendly|earth[- ]friendly|nature[- ]friendly|climate[- ]friendly|green(?! (?:dress|shirt|colou?r|jacket|hoodie|tee|t-shirt|pants|sweater|print|ink))|eco(?:logical)?(?:\s+(?:brand|range|collection|line|fabric|clothing|fashion))?|sustainable|biodegradable|planet[- ]positive|earth[- ]positive|conscious(?: collection| fashion| clothing)?|responsible(?: collection| fashion| clothing)?|clean beauty|kind to the (?:planet|earth)|better for the (?:planet|environment))\b/gi,
    why: "A broad word like \"eco-friendly\" or \"sustainable\" is only allowed if you can show recognised excellent environmental performance for exactly that thing (for example an EU Ecolabel). Otherwise the claim must say what is meant, in the same sentence, about a named feature.",
    safer: "Name the feature: \"made from 100% organic cotton (GOTS certified, licence no. ...)\"." },
  { id: "offset", label: "Neutral or compensated by offsets", severity: "ban",
    re: /\b(carbon[- ]neutral|climate[- ]neutral|co2[- ]neutral|co2[- ]compensated|carbon[- ]compensated|carbon[- ]offset(?:ted)?|carbon[- ]negative|climate[- ]positive|carbon[- ]positive|net[- ]zero|zero[- ]emissions?|zero[- ]carbon|reduced co2 footprint through offsets?)\b/gi,
    why: "From 27 September 2026 a claim that a product is neutral, reduced or positive for greenhouse gases because the maker pays for offsets elsewhere is banned. Offsetting may still be said about the company's own funding, never as a property of the garment.",
    safer: "State measured emissions of the product and what you cut yourself, and say separately what you fund: \"We measured 6.1 kg CO2e per shirt (method, year). We also fund project X; this does not change the shirt's footprint.\"" },
  { id: "future", label: "Future environmental promise", severity: "proof",
    re: /\b(?:will be|by 20[2-9]\d|aims? to be|aiming (?:for|to)|on (?:our|the) way to|committed to (?:be|becoming|reach)|goal of)[^.!?\n]{0,60}\b(?:net[- ]zero|carbon|climate|neutral|sustainable|recycled|plastic[- ]free|waste[- ]free|zero[- ]waste|emissions?)\b/gi,
    why: "A promise about future environmental performance needs a detailed, public, measurable plan with targets and dates, checked by an independent expert, and the check must be available to buyers.",
    safer: "Leave it out until you have a written plan and an outside check, or say only what you have already done." },
  { id: "label", label: "Own sustainability label or badge", severity: "ban",
    re: /\b(?:our|the) (?:own )?(?:eco|green|sustainab\w+|planet|earth|conscious)[- ](?:label|badge|seal|score|rating|certified|approved|standard)\b|\b(?:eco|green|sustainab\w+)[- ](?:certified|approved|rated|badge|seal)\b/gi,
    why: "A sustainability label, badge or mark is banned unless it rests on a third-party certification scheme or was set up by a public authority. A badge you design yourself does not qualify.",
    safer: "Show only real certification marks, with the scheme's name and your licence number." },
  { id: "natural", label: "Vague natural or pure wording", severity: "proof",
    re: /\b(?:all[- ]natural|100% natural|natural(?: fibres?| fibers?| materials?)?|pure|chemical[- ]free|toxin[- ]free|non[- ]toxic|clean|kind to skin|hypoallergenic|vegan(?! leather)|cruelty[- ]free|ethical(?:ly (?:made|sourced))?|fair(?:ly)? made|slave[- ]free|conflict[- ]free|guilt[- ]free)\b/gi,
    why: "These words suggest an environmental or ethical benefit without saying what it is. Under the directive's generic-claims rule and the existing misleading-practices rule you need evidence you can hand to a regulator.",
    safer: "Say the fact: \"fibre: 100% cotton\", \"dyed with OEKO-TEX Standard 100 class I dyes\", \"factory audited to amfori BSCI, report dated ...\"." },
  { id: "recycled", label: "Recycled, organic or similar content", severity: "proof",
    re: /\b(?:recycled|upcycled|regenerated|organic|bio[- ]?based|plant[- ]based|ocean[- ]plastic|reclaimed|deadstock|renewable|low[- ]impact|low[- ]carbon|water[- ]saving|zero[- ]waste)\b/gi,
    why: "Allowed, and good for sales, when true and specific. Say how much and of what, and keep the supplier's certificate. \"Recycled\" with no share, or on the whole garment when only the lining is, is the usual fault.",
    safer: "\"Lining: 100% recycled polyester (GRS certified). Shell: virgin cotton.\" Give the share by weight and keep the transaction certificate." },
  { id: "legal", label: "A legal requirement presented as a feature", severity: "proof",
    re: /\b(?:reach[- ]compliant|ce[- ]marked|meets (?:all )?eu (?:law|regulations?|standards?)|complies with (?:all )?(?:eu )?(?:law|regulations?)|free from (?:banned|illegal) (?:chemicals|substances|dyes)|azo[- ]free|lead[- ]free|no (?:banned|illegal) chemicals)\b/gi,
    why: "Presenting something every product on the market must do as if it set you apart is a banned practice. Saying you meet a requirement is fine; saying it as a special quality is not.",
    safer: "Drop it as a selling point, or cite a stricter voluntary standard you hold (for example a named OEKO-TEX class) and what it adds beyond the law." },
  { id: "whole", label: "Whole-product claim that may cover only a part", severity: "proof",
    re: /\b(?:made (?:entirely )?(?:from|with|of) recycled|fully recycled|completely recycled|100% (?:recycled|organic|sustainable|eco)|entirely (?:organic|recycled|sustainable))\b/gi,
    why: "A claim about the whole garment or the whole company is misleading when it is true of only a part (the label, the outer fabric, one range).",
    safer: "Say which part and what share: \"outer fabric 100% organic cotton; trims and thread are not organic\"." },
];

/** Escape for text shown on a page. */
const clean = s => String(s).replace(/\s+/g, " ").trim();

/**
 * @param {string} text product copy
 * @returns {{findings: {rule:string,label:string,severity:string,phrase:string,index:number,line:number,context:string,why:string,safer:string}[],
 *   counts:{ban:number,proof:number}, summary:string}}
 */
export function checkClaims(text) {
  if (typeof text !== "string") throw new Error("Paste the product copy as text.");
  if (text.length > 100000) throw new Error("That is over 100,000 characters; check one page or tag at a time.");
  const findings = [];
  const taken = [];                       // [start,end) spans already reported by an earlier rule
  // Specific rules claim a span before the broad word lists do.
  const order = ["offset", "label", "future", "whole", "legal", "generic", "recycled", "natural"];
  for (const rule of [...RULES].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id))) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      if (m[0].length === 0) { rule.re.lastIndex++; continue; }
      const a = m.index, b = a + m[0].length;
      if (taken.some(([s, e]) => a < e && b > s)) continue;
      taken.push([a, b]);
      findings.push({
        rule: rule.id, label: rule.label, severity: rule.severity, phrase: clean(m[0]), index: a,
        line: text.slice(0, a).split("\n").length,
        context: clean(text.slice(Math.max(0, a - 40), Math.min(text.length, b + 40))),
        why: rule.why, safer: rule.safer,
      });
    }
  }
  findings.sort((x, y) => x.index - y.index);
  const counts = { ban: findings.filter(f => f.severity === "ban").length, proof: findings.filter(f => f.severity === "proof").length };
  const summary = findings.length === 0
    ? "No listed phrase found. That is not clearance: the list is short, English-only and cannot judge whether a true-looking claim is true."
    : `${counts.ban} phrase${counts.ban === 1 ? "" : "s"} the directive bans or treats as banned in this form, ${counts.proof} that need proof you can show.`;
  return { findings, counts, summary };
}

/** CSV of findings for a checklist. */
export function claimsCsv(result) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  return ["line,severity,rule,phrase,context,safer"].concat(
    result.findings.map(f => [f.line, f.severity, f.rule, q(f.phrase), q(f.context), q(f.safer)].join(","))).join("\n") + "\n";
}
