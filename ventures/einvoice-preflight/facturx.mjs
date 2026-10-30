// Unwrap the e-invoice XML inside a Factur-X / ZUGFeRD / XRechnung PDF.
// Mirrors src/einvoice_preflight/facturx.py. The PDF is a transport envelope;
// the invoice is the embedded file. Encrypted PDFs and scanned paper PDFs
// are refused. This is not a renderer or a profile validator.
//
// FlateDecode attachments (zlib-wrapped or raw) are inflated in the
// browser with DecompressionStream. Other filters tell the user to drop
// the XML or run the CLI.

const PREFERRED_NAMES = ["factur-x.xml", "zugferd-invoice.xml", "xrechnung.xml"];
const LATIN1 = new TextDecoder("latin1");
const UTF8 = new TextEncoder();

export function looksLikePdf(name, source) {
  if (typeof name === "string" && name.toLowerCase().endsWith(".pdf")) return true;
  const bytes = toBytes(source);
  const head = LATIN1.decode(bytes.subarray(0, 16)).replace(/^\uFEFF/, "").trimStart();
  return head.startsWith("%PDF-");
}

export function safeAttachmentLabel(name) {
  const key = String(name || "").trim().toLowerCase();
  return PREFERRED_NAMES.includes(key) ? key : "embedded invoice XML";
}

export function envelopeNote(label, syntax) {
  return `Unwrapped ${label} (${String(syntax).toUpperCase()}) from the PDF.`;
}

// Raw attachment list with each stream's object number, for rewriting one.
export function listEmbeddedFiles(source) {
  const data = toBytes(source);
  return embeddedFiles(data);
}

export async function extractEmbeddedInvoice(source) {
  const data = toBytes(source);
  if (!looksLikePdf("", data)) {
    throw new Error("The file is not a PDF.");
  }
  if (isEncrypted(data)) {
    throw new Error(
      "This PDF is encrypted. Export the Factur-X file without a password or drop the embedded XML itself.",
    );
  }
  const attachments = [];
  let inflateError = null;
  for (const attachment of embeddedFiles(data)) {
    // A PDF can carry other attachments (a report, a picture) that this reader
    // cannot inflate; they must not hide an invoice that reads fine.
    try {
      attachments.push({
        name: attachment.name,
        payload: attachment.flate ? await inflateZlib(attachment.payload) : attachment.payload,
      });
    } catch (error) {
      inflateError ||= error;
    }
  }
  if (attachments.length === 0 && inflateError) throw inflateError;
  if (attachments.length === 0) {
    throw new Error(
      "This PDF has no embedded invoice file. Factur-X, ZUGFeRD, and XRechnung PDFs carry factur-x.xml, zugferd-invoice.xml, or xrechnung.xml as an attachment. A scanned paper PDF is not an e-invoice.",
    );
  }
  const chosen = preferInvoiceAttachment(attachments);
  if (!chosen) {
    throw new Error(
      "This PDF has embedded files, but none of them is UBL or CrossIndustryInvoice XML. (ZUGFeRD 1.0 files use an older CrossIndustryDocument layout that this tool does not read.)",
    );
  }
  return { payload: chosen.payload, label: safeAttachmentLabel(chosen.name) };
}

export async function extractEmbeddedInvoiceXml(source) {
  const extracted = await extractEmbeddedInvoice(source);
  return extracted.payload;
}

export function buildPdfWithAttachment(payload, filename = "factur-x.xml", { encrypt = false, filter = "" } = {}) {
  const data = toBytes(payload);
  const filterLine = filter === "FlateDecode" ? "\n/Filter /FlateDecode" : "";
  const fname = String(filename).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const parts = [UTF8.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];

  function addObject(number, bodyBytes) {
    while (offsets.length <= number) offsets.push(0);
    offsets[number] = byteLength(parts);
    parts.push(UTF8.encode(`${number} 0 obj\n`), bodyBytes);
    if (bodyBytes[bodyBytes.length - 1] !== 10) parts.push(UTF8.encode("\n"));
    parts.push(UTF8.encode("endobj\n"));
  }

  addObject(1, UTF8.encode("<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 3 0 R >> /AF [4 0 R] >>"));
  addObject(2, UTF8.encode("<< /Type /Pages /Kids [] /Count 0 >>"));
  addObject(3, UTF8.encode(`<< /Names [(${fname}) 4 0 R] >>`));
  addObject(4, UTF8.encode(`<< /Type /Filespec /F (${fname}) /UF (${fname}) /EF << /F 5 0 R >> /AFRelationship /Data >>`));
  addObject(
    5,
    concat(
      UTF8.encode(`<< /Type /EmbeddedFile /Subtype /text#2Fxml /Length ${data.length}${filterLine} >>\nstream\n`),
      data,
      UTF8.encode("\nendstream"),
    ),
  );

  const xrefAt = byteLength(parts);
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let number = 1; number < offsets.length; number += 1) {
    xref += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
  }
  const encryptRef = encrypt ? " /Encrypt 6 0 R" : "";
  parts.push(UTF8.encode(xref));
  parts.push(UTF8.encode(`trailer\n<< /Size ${offsets.length} /Root 1 0 R${encryptRef} >>\nstartxref\n${xrefAt}\n%%EOF\n`));
  return concat(...parts);
}

function toBytes(source) {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (typeof source === "string") return UTF8.encode(source);
  return new Uint8Array(source);
}

