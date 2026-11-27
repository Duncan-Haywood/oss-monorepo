import { describe, expect, it } from "vitest";
import {
  addressOf,
  decodeEncodedWords,
  decodeQuotedPrintable,
  htmlToText,
  MAX_PARTS,
  parseEmail,
  parseHeaderValue,
} from "./mime";

const enc = (s: string) => new TextEncoder().encode(s);
const crlf = (lines: string[]) => enc(lines.join("\r\n"));
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

describe("headers", () => {
  it("decodes RFC 2047 encoded words in B and Q forms, joining adjacent words", () => {
    expect(decodeEncodedWords("=?UTF-8?B?UkZRIOKAkyBicmFja2V0?=")).toBe("RFQ – bracket");
    expect(decodeEncodedWords("=?iso-8859-1?Q?Fl=E4che_6061?= rev B")).toBe("Fläche 6061 rev B");
    expect(decodeEncodedWords("=?utf-8?q?a?= =?utf-8?q?b?=")).toBe("ab");
    expect(decodeEncodedWords("plain text")).toBe("plain text");
  });

  it("reads quoted, escaped and RFC 2231 continued parameters", () => {
    const v = parseHeaderValue(
      `attachment; filename*0*=utf-8''Br%C3%BCcke; filename*1=".pdf"; size=12`,
    );
    expect(v.value).toBe("attachment");
    expect(v.params.filename).toBe("Brücke.pdf");
    expect(parseHeaderValue(`multipart/mixed; boundary="a;b \\"c\\""`).params.boundary).toBe(
      'a;b "c"',
    );
  });

  it("finds the address in display-name forms", () => {
    expect(addressOf('"Pat Buyer" <Pat@Example.COM>')).toBe("pat@example.com");
    expect(addressOf("pat@example.com")).toBe("pat@example.com");
    expect(addressOf("undisclosed-recipients:;")).toBeNull();
  });
});

describe("bodies", () => {
  it("decodes quoted-printable soft breaks and hex escapes", () => {
    const out = new TextDecoder().decode(decodeQuotedPrintable("Qty 50=\r\n0 pcs =C2=B1.005\r\n"));
    expect(out).toBe("Qty 500 pcs ±.005\r\n");
  });

  it("turns HTML into text without markup, skipping style and script", () => {
    const text = htmlToText(
      "<html><head><style>p{color:red}</style></head><body><p>Part <b>BR-100</b> Rev&nbsp;C</p>" +
        "<script>alert(1)</script><table><tr><td>Qty</td><td>250</td></tr></table>&plusmn;0.005&#176;</body></html>",
    );
    expect(text).not.toContain("<");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("alert");
    expect(text).toContain("Part BR-100 Rev C");
    expect(text).toContain("Qty\t250");
    expect(text).toContain("±0.005°");
  });
});

