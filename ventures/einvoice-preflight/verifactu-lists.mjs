// Code lists from the AEAT's VERI*FACTU schema, SuministroInformacion.xsd (tikeV1.0).
// The AEAT's own copy on prewww2.aeat.es refused this session's proxy on 2026-11-15, so
// the lists were read from three byte-identical copies kept by MIT projects:
// Eseperio/verifactu-php (src/schemes), emiliopm/verifactu (xsd, main and master),
// SHA-256 ebba5565257c499646041d6250b28dc99226e25653403afa62dc6e4a0dd538ea.
// verifactu.mjs uses them for AEAT codes 1101 (CodigoPais), 1218 (Impuesto), 1225
// (GeneradoPor), 1231 (IDType) and 1246 (ClaveRegimen).

// CountryType2: 245 codes, in the schema's order.
export const COUNTRY_CODES = new Set([
  "AF", "AL", "DE", "AD", "AO", "AI", "AQ", "AG", "SA", "DZ", "AR", "AM", "AW", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BE", "BZ", "BJ", "BM",
  "BY", "BO", "BA", "BW", "BV", "BR", "BN", "BG", "BF", "BI", "BT", "CV", "KY", "KH", "CM", "CA", "CF", "CC", "CO", "KM", "CG", "CD", "CK", "KP",
  "KR", "CI", "CR", "HR", "CU", "TD", "CZ", "CL", "CN", "CY", "CW", "DK", "DM", "DO", "EC", "EG", "AE", "ER", "SK", "SI", "ES", "US", "EE", "ET",
  "FO", "PH", "FI", "FJ", "FR", "GA", "GM", "GE", "GS", "GH", "GI", "GD", "GR", "GL", "GU", "GT", "GG", "GN", "GQ", "GW", "GY", "HT", "HM", "HN",
  "HK", "HU", "IN", "ID", "IR", "IQ", "IE", "IM", "IS", "IL", "IT", "JM", "JP", "JE", "JO", "KZ", "KE", "KG", "KI", "KW", "LA", "LS", "LV", "LB",
  "LR", "LY", "LI", "LT", "LU", "XG", "MO", "MK", "MG", "MY", "MW", "MV", "ML", "MT", "FK", "MP", "MA", "MH", "MU", "MR", "YT", "UM", "MX", "FM",
  "MD", "MC", "MN", "ME", "MS", "MZ", "MM", "NA", "NR", "CX", "NP", "NI", "NE", "NG", "NU", "NF", "NO", "NC", "NZ", "IO", "OM", "NL", "BQ", "PK",
  "PW", "PA", "PG", "PY", "PE", "PN", "PF", "PL", "PT", "PR", "QA", "GB", "RW", "RO", "RU", "SB", "SV", "WS", "AS", "KN", "SM", "SX", "PM", "VC",
  "SH", "LC", "ST", "SN", "RS", "SC", "SL", "SG", "SY", "SO", "LK", "SZ", "ZA", "SD", "SS", "SE", "CH", "SR", "TH", "TW", "TZ", "TJ", "PS", "TF",
  "TL", "TG", "TK", "TO", "TT", "TN", "TC", "TM", "TR", "TV", "UA", "UG", "UY", "UZ", "VU", "VA", "VE", "VN", "VG", "VI", "WF", "YE", "DJ", "ZM",
  "ZW", "QU", "XB", "XU", "XN",
  // RE (Réunion) is in the later schema (see REGIME_CODES), after RU.
  "RE",
]);
// ImpuestoType: 01 IVA, 02 IPSI (Ceuta, Melilla), 03 IGIC (Canary Islands), 05 other.
export const TAX_CODES = new Set(["01", "02", "03", "05"]);
// IdOperacionesTrascendenciaTributariaType: the ClaveRegimen values.
// 21 (IGIC simplified regime) was added after tikeV1.0's first release: the AEAT's validation
// document adds it in v1.1.2 (15 July 2025, rule 15.6.11), and the later schema (SHA-1 blob
// 4f1dff055944561b500db64d4a31921ae15a31d4, kept by eloi24/verifactu-sdk, MIT, and five other
// projects) lists it, with RE (Réunion) in CountryType2; no other list changed.
export const REGIME_CODES = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14", "15", "17", "18", "19", "20", "21"]);
// PersonaFisicaJuridicaIDTypeType: the IDOtro IDType values.
export const ID_TYPES = new Set(["02", "03", "04", "05", "06", "07"]);
// GeneradoPorType: E (the issuer), D (the recipient), T (a third party).
export const GENERATED_BY = new Set(["E", "D", "T"]);
