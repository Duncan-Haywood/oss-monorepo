// Which account does a bank line belong to? Four layers, tried in order, each
// saying how sure it is and why:
//
//  1. rule     your own "keyword => account" rules
//  2. memory   the account you chose last time for the same payee
//  3. learned  a naive Bayes classifier trained on every line you confirmed
//  4. built-in conservative keyword rules for common merchants
//
// A line no layer is sure of goes to the review queue. A language model (ai.mjs,
// on your own key or a model on your own computer) is a fifth, optional layer
// for that queue only; it never posts anything by itself.
//
// Payee strings from banks are messy ("SQ *BLUE BOTTLE 0412 OAKLAND CA",
// "PURCHASE AUTHORIZED ON 03/14 AMZN MKTP US*2K3"), so everything keys on a
// normalised payee. Pure functions, no DOM, no network.

const NOISE = new Set(("pos ach debit credit card purchase checkcard visa mastercard mc dda withdrawal deposit payment pmt pymt web ppd ccd id ref trn txn " +
  "recurring online mobile preauthorized pre auth authorized on from to the inc llc ltd co corp us usa www com net org help bill sq tst pp sp py fs " +
  "al ak az ar ca co ct de fl ga hi ia il in ks ky la ma md me mi mn mo ms mt nc nd ne nh nj nm nv ny oh ok or pa ri sc sd tn tx ut va vt wa wi wv wy").split(" "));