describe("parseEmail", () => {
  it("reads a plain message with headers", () => {
    const e = parseEmail(
      crlf([
        "From: Pat Buyer <pat@example.com>",
        "Subject: =?utf-8?Q?RFQ_=E2=80=93_BR-100?=",
        "Message-ID: <abc@example.com>",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Please quote 250 pcs of BR-100 Rev C.",
      ]),
    );
    expect(e.subject).toBe("RFQ – BR-100");
    expect(addressOf(e.from)).toBe("pat@example.com");
    expect(e.messageId).toBe("<abc@example.com>");
    expect(e.text).toBe("Please quote 250 pcs of BR-100 Rev C.");
    expect(e.attachments).toEqual([]);
    expect(e.references).toBeNull();
  });

  it("reads a folded References header and In-Reply-To", () => {
    const e = parseEmail(
      crlf([
        "From: pat@example.com",
        "Message-ID: <c@example.com>",
        "In-Reply-To: <b@example.com>",
        "References: <a@example.com>",
        " <b@example.com>",
        "",
        "Revised drawing attached.",
      ]),
    );
    expect(e.inReplyTo).toBe("<b@example.com>");
    expect(e.references?.match(/<[^>]+>/g)).toEqual(["<a@example.com>", "<b@example.com>"]);
  });

  it("prefers text/plain in multipart/alternative and keeps base64 attachments byte-exact", () => {
    const pdf = "%PDF-1.4\n\x00\xff binary";
    const pdfB64 = btoa(pdf);
    const e = parseEmail(
      crlf([
        "From: pat@example.com",
        "Subject: RFQ",
        'Content-Type: multipart/mixed; boundary="outer"',
        "",
        "preamble",
        "--outer",
        'Content-Type: multipart/alternative; boundary="alt"',
        "",
        "--alt",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: base64",
        "",
        b64("Quote 10 pcs, 6061-T6, anodize."),
        "--alt",
        "Content-Type: text/html",
        "",
        "<p>Quote 10 pcs</p>",
        "--alt--",
        "--outer",
        'Content-Type: application/pdf; name="BR-100.pdf"',
        'Content-Disposition: attachment; filename="BR-100.pdf"',
        "Content-Transfer-Encoding: base64",
        "",
        pdfB64.slice(0, 10),
        pdfB64.slice(10),
        "--outer--",
        "epilogue",
      ]),
    );
    expect(e.text).toBe("Quote 10 pcs, 6061-T6, anodize.");
    expect(e.attachments).toHaveLength(1);
    const a = e.attachments[0];
    expect(a?.fileName).toBe("BR-100.pdf");
    expect(a?.contentType).toBe("application/pdf");
    expect(Array.from(a?.bytes ?? [])).toEqual(Array.from(pdf, (c) => c.charCodeAt(0)));
    expect(e.notes).toEqual([]);
  });

  it("falls back to the HTML body when there is no text part, with LF-only line ends", () => {
    const e = parseEmail(
      enc(
        [
          "Content-Type: multipart/alternative; boundary=b1",
          "",
          "--b1",
          "Content-Type: text/html; charset=windows-1252",
          "Content-Transfer-Encoding: quoted-printable",
          "",
          "<div>Material: 304 stainless =B1.010</div>",
          "--b1--",
        ].join("\n"),
      ),
    );
    expect(e.text).toBe("Material: 304 stainless ±.010");
  });

  it("reads a forwarded message/rfc822 attachment: its text and its own attachments", () => {
    const inner = [
      "From: Customer <buyer@customer.example>",
      "Subject: RFQ 4471",
      'Content-Type: multipart/mixed; boundary="in"',
      "",
      "--in",
      "Content-Type: text/plain",
      "",
      "Need 25 brackets.",
      "--in",
      'Content-Type: application/step; name="bracket.step"',
      "Content-Transfer-Encoding: base64",
      "",
      b64("ISO-10303-21;"),
      "--in--",
    ].join("\r\n");
    const e = parseEmail(
      crlf([
        "From: estimator@shop.example",
        'Content-Type: multipart/mixed; boundary="out"',
        "",
        "--out",
        "Content-Type: text/plain",
        "",
        "FYI see attached",
        "--out",
        "Content-Type: message/rfc822",
        "",
        inner,
        "--out--",
      ]),
    );
    expect(e.text).toContain("FYI see attached");
    expect(e.text).toContain("From: Customer <buyer@customer.example>");
    expect(e.text).toContain("Need 25 brackets.");
    expect(e.attachments.map((a) => a.fileName)).toEqual(["bracket.step"]);
  });

  it("notes winmail.dat and broken multiparts instead of failing", () => {
    const e = parseEmail(
      crlf([
        'Content-Type: multipart/mixed; boundary="x"',
        "",
        "--x",
        "Content-Type: text/plain",
        "",
        "hello",
        "--x",
        'Content-Type: application/ms-tnef; name="winmail.dat"',
        "",
        "junk",
        "--x",
        "Content-Type: multipart/related",
        "",
        "no boundary here",
        "--x--",
      ]),
    );
    expect(e.text).toBe("hello");
    expect(e.attachments).toEqual([]);
    expect(e.notes.join(" ")).toContain("winmail.dat");
    expect(e.notes.join(" ")).toContain("no readable boundary");
  });

  it("stops after MAX_PARTS parts", () => {
    const lines = ['Content-Type: multipart/mixed; boundary="m"', ""];
    for (let i = 0; i < MAX_PARTS + 20; i++) {
      lines.push("--m", "Content-Type: text/plain", "", `p${i}`);
    }
    lines.push("--m--");
    const e = parseEmail(crlf(lines));
    expect(e.notes.some((n) => n.includes(`first ${MAX_PARTS}`))).toBe(true);
  });

  it("strips path separators and control characters from attachment names", () => {
    const e = parseEmail(
      crlf([
        'Content-Type: multipart/mixed; boundary="z"',
        "",
        "--z",
        'Content-Disposition: attachment; filename="../../etc/pa\tss.pdf"',
        "Content-Type: application/pdf",
        "",
        "%PDF",
        "--z--",
      ]),
    );
    expect(e.attachments[0]?.fileName).toBe(".._.._etc_pass.pdf");
  });

  it("never throws on garbage", () => {
    expect(() => parseEmail(enc("\x00\x01 not an email"))).not.toThrow();
    expect(parseEmail(new Uint8Array()).text).toBe("");
  });
});
