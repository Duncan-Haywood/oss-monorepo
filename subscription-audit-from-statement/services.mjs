// Directory of well-known recurring services, matched on the cleaned merchant
// key. It does three jobs the generic grouping cannot:
//   1. merge descriptor variants of one service ("NETFLIX.COM" and
//      "NETFLIX INC") into a single line;
//   2. give the category used by the "several services of one kind" finding;
//   3. say where an account page lives so a flagged charge is one step from
//      being cancelled.
// `site` is the service's own domain, nothing deeper: deep links change and a
// stale one is worse than none. A recognised name is a guess from the bank
// text, not proof of which plan or account is being billed.
const S = (name, kind, re, site) => ({ name, kind, re, site });

export const SERVICES = [
  S("Netflix", "Video streaming", /\bNETFLIX/, "netflix.com"),
  S("Hulu", "Video streaming", /\bHULU/, "hulu.com"),
  S("Disney+", "Video streaming", /\bDISNEY ?\+|\bDISNEYPLUS|\bDISNEY PLUS/, "disneyplus.com"),
  S("Max", "Video streaming", /\bHBO ?MAX|\bMAX\.COM|\bHBOMAX/, "max.com"),
  S("Paramount+", "Video streaming", /\bPARAMOUNT/, "paramountplus.com"),
  S("Peacock", "Video streaming", /\bPEACOCK/, "peacocktv.com"),
  S("Apple TV+", "Video streaming", /\bAPPLE ?TV|\bAPPLETV/, "tv.apple.com"),
  S("Amazon Prime Video", "Video streaming", /\bPRIME ?VIDEO/, "primevideo.com"),
  S("Crunchyroll", "Video streaming", /\bCRUNCHYROLL/, "crunchyroll.com"),
  S("Discovery+", "Video streaming", /\bDISCOVERY ?\+|\bDISCOVERYPLUS/, "discoveryplus.com"),
  S("Starz", "Video streaming", /\bSTARZ/, "starz.com"),
  S("Fubo", "Video streaming", /\bFUBO/, "fubo.tv"),
  S("Sling TV", "Video streaming", /\bSLING ?TV|\bSLING\b/, "sling.com"),
  S("YouTube Premium / TV", "Video streaming", /\bYOUTUBE ?(PREMIUM|TV|MEMBER)|\bYOUTUBEPREMIUM/, "youtube.com"),
  S("BritBox", "Video streaming", /\bBRITBOX/, "britbox.com"),
  S("MUBI", "Video streaming", /\bMUBI/, "mubi.com"),
  S("Curiosity Stream", "Video streaming", /\bCURIOSITY ?STREAM/, "curiositystream.com"),
  S("Spotify", "Music streaming", /\bSPOTIFY/, "spotify.com"),
  S("Apple Music", "Music streaming", /\bAPPLE MUSIC/, "music.apple.com"),
  S("Pandora", "Music streaming", /\bPANDORA/, "pandora.com"),
  S("Tidal", "Music streaming", /\bTIDAL\b/, "tidal.com"),
  S("Deezer", "Music streaming", /\bDEEZER/, "deezer.com"),
  S("Amazon Music", "Music streaming", /\bAMAZON MUSIC/, "music.amazon.com"),
  S("SoundCloud", "Music streaming", /\bSOUNDCLOUD/, "soundcloud.com"),
  S("Audible", "Audiobooks and reading", /\bAUDIBLE/, "audible.com"),
  S("Kindle Unlimited", "Audiobooks and reading", /\bKINDLE ?UNLIMITED/, "amazon.com"),
  S("Scribd", "Audiobooks and reading", /\bSCRIBD|\bEVERAND/, "everand.com"),
  S("Dropbox", "Cloud storage", /\bDROPBOX/, "dropbox.com"),
  S("iCloud+", "Cloud storage", /\bICLOUD/, "icloud.com"),
  S("Google One", "Cloud storage", /\bGOOGLE ?(ONE|STORAGE)\b/, "one.google.com"),
  S("OneDrive", "Cloud storage", /\bONEDRIVE/, "onedrive.live.com"),
  S("Box", "Cloud storage", /\bBOX\.COM/, "box.com"),
  S("Backblaze", "Cloud storage", /\bBACKBLAZE/, "backblaze.com"),
  S("IDrive", "Cloud storage", /\bIDRIVE/, "idrive.com"),
  S("Carbonite", "Cloud storage", /\bCARBONITE/, "carbonite.com"),
  S("The New York Times", "News and reading", /\bNYTIMES|\bNEW YORK TIMES|\bNYT\b/, "nytimes.com"),
  S("The Wall Street Journal", "News and reading", /\bWSJ\b|\bWALL STREET JOURNAL|\bDOW JONES/, "wsj.com"),
  S("The Washington Post", "News and reading", /\bWASHINGTON ?POST|\bWASHPOST/, "washingtonpost.com"),
  S("The Atlantic", "News and reading", /\bTHE ATLANTIC/, "theatlantic.com"),
  S("The Economist", "News and reading", /\bECONOMIST/, "economist.com"),
  S("Medium", "News and reading", /\bMEDIUM\.COM|\bMEDIUM MEMBERSHIP/, "medium.com"),
  S("Substack", "News and reading", /\bSUBSTACK/, "substack.com"),
  S("The New Yorker", "News and reading", /\bNEW ?YORKER/, "newyorker.com"),
  S("Bloomberg", "News and reading", /\bBLOOMBERG/, "bloomberg.com"),
  S("The Athletic", "News and reading", /\bTHE ATHLETIC/, "nytimes.com/athletic"),
  S("Financial Times", "News and reading", /\bFINANCIAL TIMES|\bFT\.COM/, "ft.com"),
  S("Peloton", "Fitness and wellness", /\bPELOTON/, "onepeloton.com"),
  S("Planet Fitness", "Fitness and wellness", /\bPLANET FITNESS|\bPLANETFIT/, "planetfitness.com"),
  S("LA Fitness", "Fitness and wellness", /\bLA FITNESS/, "lafitness.com"),
  S("Anytime Fitness", "Fitness and wellness", /\bANYTIME FITNESS/, "anytimefitness.com"),
  S("Equinox", "Fitness and wellness", /\bEQUINOX/, "equinox.com"),
  S("Orangetheory", "Fitness and wellness", /\bORANGETHEORY|\bORANGE THEORY/, "orangetheory.com"),
  S("ClassPass", "Fitness and wellness", /\bCLASSPASS/, "classpass.com"),
  S("Strava", "Fitness and wellness", /\bSTRAVA/, "strava.com"),
  S("Calm", "Fitness and wellness", /\bCALM\.COM|\bCALM PREMIUM|\bCALM\b/, "calm.com"),
  S("Headspace", "Fitness and wellness", /\bHEADSPACE/, "headspace.com"),
  S("Noom", "Fitness and wellness", /\bNOOM/, "noom.com"),
  S("MyFitnessPal", "Fitness and wellness", /\bMYFITNESSPAL/, "myfitnesspal.com"),
  S("Fitbit", "Fitness and wellness", /\bFITBIT/, "fitbit.com"),
  S("Crunch Fitness", "Fitness and wellness", /\bCRUNCH FIT|\bCRUNCH\b/, "crunch.com"),
  S("Gold's Gym", "Fitness and wellness", /\bGOLD'?S GYM/, "goldsgym.com"),
  S("YMCA", "Fitness and wellness", /\bYMCA/, "ymca.org"),
  S("ChatGPT / OpenAI", "Software and AI", /\bOPENAI|\bCHATGPT/, "chatgpt.com"),
  S("Claude / Anthropic", "Software and AI", /\bANTHROPIC|\bCLAUDE\.AI/, "claude.ai"),
  S("GitHub", "Software and AI", /\bGITHUB/, "github.com"),
  S("Adobe", "Software and AI", /\bADOBE/, "adobe.com"),
  S("Microsoft 365", "Software and AI", /\bMICROSOFT ?(365|OFFICE)|\bOFFICE ?365|\bMSFT/, "microsoft.com"),
  S("Canva", "Software and AI", /\bCANVA/, "canva.com"),
  S("Notion", "Software and AI", /\bNOTION/, "notion.so"),
  S("Evernote", "Software and AI", /\bEVERNOTE/, "evernote.com"),
  S("1Password", "Password managers", /\b1PASSWORD|\bAGILEBITS/, "1password.com"),
  S("LastPass", "Password managers", /\bLASTPASS|\bLOGMEIN/, "lastpass.com"),
  S("Dashlane", "Password managers", /\bDASHLANE/, "dashlane.com"),
  S("Grammarly", "Software and AI", /\bGRAMMARLY/, "grammarly.com"),
  S("Zoom", "Software and AI", /\bZOOM(\.US|\.COM| VIDEO)?\b/, "zoom.us"),
  S("Slack", "Software and AI", /\bSLACK/, "slack.com"),
  S("Figma", "Software and AI", /\bFIGMA/, "figma.com"),
  S("Midjourney", "Software and AI", /\bMIDJOURNEY/, "midjourney.com"),
  S("Cursor", "Software and AI", /\bCURSOR\b|\bANYSPHERE/, "cursor.com"),
  S("Xbox", "Gaming", /\bXBOX/, "xbox.com"),
  S("PlayStation", "Gaming", /\bPLAYSTATION|\bPSN\b|\bSONY INTERACTIVE/, "playstation.com"),
  S("Nintendo", "Gaming", /\bNINTENDO/, "nintendo.com"),
  S("Steam", "Gaming", /\bSTEAM(POWERED| GAMES)?\b/, "store.steampowered.com"),
  S("Twitch", "Gaming", /\bTWITCH/, "twitch.tv"),
  S("EA Play", "Gaming", /\bEA PLAY|\bELECTRONIC ARTS/, "ea.com"),
  S("Epic Games", "Gaming", /\bEPIC GAMES/, "epicgames.com"),
  S("NordVPN", "VPN and security", /\bNORDVPN|\bNORD SECURITY/, "nordvpn.com"),
  S("ExpressVPN", "VPN and security", /\bEXPRESSVPN/, "expressvpn.com"),
  S("Surfshark", "VPN and security", /\bSURFSHARK/, "surfshark.com"),
  S("Proton", "VPN and security", /\bPROTON ?(VPN|MAIL|AG)?\b/, "proton.me"),
  S("Norton", "VPN and security", /\bNORTON|\bGEN DIGITAL/, "norton.com"),
  S("McAfee", "VPN and security", /\bMCAFEE/, "mcafee.com"),
  S("Malwarebytes", "VPN and security", /\bMALWAREBYTES/, "malwarebytes.com"),
  S("LifeLock", "VPN and security", /\bLIFELOCK/, "lifelock.com"),
  S("Aura", "VPN and security", /\bAURA\.COM|\bAURA IDENT/, "aura.com"),
  S("Amazon Prime", "Shopping memberships", /\bAMAZON ?PRIME|\bPRIME MEMBERSHIP|\bAMZN PRIME/, "amazon.com"),
  S("Walmart+", "Shopping memberships", /\bWALMART ?\+|\bWALMART PLUS/, "walmart.com"),
  S("Costco", "Shopping memberships", /\bCOSTCO (ANNUAL|MEMBERSHIP|MEMBER)|\bCOSTCO MEMB/, "costco.com"),
  S("Instacart+", "Shopping memberships", /\bINSTACART ?(\+|PLUS|EXPRESS)?\b/, "instacart.com"),
  S("DoorDash DashPass", "Shopping memberships", /\bDASHPASS|\bDOORDASH/, "doordash.com"),
  S("Uber One", "Shopping memberships", /\bUBER ?ONE\b|\bUBER \*ONE/, "uber.com"),
  S("Duolingo", "Learning", /\bDUOLINGO/, "duolingo.com"),
  S("MasterClass", "Learning", /\bMASTERCLASS/, "masterclass.com"),
  S("Coursera", "Learning", /\bCOURSERA/, "coursera.org"),
  S("LinkedIn Premium", "Learning", /\bLINKEDIN/, "linkedin.com"),
  S("Skillshare", "Learning", /\bSKILLSHARE/, "skillshare.com"),
];

// Charges whose bank text names the store or payment app, not the service.
// What the card statement shows tells you where to look, never what it is.
export const STORE_BILLERS = [
  { id: "apple", label: "Apple", re: /\bAPPLE\.COM\/BILL|\bAPPLE\.COM BILL|\bITUNES|\bAPPLE SERVICES|\bAPL\*? ?(ITUNES|APPLE)/, where: "iPhone: Settings > your name > Subscriptions. Mac: App Store > your name > Account Settings > Subscriptions." },
  { id: "google", label: "Google Play", re: /\bGOOGLE ?\*? ?(PLAY|YOUTUBE|STORAGE|SERVICES|APPS)|\bGOOGLE PLAY/, where: "Play Store > profile picture > Payments & subscriptions > Subscriptions." },
  { id: "amazon", label: "Amazon digital", re: /\bAMAZON (DIGITAL|DIGI|CHANNELS)|\bAMZN DIGITAL|\bPRIME VIDEO CHANNELS/, where: "amazon.com > Account > Memberships & Subscriptions." },
  { id: "paypal", label: "PayPal", re: /\bPAYPAL ?\*/, where: "PayPal > Settings > Payments > Manage automatic payments." },
];

export function identifyService(key) {
  const k = String(key ?? "").toUpperCase();
  for (const s of SERVICES) if (s.re.test(k)) return s;
  return null;
}

export function storeBiller(desc) {
  const d = String(desc ?? "").toUpperCase();
  for (const b of STORE_BILLERS) if (b.re.test(d)) return b;
  return null;
}
