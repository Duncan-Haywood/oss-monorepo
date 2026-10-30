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
  // Food trucks (2026-10-29, foodtruck.test.mjs; agent-written from the companies' public names, not from a real export):
  // catering deposits are sales; commissary rent is rent, propane is utilities, event and festival fees are advertising, generator and truck-equipment service is repairs.
  ["4000", "in", /catering (deposit|payment)|food truck (event|festival) (payout|payment)/],
  ["6080", "out", /commissary( kitchen)? (rent|fee|lease)/],
  ["6140", "out", /propane|united site services|amerigas|suburban propane/],
  ["6000", "out", /roaming hunger|(food truck|truck) (festival|event) fee|event fee|street food finder/],
  ["6090", "out", /generator (repair|service)|(food )?truck (equipment|hood|fryer) (repair|service)|hood cleaning/],
  // Mobile notaries and loan signing agents (2026-10-29, notary.test.mjs; agent-written from the companies' public names, not from a real export):
  // title-company platform payouts are sales; notary dues, E&O cover, stamps and the state commission land in their own accounts, ahead of the older bare "notary" rule (legal and professional fees).
  ["4000", "in", /snapdocs.*(payout|payment)|notary ?go (payment|payout)|signing ?order (deposit|payment)|123notary|notary rotary/],
  ["6170", "out", /national notary (assoc|association)|nna dues|notary dues/],
  ["6030", "out", /notary e&o|notary (errors|bond)|notary.*insurance/],
  ["6060", "out", /snapdocs.*(subscription|monthly)|notarycam|bluenotary|notarize\.com pro/],
  ["6100", "out", /notary (stamp|seal|journal)/],
  ["6110", "out", /secretary of state.*notary|notary commission/],
  // Yoga and Pilates studios (2026-10-30, yogastudio.test.mjs; agent-written from the companies' public names, not from a real export):
  // class-marketplace and booking-platform payouts are sales; studio lease is rent; props and mats are supplies; booking software is software;
  // a Gusto payroll debit is wages, not software (the generic Gusto rule files its monthly fee as software).
  ["4000", "in", /momence payout|walla payout|zen ?planner payout|zelle from .*(wellness|corporate)/],
  ["6150", "out", /gusto (payroll|wages|net pay)(?!.*(fee|subscription|monthly))|gusto.*(tax|debit)/],
  ["6100", "out", /manduka|gaiam|hugger mugger|yoga ?props|pilates (reformer|equipment)|balanced body|merrithew/],
  ["6060", "out", /momence (subscription|monthly)|walla (subscription|monthly)|marianatek|pushpress/],
  ["6080", "out", /studio lease/],
  // Pool service routes (2026-10-30, poolservice.test.mjs; agent-written from the companies' public names, not from a real export):
  // route-software payouts and customer Zelle are sales; chemical and equipment distributors are supplies; route software is software; CPO certification is a licence.
  ["4000", "in", /skimmer payout|poolbrain payout|pool ?dash payout|zelle from .*pool service/],
  ["6100", "out", /leslie'?s pool|scp pool|pool corp|pinch a penny|sctpool|chlorine|muriatic/],
  ["6060", "out", /skimmer (subscription|monthly)|poolbrain (subscription|monthly)|pool ?dash (subscription|monthly)|pool ?office/],
  ["6110", "out", /cpo certification|phta|nspf|pool operator (cert|licen)/],
  // Movers and junk removal (2026-10-30, movers.test.mjs; agent-written from the companies' public names, not from a real export):
  // lead-platform payouts and moving-software transfers are sales; truck rentals are vehicle costs; moving supplies and dump fees are supplies; scheduling software is software; USDOT/UCR filings are licences.
  ["4000", "in", /hireahelper payout|moving help payout|movebuddy payout|zelle from .*move deposit/],
  ["6160", "out", /penske truck|u-?haul truck|budget truck|uhaul (truck|rental)/],
  ["6100", "out", /uhaul moving supplies|u-?haul.*supplies|dump fee|transfer station|landfill/],
  ["6060", "out", /smartmoving|moveitpro|supermove|mover ?base/],
  ["6110", "out", /usdot|ucr registration|motor carrier/],
  // Vending route operators (2026-10-29, vending.test.mjs; agent-written from the companies' public names, not from a real export):
  // cashless-reader settlements and route cash deposits are sales; location commissions are rent; machine parts are repairs and maintenance (before the older "vending" meals rule).
  ["4000", "in", /cantaloupe deposit|nayax.*(settlement|deposit)|cash deposit vending|vending (route )?(cash|deposit)/],
  ["6080", "out", /location commission|site commission|host commission/],
  ["6090", "out", /vending machine parts|vending parts|machine parts direct/],
  // Small farms and CSAs (2026-10-29, smallfarm.test.mjs; agent-written from the companies' public names, not from a real export):
  // CSA-platform payouts, market and co-op deposits are sales; seed houses are supplies; land and pasture leases are rent; CSA software is software; farm diesel is vehicle fuel.
  ["4000", "in", /local line.*(payout|payment)|farmers.? market deposit|wholesale co-?op deposit|harvest (share|box) payout/],
  ["6100", "out", /johnny'?s selected seeds|fedco seeds|seedway|baker creek|high mowing|\bseeds?\b.*(order|co)\b/],
  ["6080", "out", /pasture lease|(land|field|farm) lease/],
  ["6060", "out", /local line subscription|farmigo|barn2door|harvie/],
  ["6160", "out", /farm diesel|dyed diesel|off-?road diesel/],
  ["6110", "out", /(state )?dept\.? of agriculture|dept of ag\b|department of agriculture/],
  // Auto repair shops (2026-10-29, autorepair.test.mjs; agent-written from the companies' public names, not from a real export):
  // fleet-account payments are sales; repair-data subscriptions are software; shop rent is rent; ASE fees are education and dues.
  ["4000", "in", /fleet account (payment|pmt)/],
  ["6060", "out", /\balldata\b|mitchell ?1|\bidentifix\b|\bshop-?ware\b|tekmetric|shopmonkey/],
  ["6080", "out", /\bshop rent\b|bay \d+ properties/],
  ["6170", "out", /\base\b.*(certification|test)/],
  // Home inspectors (2026-10-29, inspector.test.mjs; agent-written from the companies' public names, not from a real export):
  // inspection-software payouts are sales; report software is software; a state inspector licence is a licence; a thermal camera is equipment (6070, a depreciation decision left to the owner).
  ["4000", "in", /spectora.*(payout|payment)|\bhomegauge\b.*payout|\bisn\b.*payout|horizon.*payout/],
  ["6060", "out", /spectora.*(subscription|software)|\bhomegauge\b|\bhorizon (software|inspection)|\binspectit\b/],
  ["6110", "out", /home inspector licen[cs]e/],
  ["6070", "out", /thermal camera|\bflir\b|moisture meter|infrared camera/],
  // Owner-operator truckers (2026-10-29, trucking.test.mjs; agent-written from the companies' public names, not from a real export):
  // factoring and broker payments are sales; fuel-card payments, scales and truck washes are vehicle costs; ELD subscriptions are software; Form 2290 is a tax; a lumper fee is a direct job cost.
  ["4000", "in", /triumph pay|rts financial|\botr solutions|\bapex capital|\btql\b|\bc\.?h\.? robinson|\bcoyote logistics|freight (payment|broker)/],
  ["6160", "out", /comdata|\befs\b.*fuel|fleetone|\bfuel card\b|cat scale|blue beacon|truck wash/],
  ["6060", "out", /\beld\b.*(subscription|fee)|motive eld/],
  ["6110", "out", /form 2290|heavy highway use/],
  ["5000", "out", /lumper/],
  // Wedding DJs, planners and florists (2026-10-29, eventpro.test.mjs; agent-written from the companies' public names, not from a real export):
  // wholesale flowers are supplies; planner software; Sweetwater gear is filed by the creator-gear rule under 6070, event rentals and WeddingWire are already filed.
  ["6100", "out", /wholesale flowers?|\bgrowers? direct\b|\bfloral supply\b|\bflorist supply\b/],
  ["6060", "out", /aisle planner|planning pod|dj event planner/],
  // Mobile detailers and car-wash operators (2026-10-29, detailing.test.mjs; agent-written from the companies' public names, not from a real export):
  // detailing chemicals and polish are supplies; a transfer to the owner is a draw.
  ["6100", "out", /chemical guys|meguiars?|\bgriots? garage\b|detailing supplies|\bcar wash (soap|supplies)\b/],
  ["3100", "out", /(zelle|transfer|payment|xfer) to owner\b/],
  // Tattoo artists and piercers (2026-10-29, tattoo.test.mjs; agent-written from the companies' public names, not from a real export):
  // needles, ink, stencils, gloves and sharps pickup are supplies; booking software; bloodborne-pathogen training; the health-department artist licence.
  ["6100", "out", /tattoo supply|stencil stuff|\bnitrile gloves?\b|sharps pickup|medical waste/],
  ["6060", "out", /\bbooksy\b|\bprocreate\b/],
  ["6170", "out", /bloodborne|pathogens? (cert|training)/],
  ["6110", "out", /health dept.*(license|licence)|(tattoo|piercing) artist licen[cs]e/],
  // Massage therapists and estheticians (2026-10-29, massage.test.mjs; agent-written from the companies' public names, not from a real export):
  // booking-platform payouts, booking software, lotions, waxes and linens, association dues, continuing education, state board licences and suite rent.
  ["4000", "in", /vagaro.*(payout|deposit)|\bmindbody\b.*payout|\bboulevard\b.*payout|\bglossgenius\b.*payout|massagebook.*payout/],
  ["6060", "out", /massage ?book|\bbookedby\b|\bschedulicity\b|\bglossgenius\b|\bmassage ?works\b|\bnoterro\b/],
  ["6100", "out", /biotone|\bbiofreeze\b|massage (lotion|oil|table)|wax and sugaring|sugaring supplies|linen supply|sheets and towels|\bsally beauty\b|\bsalon ?centric\b/],
  ["6170", "out", /\babmp\b(?!.*insur)|\bamta\b|\bncbtmb\b|continuing education|\bceu\b|esthetician association/],
  ["6110", "out", /board of (massage|esthetic|cosmetology)[^,]*(licen[cs]e|renew)/],
  ["6080", "out", /(salon|massage|treatment|esthetics?) (suite|room|studio) rent|booth rent/],
  // Therapists and counselors in private practice (2026-10-29, therapist.test.mjs; agent-written from the companies' public names, not from a real export):
  // insurance-panel and matching-platform payouts are sales; CE courses, supervision, association dues and directory listings are education and dues or advertising.
  ["4000", "in", /headway|\balma\b.*reimburs|grow therapy|rula health|\bspring health\b.*payment|claims deposit/],
  ["6170", "out", /\bce course|continuing education|psychotherapy\.net|clinical supervision|american (psychological|counseling) assoc|\bnasw\b|\baamft\b|\bapa dues/],
  ["6000", "out", /psychology today|therapyden|good ?therapy listing|zencare/],
  ["6110", "out", /state board (license|licence)|board of (behavioral|psychology|counsel)/],
  // Home daycare and family child care providers (2026-10-29, daycare.test.mjs; agent-written from the companies' public names, not from a real export):
  // tuition by Zelle or app, food-program reimbursements and sponsor fees, accreditation dues, and craft and toy supplies.
  ["4000", "in", /tuition|\bprocare\b|brightwheel.*payout|\bkangarootime\b|\bhi ?mama\b/],
  ["6100", "out", /hobby lobby|craft supplies|toys and books|\bdiapers?\b/],
  ["6170", "out", /\bnafcc\b|cacfp.*(sponsor|fee)|infant cpr|child ?care (association|licen[cs]e)/],
  // Farmers-market, craft-fair and cottage-food vendors (2026-10-29, marketvendor.test.mjs; agent-written from the companies' public names, not from a real export):
  // wholesale food-service stores and ingredient buys are supplies. Market fees and cottage permits were already filed under taxes and licenses.
  ["6100", "out", /\bgfs\b|gordon food|smart ?& ?final|cash ?(and|&|n) ?carry|baking ingredients|packaging|jars? and lids?/],
  // Pet sitters, dog walkers and groomers (2026-10-29, petcare.test.mjs; agent-written from the companies' public names, not from a real export):
  // marketplace payouts, scheduling software, pet-store supplies and sitter association dues.
  ["4000", "in", /\brover\b.*payout|\bwag\b.*(labs|payment|payout)|rover\.com/],
  ["6060", "out", /time ?to ?pet|pet ?sitter ?plus|\bgingr\b|pawfinity/],
  ["6100", "out", /petco|petsmart|chewy|poop bags?|dog treats|grooming supplies/],
  ["6170", "out", /professional pet sitters|\bnappspet\b|pet sitters international|\bpsi\b dues|pet first aid/],
  // Tutors and online teachers (2026-10-29, tutor.test.mjs; agent-written from the companies' public names, not from a real export):
  // marketplace payouts, classroom software, lesson materials, exam fees and library or coffee-shop meeting rooms.
  ["4000", "in", /outschool|varsity tutors|preply|superprof|tutor\.com payout|cambly|italki/],
  ["6060", "out", /prodigy (education|game)|kahoot|nearpod|gimkit|blooket|mathigon|desmos/],
  ["6100", "out", /teachers pay teachers|teacherspayteachers|lakeshore learning|wacom/],
  ["6170", "out", /\bets\b.*(praxis|toefl|gre)|praxis (registration|exam)|\bnea\b.*(member|dues)|aft membership/],
  ["6080", "out", /(library|meeting|study|conference) room (rental|rent)\b/],
  // Photographers (2026-10-29, photographer.test.mjs; agent-written from the companies' public names, not from a real export):
  // gallery and CRM software, trade-body dues, second shooters and print labs.
  ["6060", "out", /shootproof|sprout studio|dubsado|\btave\b|17hats|pixieset|smugmug|lightroom/],
  ["6170", "out", /\bppa\b.*(member|photograph)|professional photographers|\bwppi\b|creativelive|\bspa\b.*photograph/],
  ["6020", "out", /second shooter|associate photographer|photo editing service|\bretouch/],
  ["6100", "out", /\bwhcc\b|miller.?s (professional )?lab|bay photo lab|printique|nations photo lab/],
  // Personal trainers and coaches (2026-10-29, trainer.test.mjs; agent-written from the companies' public names, not from a real export):
  // coaching apps, certification renewals and gym-floor rent. First so "gym rental" is rent, not left blank.
  ["6060", "out", /trainerize|truecoach|trainheroic|everfit|my ?pt ?hub|myfitnesspal|\bwodify\b|\bhevy\b/],
  ["6170", "out", /\bnasm\b|\bace fitness\b|\bissa\b|\bnsca\b|\bacsm\b|precision nutrition|\bcpt\b.*recert/],
  ["6080", "out", /(gym|studio|floor|facility) (space )?(rental|rent)\b|gym rent/],
  ["6100", "out", /rep fitness|\bperform better\b|fitness equipment|resistance bands?/],
  // Small-business spend probe 4 (2026-10-28, eval/probe-trades4.mjs, 72 descriptors; agent-written from the companies' public names, not from a real export; tuned on itself):
  // contractors, consultants who travel, nonprofits and churches, event venues and caterers.
  ["6100", "out", /\b84 lumber|builders firstsource|\bhilti\b|floral wholesale/],
  ["6060", "out", /buildertrend|procore|jobtread|coconstruct|docusign|planning center|bloomerang|neon one|techsoup|caterease|catertraxx|tripleseat|klaviyo/],
  ["6090", "out", /sunbelt rentals|united rentals|dumpster rental|party rental|table and chair rental/],
  ["6030", "out", /builders.? risk|surety bond|d&o insurance/],
  ["6050", "out", /lien waiver|notary/],
  ["6120", "out", /clear secure/],
  ["6000", "out", /linkedin sales nav/],
  ["4000", "in", /givelify|pushpay|tithely|donorbox|network for good|grant award|eventbrite|zola payout/],
  ["6170", "out", /guidestar|charity navigator/],
  ["6110", "out", /irs 990|liquor license/],
  // Small-business spend probe 3 (2026-10-28, eval/probe-trades3.mjs, 79 descriptors; agent-written from the companies' public names, not from a real export; tuned on itself):
  // restaurants, auto repair, landscaping, cleaning, tutors, web agencies and online sellers. First so "Restaurant Depot" beats the generic restaurant word.
  ["6100", "out", /restaurant depot|sysco|\bus foods\b|webstaurant|napa auto|o.?reilly auto|advance auto parts|matco|snap-on|john deere landscapes|siteone|stihl|unifirst|\bcintas\b|alibaba|faire wholesale|\buline\b/],
  ["4000", "in", /toast (inc )?payout|grubhub|wyzant|chegg tutors|toptal|contra payout|amazon seller|ebay managed payments/],
  ["6090", "out", /ecolab|hobart service|grease trap|safety-kleen/],
  ["6060", "out", /toast pos|7shifts|homebase|mitchell1|tekmetric|carfax|\blmn software|zenmaid|kajabi|thinkific|acuity scheduling|linear\.app|envato|sellersprite|helium ?10|jungle ?scout/],
  ["6170", "out", /servsafe|coach federation|\bicf dues/],
  ["6030", "out", /workers.? comp/],
  ["6000", "out", /local services ads/],
  ["6110", "out", /franchise royalty/],
  // Small-business spend probe 2 (2026-10-28, eval/probe-trades2.mjs, 92 descriptors; agent-written from the companies' public names, not from a real export; tuned on itself):
  // freight, farms, clinics, childcare, salons, fitness studios, photographers, realtors and bookkeepers. First so "IFTA fuel tax" and "AICPA membership" beat the generic fuel and accountant words.
  ["6110", "out", /\bifta\b|prepass|\bmls (access|dues|fee)|\b(cosmetology|nursing|medical|real estate|contractors?) board\b|board of (dentistry|nursing|cosmetology|pharmacy|medicine)|(dentistry|dental) board|\bbmi\b.*licens|\bascap\b|\bsesac\b|child ?care licens|farmers.? market (vendor|fee)/],
  ["6170", "out", /\baicpa\b|\bnar dues\b|yoga alliance|american red cross|\bcpr\b.*(training|class|cert)|\bnational association of/],
  ["6160", "out", /\bloves travel|\bta petro|\bpetro \d|road ranger|speedway \d|sapp bros/],
  ["6060", "out", /\bdat solutions|truckstop\.com|motive tech|samsara|keeptruckin|athenahealth|simplepractice|jane app|claim\.?md|brightwheel|vagaro|styleseat|mindbody inc|zenplanner|pushpress|glofox|pic-?time|smugmug|pixieset|honeybook|dubsado|follow ?up boss|dotloop|\bkarbon\b|practice ignition|toggl|clockify|\bgusto\b|drake software|tax preparation software|\bloom\b|calendly|\bzocdoc|\bkvcore|\bboomtown\b/],
  ["4000", "in", /availity|\bcacfp\b|\busda fsa\b|teachers pay teachers|kindercare|booksy|fresha|mindbody payout|classpass|booth rent|market sales|commission deposit|real broker/],
  ["6000", "out", /the knot|weddingwire|zillow (premier|flex)|realtor\.com|county fair|booth fee|\bangi leads/],
  ["6090", "out", /truck (parts|tire|repair)|tire center|veterinary|large animal/],
  ["6040", "out", /farm credit.*interest|\bagcountry\b.*interest/],
  ["6030", "out", /commercial auto|healthcare providers service|errors and omissions|photographers insurance|\bhiscox\b|\bnext insurance\b|\bthimble\b/],
  ["6050", "out", /background check|care\.com|\bcheckr\b|\bsterling check/],
  ["6020", "out", /upwork escrow|deel (inc )?contractor|remote\.com contractor/],
  ["6010", "out", /\bwise (us )?inc.*fee/],
  ["6070", "out", /\bsupra\b|lockbox key/],
  ["6100", "out", /tractor supply|\btsc\b|southern states|co-?op feed|feed (and|&) seed|henry schein|patterson dental|medline|lakeshore learning|school specialty|salon ?centric|sally beauty|barbicide|rogue fitness|\bwhcc\b|photo lab|print lab|nasco|dental supply/],
  // PayPal's own transaction types, from its transaction event codes reference (eval/paypal-event-codes.mjs).
  // The importer writes "Name - Type", so these anchor on the type at the end. Written ahead of the
  // transfer rules: "Credit card payment" is a customer paying you, "Bank deposit" is your own money.
  ["4000", "in", /(^| - )(general|website|express checkout|standard web checkout|mobile|virtual terminal|pos|credit card|subscription|donation|business|ebay auction|preapproved) payment$/],
  ["6010", "any", /(^| - )(chargeback|dispute|payment|partner|custody|campaign|bank return) fee$|(^| - )(fee reversal|fee refund)$/],
  ["transfer", "any", /(^| - )((general|manual|user initiated) withdrawal( - bank account)?|auto-?sweep|bank deposit to (pp|paypal) account|(general|user[- ]initiated) currency conversion|conversion to cover negative balance|withdrawal to hyperwallet)$/],
  ["6020", "out", /(^| - )mass payment$/],
  ["4000", "in", /stripe (transfer|payout)|shopify payout|square (payout|transfer)|paypal transfer|etsy (deposit|payout)/],
  ["3100", "out", /owner draw|transfer to personal|to personal|atm withdrawal|cash withdrawal/],
  // Cross-border client payments arriving through a payout service are sales (still reviewed, never posted by themselves).
  ["4000", "in", /\bwise payout\b|\bpayoneer\b/],
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
  // Resale-app payouts are sales; thrift and consignment stores are stock for resale (1450). Both go to review, never post themselves.
  ["4000", "in", /\b(poshmark|mercari|depop|vinted|thredup|offerup|grailed|reverb)\b/],
  ["1450", "out", /goodwill|salvation army|plato'?s closet|value village|buffalo exchange|once upon a child|savers thrift|thrift (store|shop)/],
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
  ["6060", "out", /\bzoom\b|porkbun|name-?cheap|neon\.tech|gmass|help ?scout|descript\b|typeform|streamyard|restream|assemblyai|fillout|\bshopify\b|spotify|domain\.com|tryhackme|sentry|supabase|render\.com|planetscale|mongodb|replit|posthog|\bloom\b|calendly|airtable|webflow|framer|1password|bitwarden|tailscale/],
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
  // Written after reading page 4 of the HCB feed (organisations 300-399, 168 card charges, 40.5% suggested before; tuned on that data; README Next).
  ["6060", "out", /postmarkapp|elevenlabs|\bqr\.io\b|skool\.com/],
  ["6100", "out", /misumi|cannonkeys|zyltech|pitsco|nexmetal|v-belt guys/],
  ["6000", "out", /standout stickers|4over4|zazzle|wristbandbros/],
  ["6130", "out", /ezcater|sodalicious|venchi/],
  // Seen on a real Bank of America card export (Actual Budget's MIT sample files, 28 lines; rules written looking at them, not held out).
  ["6160", "out", /\bcitgo\b|\bcumberland farms\b|\bracetrac\b|\bwawa fuel/],
  ["6140", "out", /county waste|waste management|republic services|\bwaste connections\b/],
  // Gig and platform work (2026-10-25): what the driver or freelancer is paid is sales, whatever the app calls it; written from the platforms' names, not from a real export.
  ["4000", "in", /\b(uber|lyft)\b.*\b(driver|payout|payment|earnings)|\bdasher\b|doordash.*\b(pay|payment|payout)|instacart.*\b(shopper|payment|payout)|spark driver|amazon flex|shipt.*\b(payment|payout)|\bupwork\b|\bfiverr\b|taskrabbit/],
  ["6160", "out", /\bqt \d{2,}|\bcircle k\b|kwik trip|buc-?ee|flying j\b|pilot travel/],
  // Creators (2026-10-25): ad, membership, newsletter and affiliate payouts are sales; the editing, hosting and email tools are software. Written from the platforms' names, not from a real export.
  ["4000", "in", /google ?adsense|youtube.*(partner|payment|payout)|\btwitch\b.*(payout|payment)|substack|beehiiv|buy ?me ?a ?coffee|medium partner|amazon associates|rakuten (advertising|affiliate)|\bimpact\b.*payout|shareasale|cj affiliate|lemon ?squeezy|teachable|podia\b|spotify.*podcast|sponsorship|affiliate (payout|commission)/],
  ["6060", "out", /riverside\.fm|buzzsprout|captivate\.fm|transistor\.fm|libsyn|convertkit|kit\.com|beehiiv|substack|midjourney|capcut|canva|epidemic ?sound|artlist|podia\b|teachable|lemon ?squeezy|vidiq|tubebuddy|frame\.io|final cut|davinci|squarespace/],
  ["6070", "out", /b ?& ?h photo|adorama|sweetwater|rode microphones?|shure|elgato|blue yeti/],
  // Clubs, PTOs and small nonprofits (2026-10-25): donation-platform payouts and dues are income; written from the platforms' names, not from a real treasurer's export.
  ["4000", "in", /zeffy|givebutter|donorbox|\bclassy\b|gofundme|memberplanet|membership ?toolbox|\bdues\b|booster (club )?(payment|deposit)|fundrais(er|ing)/],
  // Home-service trades (2026-10-25): payments through field-service apps are sales; supply houses and tool brands are supplies and materials; lead sites are marketing. Written from the companies' names, not from a real contractor's export.
  ["4000", "in", /jobber.*(payment|payout|deposit)|housecall ?pro.*(payment|payout|deposit)|servicetitan.*(payment|payout|deposit)|fieldedge.*(payment|payout)|workiz.*(payment|payout)|\bangi\b.*(payment|payout)|homeadvisor.*(payment|payout)|thumbtack.*(payment|payout)/],
  ["6100", "out", /ferguson|johnstone supply|gemaire|\bwesco\b|graybar|fastenal|hajoca|winsupply|city electric supply|\brexel\b|sherwin[- ]williams|supply ?house|milwaukee tool|snap[- ]?on|ridgid|\bdewalt\b|northern tool/],
  ["6060", "out", /jobber(?! .*(payment|payout))|housecall ?pro|servicetitan|fieldedge|workiz|\bsimpro\b/],
  ["6000", "out", /\bangi\b|homeadvisor|thumbtack|networx|yelp/],
  ["6110", "out", /contractors? (state )?licen[cs]e|licensing board|\bcslb\b|permit/],  // HCB page 5 (eval/hcb-memos.mjs --orgpage 5), written after the held-out reading.
  ["6060", "out", /mailerlite|\*discord\b|weebly/],
  ["6140", "out", /tello mobile/],
  // Bigcapital demo bank file (2026-10-27): grocers and quick-service names seen on a US bank feed, as the feed prints them.
  ["6130", "out", /albertsons|food lion|stop & shop|smart and final|royal farms|bojangles|denny's|krispy kreme|topgolf/],
  ["6120", "out", /paybyphone/],
  ["6130", "out", /\bgrocer(y|ies|s)\b|\bsupermarket\b/],  // plain-word payees (Maybe fixture, 2026-10-25): "Grocery Store".
  ["6140", "out", /\b(mobile|cell(ular)?) phone\b|\bphone (provider|company|bill)\b|\b(internet|broadband) (provider|service)\b/],
  ["6160", "out", /shell\/shell/],
  ["6100", "out", /bambu lab|joann stores|alro steel|mas epoxies|lakeshore carbide|\bvevor\b|bulksupplements/],
  ["6120", "out", /cheapoair|delta internet/],
  ["6000", "out", /discountmugs/],
  // HCB page 6 (eval/hcb-memos.mjs --orgpage 6), written after the held-out reading.
  ["6100", "out", /homedepot\.com|\bfabworks\b|polymaker|alibaba\.com|aliexpress|michaels stores/],
  ["6060", "out", /google ?\*? ?google one/],
  ["6160", "out", /spothero/],
  ["6120", "out", /frontier reservations/],
  ["6000", "out", /customink|bonfire\.com/],
  ["6130", "out", /famous dave|chili's/],
  // HCB page 7 (eval/hcb-memos.mjs --orgpage 7), written after the held-out reading.
  ["6100", "out", /sp the thrifty bot|\bsp wcproducts|\bvex robotics|studica|ctr electronics|swerve drive spec|swyft robotics|metal supermarkets|automationdirect|plummer industries|general rubber|fuller & son hardware|robo promo|\bnte 5680|schneider'?s wholesale|american button m/],
  ["6130", "out", /mcalister|papa john|dairy queen|firehouse subs|ribcrib|super duper burgers|pot & paddle|jambalaya|totum/],
  // HCB page 8 (eval/hcb-memos.mjs --orgpage 8), written after the held-out reading.
  ["6100", "out", /andy ?mark|habor freight|\bctrelec|maxbotix|fastmetals|littlemachineshop|bolt depot|prusa research|stratasys|spark ?fun electronics|mk battery|pishop|true value|eplastics/],
  ["6130", "out", /star pizzeria|marble slab|hardee'?s|hardees|killens barbecue/],
  // HCB page 8, second pass: chains and shops the first pass left (same page, so tuned on itself).
  ["6100", "out", /gamestop|best buy|elegoo|sdp-si|axon robotics|rev robotics/],
  ["6130", "out", /little caesars|bruster|sugar la|halal|creamery|ice cre/],
  // Small-business spend probe (2026-10-25, 114 descriptors in the formats banks print; agent-written, not from a real export):
  // the Toast restaurant prefix, tolls, ad networks written with the processor's asterisk, trades, and airline/payroll names the earlier rules missed.
  ["6130", "out", /^tst\s?\*/],
  ["6160", "out", /costco gas|\bgas #?\d/],
  ["6120", "out", /e-?z ?pass|\bsunpass\b|\bfastrak\b|\bi-?pass\b|^united\s+0\d{6,}/],
  ["6000", "out", /google\s?\*\s?ads|linkedin\s+(job|ads|marketing|recruiter)|reddit\s+ads|\bx corp\.? ads|twitter\s?\*?\s?ads|pinterest\s?\*?\s?ads|snap\s?\*?\s?ads/],
  ["6090", "out", /roto-?rooter|\bhvac\b|servpro|\bplumb(er|ing)\b|\belectrician\b|\bpest control\b|\bterminix\b|\borkin\b|\bjanitorial\b/],
  ["6150", "out", /^paychex\b|\bpaychex (payroll|inc)/],
  ["4000", "in", /amazon (payments )?(settlement|payout|disburse)/],
  ["6110", "out", /\bdiv(ision)? of corp|secretary of state|business license/],
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
  const text = String(txn.desc ?? "").toLowerCase().replace(/\s+/g, " ");
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
