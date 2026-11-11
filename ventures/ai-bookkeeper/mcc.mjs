// Card network merchant category codes (MCC, ISO 18245) read as a hint for the
// categorizer. A card export that carries the MCC (Tinkoff, Revolut Business,
// purchasing-card files from Bank of America Works, Citi and the like) says what
// kind of merchant took the money even when the merchant is new to these books:
// "4121" is a taxi whatever the driver's name. The code says what the merchant
// sells, not why the business bought it, so this is a review suggestion only.
//
// Codes are mapped only where one chart account is the usual answer for a small
// business. Catch-all codes (5999 miscellaneous retail, 7399 business services,
// 5311 department stores, 5964-5969 direct marketing, which is where Amazon
// sits, 9399 government services, 5045 computers and software together) map to
// nothing: they say less than the merchant's name does.
//
// Some exports carry the network's category name instead of the number
// ("Eating places, restaurants", "Lodging-Hotels,Motels,Resorts-Not Classified").
// mccFromName reads those; its patterns follow the network's own names.

// [low, high, account, what the range is]
export const MCC_RANGES = [
  [742, 742, "6100", "veterinary services"],
  [780, 780, "6090", "landscaping and horticultural services"],
  [1520, 1520, "6090", "general contractors"],
  [1711, 1799, "6090", "trade contractors"],
  [2791, 2791, "6000", "typesetting and plate making"],
  [3000, 3350, "6120", "airlines"],
  [3351, 3500, "6120", "car rental"],
  [3501, 3999, "6120", "hotels and lodging"],
  [4011, 4011, "6180", "railroad freight"],
  [4111, 4131, "6120", "commuter transport, rail, taxis and buses"],
  [4214, 4215, "6180", "freight carriers and couriers"],
  [4411, 4411, "6120", "cruise lines"],
  [4511, 4511, "6120", "airlines"],
  [4582, 4582, "6120", "airports and terminals"],
  [4722, 4722, "6120", "travel agencies"],
  [4784, 4784, "6160", "tolls and bridge fees"],
  [4789, 4789, "6120", "transportation services"],
  [4814, 4816, "6140", "telecommunications and network services"],
  [4821, 4821, "6140", "telegraph services"],
  [4899, 4900, "6140", "cable and utilities"],
  [5013, 5013, "6160", "motor vehicle supplies and parts"],
  [5039, 5039, "6100", "construction materials"],
  [5044, 5044, "6070", "office and photographic equipment"],
  [5047, 5047, "6100", "medical, dental and laboratory equipment"],
  [5051, 5051, "6100", "metal service centres"],
  [5065, 5065, "6100", "electrical parts and equipment"],
  [5072, 5072, "6100", "hardware and tools"],
  [5074, 5074, "6100", "plumbing and heating supplies"],
  [5085, 5085, "6100", "industrial supplies"],
  [5111, 5111, "6070", "stationery and office supplies"],
  [5169, 5169, "6100", "chemicals"],
  [5192, 5192, "6170", "books and periodicals"],
  [5198, 5198, "6100", "paints and varnishes"],
  [5200, 5200, "6100", "home supply warehouses"],
  [5211, 5211, "6100", "lumber and building materials"],
  [5231, 5231, "6100", "glass, paint and wallpaper"],
  [5251, 5251, "6100", "hardware stores"],
  [5261, 5261, "6100", "nurseries and garden supply"],
  [5532, 5533, "6160", "tyres and auto parts"],
  [5541, 5542, "6160", "fuel"],
  [5734, 5734, "6060", "computer software stores"],
  [5811, 5814, "6130", "caterers, restaurants, bars and fast food"],
  [5817, 5818, "6060", "digital goods: software and applications"],
  [5942, 5942, "6170", "bookshops"],
  [5943, 5943, "6070", "stationery and office supply stores"],
  [5960, 5960, "6030", "insurance sold direct"],
  [5978, 5978, "6070", "typewriter stores"],
  [6300, 6399, "6030", "insurance"],
  [6513, 6513, "6080", "property rental agents"],
  [7011, 7012, "6120", "hotels and lodging"],
  [7276, 7276, "6050", "tax preparation"],
  [7311, 7311, "6000", "advertising services"],
  [7338, 7338, "6070", "copying and reproduction"],
  [7342, 7342, "6090", "pest control"],
  [7349, 7349, "6090", "cleaning and maintenance"],
  [7361, 7361, "6020", "employment and temporary help agencies"],
  [7372, 7372, "6060", "computer programming and data processing"],
  [7392, 7392, "6050", "management, consulting and public relations"],
  [7394, 7394, "6080", "equipment rental and leasing"],
  [7512, 7512, "6120", "car rental"],
  [7513, 7513, "6160", "truck and trailer rental"],
  [7519, 7519, "6120", "motor home rental"],
  [7523, 7523, "6160", "parking"],
  [7531, 7549, "6160", "vehicle repair, tyres, car washes and towing"],
  [7622, 7699, "6090", "repair shops"],
  [8111, 8111, "6050", "legal services"],
  [8211, 8299, "6170", "schools and training"],
  [8641, 8641, "6170", "civic and professional associations"],
  [8699, 8699, "6170", "membership organisations"],
  [8931, 8931, "6050", "accounting and bookkeeping"],
  [8911, 8911, "6050", "architectural, engineering and surveying services"],
  [9311, 9311, "6110", "tax payments"],
  [9402, 9402, "6180", "postal services"],
];