function concat(...chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function byteLength(chunks) {
  return chunks.reduce((sum, chunk) => sum + chunk.length, 0);
}

function isEncrypted(data) {
  const text = LATIN1.decode(data);
  const trailerAt = text.lastIndexOf("trailer");
  const trailer = trailerAt === -1 ? text.slice(-2048) : text.slice(trailerAt);
  return trailer.includes("/Encrypt");
}

function embeddedFiles(data) {
  const text = LATIN1.decode(data);
  const attachments = [];
  const typeRe = /\/Type\s*\/EmbeddedFile\b/g;
  let match = typeRe.exec(text);
  while (match) {
    const objAt = text.lastIndexOf("obj", match.index);
    if (objAt !== -1) {
      const windowStart = Math.max(0, objAt - 512);
      const name = attachmentName(text.slice(windowStart, match.index + 800));
      const stream = readStreamAfter(data, text, match.index, objAt);
      const head = text.slice(Math.max(0, objAt - 24), objAt + 3).match(/(\d+)\s+(\d+)\s+obj$/);
      if (stream) pushLatest(attachments, { name, objNum: head ? Number(head[1]) : null, gen: head ? Number(head[2]) : 0, ...stream });
    }
    match = typeRe.exec(text);
  }
  return attachments;
}

// An incremental update appends a newer copy of an object; the later one wins
// and keeps the earlier copy's name when its own window has none.
function pushLatest(list, item) {
  const at = item.objNum == null ? -1 : list.findIndex((a) => a.objNum === item.objNum);
  if (at === -1) list.push(item);
  else list[at] = { ...item, name: item.name || list[at].name };
}

function attachmentName(window) {
  const names = [...window.matchAll(/\/F\s*\(([^)]+)\)/g)].map((item) => item[1]);
  if (!names.length) return "";
  return names[names.length - 1]
    .replaceAll("\\(", "(")
    .replaceAll("\\)", ")")
    .replaceAll("\\\\", "\\")
    .trim();
}

// The whole object dictionary is the header: generators put /Filter and
// /Length before or after /Type, and /Length is often an indirect "N 0 R".
function readStreamAfter(data, text, typeAt, objAt) {
  // Not the "stream" inside a MIME name such as /Subtype /application#2Foctet-stream
  // (Aspose.Words writes that): the keyword is followed by an end of line.
  const keyword = /(?<![\w#-])stream(?=\r|\n)/g;
  keyword.lastIndex = typeAt;
  const streamAt = keyword.exec(text)?.index ?? -1;
  if (streamAt === -1 || streamAt - objAt > 1024) return null;
  const header = text.slice(objAt, streamAt);
  const flate = /\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])/.test(header);
  let after = streamAt + "stream".length;
  if (text.slice(after, after + 2) === "\r\n") after += 2;
  else if (text[after] === "\n" || text[after] === "\r") after += 1;
  const length = declaredLength(text, header);
  let payload = null;
  if (length != null && /^\s*endstream/.test(text.slice(after + length, after + length + 16))) {
    payload = data.subarray(after, after + length);
  } else {
    const end = text.indexOf("endstream", after);
    if (end === -1) return null;
    payload = data.subarray(after, end);
    if (payload.length >= 2 && payload[payload.length - 2] === 13 && payload[payload.length - 1] === 10) {
      payload = payload.subarray(0, payload.length - 2);
    } else if (payload.length >= 1 && (payload[payload.length - 1] === 10 || payload[payload.length - 1] === 13)) {
      payload = payload.subarray(0, payload.length - 1);
    }
  }
  return { flate, payload };
}

function declaredLength(text, header) {
  const match = header.match(/\/Length\s+(\d+)(?:\s+(\d+)\s+R\b)?/);
  if (!match) return null;
  if (match[2] === undefined) return Number(match[1]);
  const target = text.match(new RegExp(`(?:^|[\\s>])${match[1]}\\s+${match[2]}\\s+obj\\s*(\\d+)\\s*endobj`));
  return target ? Number(target[1]) : null;
}

async function inflateZlib(payload) {
  const formats = ["deflate", "deflate-raw"];
  if (typeof DecompressionStream !== "function") {
    throw new Error(
      "The embedded invoice stream is compressed in a way this tool cannot read. Export the XML from the PDF or drop the XML file.",
    );
  }
  let lastError;
  for (const format of formats) {
    try {
      const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    "The embedded invoice stream is compressed in a way this tool cannot read. Export the XML from the PDF or drop the XML file.",
    { cause: lastError },
  );
}

function preferInvoiceAttachment(attachments) {
  const byName = new Map(attachments.map((item) => [item.name.toLowerCase(), item]));
  for (const preferred of PREFERRED_NAMES) {
    const item = byName.get(preferred);
    if (item && looksLikeInvoiceXml(item.payload)) return { payload: item.payload, name: preferred };
  }
  for (const item of attachments) {
    if (looksLikeInvoiceXml(item.payload)) return { payload: item.payload, name: item.name };
  }
  return null;
}

function looksLikeInvoiceXml(data) {
  // Official ZUGFeRD samples open with a licence comment of several KB, which
  // pushes the root element past any fixed window: drop comments first.
  const head = LATIN1.decode(data.subarray(0, 262144)).replace(/<!--[\s\S]*?-->/g, "").slice(0, 4096);
  return (
    head.includes("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2")
    || head.includes("urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2")
    || head.includes("CrossIndustryInvoice")
  );
}
