// @ts-check
// Mail port for the paid layer: verification and sign-in links only (transactional, never
// marketing). Proprietary (see ../LICENSE, part 2). No npm dependencies.
//
//   EMAIL_PROVIDER=resend + RESEND_API_KEY + EMAIL_FROM   sends through Resend's HTTP API
//                                                          (the adapter apps/grants already uses)
//   FAKE_EXTERNALS=true                                    FakeMailer: kept in memory, nothing sent
//   anything else                                          no mailer: email sign-in is off (503)
//
// Header safety (as apps/grants/src/worker/ports/email.ts): one bare address per recipient, and
// the subject is stripped of CR/LF and other control characters, so a field cannot smuggle a
// header or a second recipient. Bodies are plain text built from fixed templates; the only
// variable parts are the firm name (control characters stripped) and the link.

/**
 * @typedef {{ to: string, subject: string, text: string }} MailMessage
 * @typedef {{ name: string, send: (msg: MailMessage) => Promise<{ id: string }> }} Mailer
 */

/** A single bare address: no display name, comma, angle brackets, spaces or control characters. */
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/;

/**
 * Normalise an address a person typed: trimmed, lower-cased. Returns null unless it is one bare
 * address of at most 254 characters.
 * @param {unknown} v
 */
export function normalizeEmail(v) {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s.length > 254 || !ADDRESS.test(s)) return null;
  return s;
}

/** Strip control characters (CR/LF included) and cut to `max`. @param {string} v @param {number} [max] */
export const oneLine = (v, max = 200) =>
  String(v)
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .trim()
    .slice(0, max);

export class ResendMailer {
  /** @param {string} apiKey @param {string} from @param {typeof fetch} [fetchImpl] */
  constructor(apiKey, from, fetchImpl = (input, init) => fetch(input, init)) {
    this.name = "resend";
    this.apiKey = apiKey;
    this.from = from;
    this.fetchImpl = fetchImpl;
  }

  /** @param {MailMessage} msg */
  async send(msg) {
    const to = normalizeEmail(msg.to);
    if (!to) throw new Error("Email send failed: not a single bare address");
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [to], subject: oneLine(msg.subject), text: msg.text }),
    });
    if (!res.ok) throw new Error(`Email send failed: ${res.status}`);
    const body = /** @type {{ id?: string }} */ (await res.json().catch(() => ({})));
    return { id: String(body.id ?? "") };
  }
}

/** Keeps messages in memory for tests and the offline demo; sends nothing. */
export class FakeMailer {
  /** @param {{ log?: boolean }} [opts] log: print each message (the offline demo has no inbox) */
  constructor(opts = {}) {
    this.name = "fake";
    this.log = Boolean(opts.log);
    /** @type {MailMessage[]} */
    this.outbox = [];
  }

  /** @param {MailMessage} msg */
  async send(msg) {
    const to = normalizeEmail(msg.to);
    if (!to) throw new Error("Email send failed: not a single bare address");
    this.outbox.push({ to, subject: oneLine(msg.subject), text: msg.text });
    if (this.log) console.log(`einvoice-pro: fake email (not sent) to ${to}: ${oneLine(msg.subject)}\n${msg.text}`);
    return { id: `fake-${this.outbox.length}` };
  }
}

/**
 * The mailer the environment configures, or null (email sign-in off).
 * @param {Record<string, string | undefined>} env @param {typeof fetch} [fetchImpl] @returns {Mailer | null}
 */
export function mailerFromEnv(env, fetchImpl) {
  if (env.FAKE_EXTERNALS === "true") return new FakeMailer({ log: true });
  if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY && env.EMAIL_FROM) {
    if (!normalizeEmail(env.EMAIL_FROM)) throw new Error("EMAIL_FROM must be one bare address");
    return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM, fetchImpl);
  }
  return null;
}

/** @typedef {"de" | "fr" | "en" | "nl" | "pl"} Lang */