// The network's category names, normalised (lower case, punctuation to spaces,
// "not elsewhere classified" and its abbreviations dropped). First match wins, so
// the catch-alls come first and say nothing.
const NAME_SKIP = /\b(business services|misc(ellaneous)? (and |& )?specialty retail|miscellaneous general merchandise|general merchandise|direct marketing|government services|department stores|discount stores|variety stores|wholesale clubs|computers computer peripheral|electronic sales|electronics? stores|miscellaneous (house )?furnishing|charitable|religious|political|financial institutions|cash disbursement|money orders|quasi cash|wire transfer|betting|lotter|professional services|publishing)/;
const NAME_RULES = [
  ["6130", /\b(eating places|restaurants?|caterers?|fast food|drinking places|bars|taverns|cocktail|nightclubs)\b/],
  ["6120", /\b(hilton|marriott|radisson|holiday inn|premier inn|travelodge|ibis|novotel|hyatt|sheraton|best western|mercure|crowne plaza|doubletree|hampton inn|automobile rental|car hire|lodging|hotels?|motels?|resorts?|airlines?|air carriers?|airports?|travel agenc|tour operators?|passenger railways?|railroads? passenger|commuter|suburban (and |& )?local|bus lines?|taxicabs?|limousines?|cruise|car rental|rent a car|motor home|transportation services)\b/],
  ["6160", /\b(service stations?|automated fuel|fuel dispenser|petroleum|automotive service|auto(motive)? (body|paint|parts|tire)|tire (retread|stores?)|car washes|towing|parking|toll|truck (and |& )?(utility )?trailer rental|motor vehicle supplies)\b/],
  ["6180", /\b(courier|freight|trucking|postal services?|post offices?)\b/],
  ["6140", /\b(telecommunication|telephone service|cable|satellite|pay television|utilities|electric gas|computer network|information services)\b/],
  ["6060", /\b(computer software|digital goods (software|applications?)|computer programming|data processing|integrated systems design)\b/],
  ["6070", /\b(stationery|office (and |& )?(school )?supply|office (school supply|supplies)|office (and |& )?photographic|photocopy|quick copy|reproduction|typewriter)\b/],
  ["6030", /\binsurance\b/],
  ["6050", /\b(legal services|attorneys|accounting|auditing|bookkeeping|consulting|management (and |& )?public relations|tax preparation|architectural|surveying)\b/],
  ["6020", /\b(employment agenc|temporary help)\b/],
  ["6000", /\b(advertising|typesetting)\b/],
  ["6170", /\b(schools?|colleges?|universit|educational|training|correspondence|membership organi[sz]ations|organizations membership|civic social|professional (organi[sz]ations|associations)|books(tores| stores)|book stores|books periodicals)\b/],
  ["6080", /\b(real estate agents (and |& )?managers|equipment rental|equipment (and |& )?tool rental|leasing)\b/],
  ["6090", /\b(contractors?|carpentry|roofing|masonry|concrete work|landscaping|horticultur|exterminat|cleaning (and |& )?maintenance|janitorial|repair shops?|repair services?|welding|furniture repair)\b/],
  ["6100", /\b(hardware|lumber|building materials|home supply|glass paint|paints?|nurseries|lawn (and |& )?garden|industrial supplies|construction materials|plumbing|heating equipment|electrical parts|metal service|chemicals|dental lab|medical (and |& )?dental|ophthalmic|hosp(ital)? equip|laboratory)\b/],
  ["6110", /\b(tax payments?)\b/],
];

export function normaliseMccName(s) {
  return String(s ?? "").toLowerCase()
    .replace(/\bsvcs?\b/g, "services").replace(/\bsrvcs?\b/g, "services").replace(/\bsvc\b/g, "services")
    .replace(/\bhosp\b/g, "hospital").replace(/\bequip\b/g, "equipment").replace(/\bunivs?\b/g, "universities")
    .replace(/\bpro\b/g, "professional").replace(/\borgs?\b/g, "organizations").replace(/\bmisc\b/g, "miscellaneous")
    .replace(/\bsupp(ly)?\b/g, "supply").replace(/\btransprtn\b/g, "transportation").replace(/\bpsngr\b/g, "passenger")
    .replace(/\bcomtr\b/g, "commuter").replace(/\borganisations?\b/g, "organizations").replace(/\bcomp\b/g, "computer")
    .replace(/\bprogr?amm?ing\b/g, "programming").replace(/\bprcsng\b/g, "processing").replace(/\bintgrtd\b/g, "integrated").replace(/\bsubrbn\b/g, "suburban")
    .replace(/[^a-z0-9&]+/g, " ")
    .replace(/\b(not elsewhere classified|not elsew(here)?|not classified|nec)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function mccFromCode(code) {
  const n = Number(code);
  if (!Number.isInteger(n) || n < 1 || n > 9999) return null;
  const hit = MCC_RANGES.find(([lo, hi]) => n >= lo && n <= hi);
  return hit ? { account: hit[2], label: hit[3], code: String(n).padStart(4, "0") } : null;
}

export function mccFromName(name) {
  const t = normaliseMccName(name);
  if (!t || NAME_SKIP.test(t)) return null;
  const hit = NAME_RULES.find(([, re]) => re.test(t));
  return hit ? { account: hit[0], label: String(name).trim().slice(0, 60) } : null;
}

// One MCC field from a file: a four-digit code, a name, or "5812 Eating places".
export function mccAccount(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const m = s.match(/^0*(\d{3,4})\b\s*[-:–]?\s*(.*)$/);
  // A known catch-all code says nothing, whatever name rides beside it.
  if (m) return mccFromCode(m[1]);
  return mccFromName(s);
}

// The key a category is remembered under: the code when there is one, else the normalised name.
export function mccKey(value) {
  const s = String(value ?? "").trim();
  const m = s.match(/^0*(\d{3,4})\b/);
  return m ? m[1].padStart(4, "0") : normaliseMccName(s);
}