// "SQ *BLUE BOTTLE 0412 OAKLAND CA" -> tokens ["blue","bottle","oakland"], key "blue bottle".
// Tokens with digits are references and store numbers ("1gh4qe", "#0412"),
// dropped whole rather than stripped to a misleading fragment.
export function payeeTokens(desc) {
  const s = String(desc ?? "").toLowerCase().replace(/[’']/g, "").replace(/purchase authorized on \d{1,2}\/\d{1,2}/g, " ");
  return s.split(/[\s,;:#|*_./\\()\[\]-]+/).filter((t) => t && !/\d/.test(t)).map((t) => t.replace(/[^a-z&]+/g, "")).filter((t) => t.length >= 2 && !NOISE.has(t) && !/^x+$/.test(t));
}

export const payeeKey = (desc) => payeeTokens(desc).slice(0, 2).join(" ");
const dir = (cents) => (cents >= 0 ? "in" : "out");
const amountBucket = (cents) => `amt:${Math.min(12, Math.floor(Math.log2(Math.abs(cents) / 100 + 1)))}`;

// Built-in rules on the default chart of accounts. Deliberately conservative: a
// keyword that fits two accounts is left out, so the line goes to review rather
// than being guessed. `dir` limits a rule to money in or money out.
export const BUILT_IN = [
  // PayPal's own transaction types, from its transaction event codes reference (eval/paypal-event-codes.mjs).
  // The importer writes "Name - Type", so these anchor on the type at the end. Written ahead of the
  // transfer rules: "Credit card payment" is a customer paying you, "Bank deposit" is your own money.
  ["4000", "in", /(^| - )(general|website|express checkout|standard web checkout|mobile|virtual terminal|pos|credit card|subscription|donation|business|ebay auction|preapproved) payment$/],
  ["6010", "any", /(^| - )(chargeback|dispute|payment|partner|custody|campaign|bank return) fee$|(^| - )(fee reversal|fee refund)$/],
  ["transfer", "any", /(^| - )((general|manual|user initiated) withdrawal( - bank account)?|auto-?sweep|bank deposit to (pp|paypal) account|(general|user[- ]initiated) currency conversion|conversion to cover negative balance|withdrawal to hyperwallet)$/],
  ["6020", "out", /(^| - )mass payment$/],
  ["4000", "in", /stripe (transfer|payout)|shopify payout|square (payout|transfer)|paypal transfer|etsy (deposit|payout)/],
  ["3100", "out", /owner draw|transfer to personal|to personal|atm withdrawal|cash withdrawal/],
  ["6010", "out", /annual fee|late (payment )?fee|foreign transaction fee|cash advance fee|returned item fee|\batm fee|wire transfer fee|balance transfer fee/],
  ["transfer", "any", /\btransfer\b|\bxfer\b|to savings|from savings|to checking|from checking|online banking transfer/],
  ["transfer", "any", /payment thank you|^autopay|autopay payment|card ?payment|credit card payment|amex epayment|epayment|capital one.*(pmt|payment)|chase card/],
  ["3100", "out", /personal|venmo cashout/],
  ["3010", "in", /owner contribution|capital contribution|owner deposit/],
  ["6010", "out", /stripe fee|paypal fee|square fee|merchant fee|processing fee|service charge|monthly fee|monthly service fee|maintenance fee|wire fee|overdraft|nsf fee|bank fee|account fee|analysis charge|analysis fee/],
  ["4200", "in", /^interest payment|interest paid|interest earned|interest credit|\binterest\b.*(savings|deposit)/],
  ["2100", "out", /sales tax|dept\.? (of )?(tax|revenue|taxation)|department of revenue|comptroller/],
  ["2200", "out", /\bsba loan|loan (pmt|payment)/],
  ["6040", "out", /interest charge|finance charge|purchase interest|loan interest/],
  ["4000", "in", /remote online deposit|mobile deposit|zelle payment from|stripe|square inc|sq dep|shopify|etsy|gumroad|patreon|open ?collective|ko-fi|memberful|invoice|client payment|deposit from customer/],
  ["4000", "in", /(monthly |one[- ]?time |annual )?(contribution|donation|sponsorship) from |^donation\b|\bsponsor(ship)?\b/],
  ["6000", "out", /google ads|facebook|facebk|meta ads|fb ads|instagram ads|linkedin ads|tiktok ads|yelp|mailchimp|constant contact|vistaprint/],
  ["6020", "out", /upwork|fiverr|toptal|gusto contractor|contractor pay|subcontract/],
  ["6020", "out", /\bbount(y|ies)\b/],
  ["6030", "out", /insurance|\bins (billing|premium)|hartford|cigna|anthem|lemonade|prudential|blue cross|united healthcare|hiscox|next insurance|thimble|state farm|geico|liberty mutual|progressive/],
  ["6050", "out", /attorney|law office|cpa\b|accountant|bookkeep|tax prep|legalzoom|registered agent/],
  ["6060", "out", /adobe|microsoft|google ?(workspace|gsuite)|gsuite|dropbox|notion|slack|zoom\.us|zoom video|figma|github|atlassian|jetbrains|1password|openai|openrouter|anthropic|chatgpt|zapier|airtable|squarespace|wix|godaddy|namecheap|cloudflare|aws|amazon web services|digitalocean|heroku|vercel|netlify|quickbooks|xero|intuit|canva|shopify plan|apple\.com\/bill|google cloud|bitbucket|gitlab|fastly|google ?\*? ?cloud|linode|vultr|hetzner|backblaze|rackspace|fly\.io|evernote|cursor|miro|lastpass|microsoft|azure|twilio|datadog|sentry/],
  ["6070", "out", /staples|office depot|officemax|usps|stamps\.com|post office/],
  ["6080", "out", /wework|regus|coworking|office rent|monthly rent|rent payment|paying the rent|storage unit|public storage/],
  ["6100", "out", /home depot|lowes|ace hardware|menards|harbor freight|uline|grainger/],
  ["6110", "out", /business licen[cs]e|secretary of|annual report|franchise tax|permit fee/],
  ["6120", "out", /airline|\btram\b|subway fare|metro transit|transit authority|delta air|united air|american air|southwest|jetblue|marriott|hilton|hyatt|expedia|booking\.com|amtrak|hertz|\bavis\b|enterprise rent|uber\s+\*?\s*trip|uber\s+\*?\s*(?:ride|pool)|lyft|radisson|wyndham|best western|airbnb|priceline|hotwire|car rental|rent a car|\bturo\b|budget rent/],
  ["6130", "out", /restaurant|eating out|cafe|coffee|starbucks|doordash|uber eats|grubhub|chipotle|panera|mcdonald|pizza|bistro|diner|taqueria|sushi|ihop|applebee|jack in the box|\bsonic\b|tim hortons|wingstop|tgi friday|panda express|dunkin|wendy|burger king|\bkfc\b|taco bell|popeyes|domino|chick-fil-a|\bramen\b|dim sum|bakery|\bgrill\b|steakhouse|noodle|\bbbq\b|\bdeli\b|kebab|burrito|wings/],
  ["6140", "out", /verizon|at&t|t-mobile|tmobile|comcast|xfinity|spectrum|cox comm|google fi|mint mobile|electric|pg&e|pgande|pg ?and ?e\b|pacific gas|national grid|duke energy|monkeybrains|sonic\.net|google fiber|webpass|starry|frontier comm|centurylink|\blumen\b|astound|con ?ed|water bill|utility|\bwater\b|\bpower\b(?! (manager|supply|module|adapter|bank|strip|cable|board|tool|button|switch|led))|\benergy\b|ebill|edison|dominion|entergy|eversource|cricket|visible|optimum|us mobile|\bting\b/],
  ["6150", "out", /net pay|payroll(?! tax)|wages/],
  ["6160", "out", /shell oil|chevron|exxon|mobil\b|\bbp\b|sunoco|valero|\barco\b|phillips 66|quiktrip|speedway|casey's|firestone|safelite|gas station|fuel|jiffy lube|car wash|autozone|parking|toll/],
  ["6170", "out", /udemy|coursera|chegg|datacamp|skillshare|linkedin learning|masterclass|pearson|mcgraw|tuition|conference|membership dues|association dues|chamber of commerce/],
  ["6180", "out", /fedex|\bups\b|dhl|pirate ship|shipstation|shippo/],
  // From a US nonprofit's own books (eval/hackclub-ledger.mjs), rules written looking at its train fifth only.
  ["6120", "out", /^uber(\s+(technologies|bv))?$|clipper card|\bsfmta\b|\bmuni\b|\bbart\b/],
  ["6130", "out", /safeway|instacart|trader joe|whole foods|munchery|molly stone/],
  ["6060", "out", /^google$|papertrail|pingdom|fastmail|dnsimple|iwantmyname|cloud9|crunchbase/],
  ["6000", "out", /sticker ?mule/],
  ["6020", "out", /mechanical turk|\bmturk\b/],
  // From Hack Club's public HCB card feed (eval/hcb-memos.mjs): merchants a student-run nonprofit pays, rules written looking at the first 40 organisations only.
  ["6060", "out", /\bzoom\b|porkbun|name-?cheap|neon\.tech|gmass|help ?scout|descript\b|typeform|streamyard|restream|assemblyai|fillout|\bshopify\b|spotify|domain\.com|tryhackme|sentry|supabase|render\.com|planetscale|mongodb|replit|posthog|loom\b|calendly|airtable|webflow|framer|1password|bitwarden|tailscale/],
  ["6000", "out", /\bluma\b|eventbrite|meetup\.com|hootsuite|buffer\.com|printful|sticker ?app/],
  ["6120", "out", /\bhotel\b|\binn\b|\bmotel\b|\bresort\b|airport|clipper|\bubers?\b|\bcab ride|taxi|greyhound|flixbus|megabus|frontier air|spirit air|alaska air|\bhostel/],
  ["6130", "out", /h-e-b|\bheb\b|kroger|publix|aldi\b|taqueria|tacos|in-n-out|99 ranch|\bhmart\b|food ?4 ?less|wawa|7-eleven|sheetz|boba|vending|doughnut|donut|subway\b|jimmy john|five guys|shake shack|raising cane|whataburger|culver|jersey mike|pho\b|thai\b|catering/],
  ["6180", "out", /federal express|usps|shiprocket|\bgo ?shippo|easypost|pitney bowes/],
  ["6070", "out", /wb mason|pitney bowes|postage|\bstaples\b/],
  ["6100", "out", /gobilda|sendcutsend|adafruit|sparkfun|digi-?key|mouser|pololu|robotshop|jlcpcb|pcbway|oshpark|mcmaster|lowe's|harbor freight|tractor supply|dick'?s sporting/],
  // Written after reading Hack Club HCB card memos from organisations on pages 2 and 3 (tuned on that data; README Next).
  ["6100", "out", /revrobotics|andymark|seeed ?studio|digilent|tindie|micro ?center|town & country hardware|hardware (store|supply)/],
  ["6120", "out", /\bmta\b|metrocard|u-haul/],
  ["6130", "out", /\b(breakfast|lunch|dinner|takeout|snacks)\b|\bbagels?\b/],
  // Seen on a real Bank of America card export (Actual Budget's MIT sample files, 28 lines; rules written looking at them, not held out).
  ["6160", "out", /\bcitgo\b|\bcumberland farms\b|\bracetrac\b|\bwawa fuel/],
  ["6140", "out", /county waste|waste management|republic services|\bwaste connections\b/],
];

// Layer 3: multinomial naive Bayes with Laplace smoothing over payee tokens,
// direction and an amount bucket. Trained on every confirmed line.
export function trainClassifier(history) {
  const classes = new Map(); // account -> { n, tokens: Map, total }
  const vocab = new Set();
  for (const h of history) {
    const feats = features(h);
    let c = classes.get(h.account);
    if (!c) classes.set(h.account, (c = { n: 0, tokens: new Map(), total: 0 }));
    c.n++;
    for (const f of feats) { c.tokens.set(f, (c.tokens.get(f) ?? 0) + 1); c.total++; vocab.add(f); }
  }
  return { classes, vocab: vocab.size, n: history.length };
}

function features(h) {
  const toks = h.tokens ?? payeeTokens(h.desc);
  return [...new Set(toks)].concat([`dir:${h.dir ?? dir(h.cents)}`, `${h.dir ?? dir(h.cents)}:${amountBucket(h.cents)}`]);
}

export function classify(model, txn, allowed = null) {
  if (!model || model.n === 0) return [];
  const feats = features({ tokens: payeeTokens(txn.desc), cents: txn.cents });
  const known = feats.filter((f) => [...model.classes.values()].some((c) => c.tokens.has(f)));
  // No payee token was ever seen: the amount and direction alone are not evidence.
  if (!known.some((f) => !f.includes(":"))) return [];
  const scores = [];
  for (const [account, c] of model.classes) {
    if (allowed && !allowed(account)) continue;
    let s = Math.log(c.n / model.n);
    for (const f of known) s += Math.log(((c.tokens.get(f) ?? 0) + 1) / (c.total + model.vocab));
    scores.push([account, s]);
  }
  const max = Math.max(...scores.map((x) => x[1]));
  const z = scores.reduce((a, [, s]) => a + Math.exp(s - max), 0);
  return scores.map(([account, s]) => ({ account, p: Math.exp(s - max) / z })).sort((a, b) => b.p - a.p);
}

// Memory: per payee key and direction, how often each account was chosen.
export function buildMemory(history) {
  const m = new Map();
  for (const h of history) {
    const k = `${h.key ?? payeeKey(h.desc)}|${h.dir ?? dir(h.cents)}`;
    if (!k.startsWith("|")) {
      if (!m.has(k)) m.set(k, new Map());
      m.get(k).set(h.account, (m.get(k).get(h.account) ?? 0) + 1);
    }
  }
  return m;
}

// "keyword => 6060" or "keyword => Software and subscriptions"; /regex/ allowed.
export function parseRules(text, accounts) {
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a.code]));
  const codes = new Set(accounts.map((a) => a.code));
  const rules = [], problems = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(.*?)\s*(?:=>|->|=)\s*(.+)$/);
    if (!m) { problems.push(`Rule line ${i + 1}: write it as "keyword => account".`); continue; }
    const target = m[2].trim();
    const code = codes.has(target) ? target : byName.get(target.toLowerCase()) ?? (/^transfer$/i.test(target) ? "transfer" : null);
    if (!code) { problems.push(`Rule line ${i + 1}: no account "${target}" in the chart of accounts.`); continue; }
    let re;
    const rx = m[1].match(/^\/(.+)\/([a-z]*)$/);
    try { re = rx ? new RegExp(rx[1], rx[2].includes("i") ? rx[2] : rx[2] + "i") : new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
    catch { problems.push(`Rule line ${i + 1}: the pattern is not a valid regular expression.`); continue; }
    rules.push({ re, account: code, text: m[1] });
  }
  return { rules, problems };
}

// -> { account, confidence (0..1), source, reason, alternatives: [{account, p}] }
// `model` is { rules, memory, classifier, codes:Set }. `model.skip` (a Set of
// "rule", "memory", "learned", "built-in") switches layers off, for the ablation
// in eval/ablation.mjs; it is never set in normal use.
// Layer 5: the category label the bank or app itself put on the line. Only labels that
// name one account unambiguously; everything else stays in review. Lower confidence than
// a keyword, because these labels are coarse ("Shopping", "Bills & Utilities" are left out).
export const BANK_CATEGORY = [
  ["6040", /^(fee\/)?interest( charges?)?$|^fee\/interest charge$|^finance charges?$/i],
  ["6010", /^(fees? (&|and) adjustments|bank fees?|service fees?|fees?)$/i],
  ["6130", /^(food (&|and) drink|restaurants?|dining|dining out|coffee shops?|fast food|food & dining)$/i],
  ["6120", /^(travel|other travel|airfare|hotels?|lodging|air travel|public transportation|taxi|rental car)/i],
  ["6160", /^(gas|gasoline|gas\/automotive|gas & fuel|fuel|automotive|auto & transport|parking)$/i],
  ["6140", /^(utilities|bills & utilities|internet|phone|phone\/cable|mobile phone|telephone)$/i],
  ["6030", /^insurance$/i],
  ["6060", /^(software|subscriptions?|software & subscriptions)$/i],
  ["6000", /^(advertising|marketing)$/i],
  ["6050", /^(legal|accounting|professional services)$/i],
  ["6100", /^(home improvement|hardware)$/i],
  ["6170", /^(education|training)$/i],
  ["6070", /^(office supplies|office)$/i],
  ["6180", /^(shipping|postage & shipping)$/i],
  ["6010", /^(fees (&|and) charges|bank fees?|service fees?|atm fees?|late fees?)$/i],
  ["6080", /^(rent|office rent)$/i],
  ["6090", /^(repairs|repairs (&|and) maintenance|home improvement)$/i],
  ["6110", /^(taxes|licenses|taxes (&|and) licenses)$/i],
];
// Money in: only labels that name one income account.
export const BANK_CATEGORY_IN = [
  ["4200", /^(interest|interest income|dividends?)$/i],
  ["4000", /^(sales|business income|self[- ]employment income|revenue)$/i],
];

export function suggest(txn, model) {
  const off = model.skip ?? new Set();
  const text = String(txn.desc ?? "").toLowerCase();
  const d = dir(txn.cents);
  if (!off.has("rule")) for (const r of model.rules ?? []) if (r.re.test(text)) return { account: r.account, confidence: 1, source: "rule", reason: `your rule "${r.text}"`, alternatives: [] };

  const key = payeeKey(txn.desc);
  const mem = key && !off.has("memory") ? model.memory?.get(`${key}|${d}`) : null;
  if (mem) {
    const total = [...mem.values()].reduce((a, v) => a + v, 0);
    const [account, n] = [...mem].sort((a, b) => b[1] - a[1])[0];
    if (model.codes?.has(account) ?? true) {
      // n / (total + 0.5): one past choice gives 0.67, five unanimous give 0.91.
      const confidence = n / (total + 0.5);
      return { account, confidence, source: "memory", reason: total === n ? `"${key}" went to this account ${n === 1 ? "last time" : `all ${n} times before`}` : `"${key}" went here ${n} of ${total} times`, alternatives: [...mem].filter(([a]) => a !== account).map(([a, k]) => ({ account: a, p: k / total })) };
    }
  }

  const ranked = off.has("learned") ? [] : classify(model.classifier, txn, (a) => model.codes?.has(a) ?? true);
  if (ranked.length && ranked[0].p >= 0.5) {
    return { account: ranked[0].account, confidence: Math.min(ranked[0].p, 0.85), source: "learned", reason: `similar to lines you filed here (${Math.round(ranked[0].p * 100)}%)`, alternatives: ranked.slice(1, 3) };
  }

  // Processor and bank wrappers hide the merchant behind words the keyword
  // rules read as something else: "PAYPAL INST XFER NETFLIX" is not a transfer.
  const bi = text.replace(/paypal\s+inst\s+xfer\s*/, "paypal ").replace(/(withdrawal from|subscription payment:|preapproved payment bill user payment:|buyer payment:)\s*/, "");
  for (const [account, rd, re] of off.has("built-in") ? [] : BUILT_IN) {
    if (rd !== "any" && rd !== d) continue;
    if (account !== "transfer" && model.codes && !model.codes.has(account)) continue;
    if (re.test(bi)) return { account, confidence: account === "transfer" ? 0.6 : 0.7, source: "built-in", reason: `built-in keyword "${(bi.match(re) ?? [""])[0].trim()}"`, alternatives: ranked.slice(0, 2) };
  }
  if (txn.bankCat && !off.has("bank-category")) {
    const hit = (d === "out" ? BANK_CATEGORY : BANK_CATEGORY_IN).find(([a, re]) => re.test(txn.bankCat) && (model.codes?.has(a) ?? true));
    if (hit) return { account: hit[0], confidence: 0.55, source: "bank-category", reason: `the bank's own category "${txn.bankCat}"`, alternatives: ranked.slice(0, 2) };
  }
  return { account: null, confidence: 0, source: "none", reason: key ? `nothing known about "${key}" yet` : "the description is empty", alternatives: ranked.slice(0, 3) };
}

export function historyRecord(txn, account) {
  return { key: payeeKey(txn.desc), tokens: payeeTokens(txn.desc), dir: dir(txn.cents), cents: txn.cents, account };
}