const TEMPLATES = {
  verify: {
    en: {
      subject: "Confirm your sign-in email for the e-invoice workspace",
      text: "Someone asked to use this address to sign in to the e-invoice workspace of {firm}.\n\nTo confirm, open this link and press the button (valid for 24 hours):\n{link}\n\nIf this was not you, ignore this email: nothing changes.",
    },
    de: {
      subject: "Bestätigen Sie Ihre Anmelde-E-Mail für den E-Rechnungs-Arbeitsbereich",
      text: "Jemand möchte diese Adresse zur Anmeldung im E-Rechnungs-Arbeitsbereich von {firm} verwenden.\n\nZur Bestätigung öffnen Sie diesen Link und klicken Sie auf die Schaltfläche (24 Stunden gültig):\n{link}\n\nWenn Sie das nicht waren, ignorieren Sie diese E-Mail: Es ändert sich nichts.",
    },
    fr: {
      subject: "Confirmez votre e-mail de connexion à l'espace e-facture",
      text: "Quelqu'un souhaite utiliser cette adresse pour se connecter à l'espace e-facture de {firm}.\n\nPour confirmer, ouvrez ce lien et cliquez sur le bouton (valable 24 heures) :\n{link}\n\nSi ce n'était pas vous, ignorez cet e-mail : rien ne change.",
    },
    nl: {
      subject: "Bevestig uw aanmeldadres voor de e-factuurwerkruimte",
      text: "Iemand wil dit adres gebruiken om zich aan te melden bij de e-factuurwerkruimte van {firm}.\n\nOm dit te bevestigen, opent u deze link en drukt u op de knop (24 uur geldig):\n{link}\n\nWas u dit niet, negeer dan deze e-mail: er verandert niets.",
    },
    pl: {
      subject: "Potwierdź e-mail do logowania w obszarze roboczym e-faktur",
      text: "Ktoś chce używać tego adresu do logowania w obszarze roboczym e-faktur firmy {firm}.\n\nAby potwierdzić, otwórz ten link i naciśnij przycisk (ważny 24 godziny):\n{link}\n\nJeśli to nie Ty, zignoruj tę wiadomość: nic się nie zmieni.",
    },
  },
  signin: {
    en: {
      subject: "Your sign-in link for the e-invoice workspace",
      text: "Open this link and press the button to sign in to the e-invoice workspace of {firm} (valid for 15 minutes, once):\n{link}\n\nSigning in this way creates a new API key for this browser. Your other keys keep working.\n\nIf you did not ask for this, ignore this email: no one can sign in without the link.",
    },
    de: {
      subject: "Ihr Anmeldelink für den E-Rechnungs-Arbeitsbereich",
      text: "Öffnen Sie diesen Link und klicken Sie auf die Schaltfläche, um sich im E-Rechnungs-Arbeitsbereich von {firm} anzumelden (15 Minuten gültig, einmalig):\n{link}\n\nDiese Anmeldung erstellt einen neuen API-Schlüssel für diesen Browser. Ihre anderen Schlüssel funktionieren weiter.\n\nWenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail: Ohne den Link kann sich niemand anmelden.",
    },
    fr: {
      subject: "Votre lien de connexion à l'espace e-facture",
      text: "Ouvrez ce lien et cliquez sur le bouton pour vous connecter à l'espace e-facture de {firm} (valable 15 minutes, une seule fois) :\n{link}\n\nCette connexion crée une nouvelle clé d'API pour ce navigateur. Vos autres clés continuent de fonctionner.\n\nSi vous n'avez rien demandé, ignorez cet e-mail : personne ne peut se connecter sans le lien.",
    },
    nl: {
      subject: "Uw aanmeldlink voor de e-factuurwerkruimte",
      text: "Open deze link en druk op de knop om u aan te melden bij de e-factuurwerkruimte van {firm} (15 minuten geldig, één keer):\n{link}\n\nWie zich zo aanmeldt, krijgt een nieuwe API-sleutel voor deze browser. Uw andere sleutels blijven werken.\n\nHebt u hier niet om gevraagd, negeer dan deze e-mail: zonder de link kan niemand zich aanmelden.",
    },
    pl: {
      subject: "Twój link do logowania w obszarze roboczym e-faktur",
      text: "Otwórz ten link i naciśnij przycisk, aby zalogować się do obszaru roboczego e-faktur firmy {firm} (ważny 15 minut, jednorazowy):\n{link}\n\nTakie logowanie tworzy nowy klucz API dla tej przeglądarki. Pozostałe klucze nadal działają.\n\nJeśli nikt z Twojej firmy o to nie prosił, zignoruj tę wiadomość: bez linku nikt się nie zaloguje.",
    },
  },
};

/**
 * One of the two fixed messages, in the reader's language (English when unknown).
 * @param {"verify" | "signin"} kind @param {unknown} lang @param {{ firm: string, link: string }} vars
 */
export function message(kind, lang, vars) {
  const l = lang === "de" || lang === "fr" || lang === "nl" || lang === "pl" ? lang : "en";
  const tpl = TEMPLATES[kind][l];
  const firm = oneLine(vars.firm, 200) || "your firm";
  return { subject: tpl.subject, text: tpl.text.replace("{firm}", firm).replace("{link}", vars.link) };
}
