// BCF 2.1 export of a checkIds() report: one topic per failing element, with a
// viewpoint that selects the element by its IfcGuid, so the issue list opens in
// BIM tools (Revit, Navisworks, Solibri, BIMcollab, BlenderBIM) on the element.
// A minimal stored (uncompressed) zip writer is included; no dependencies.

const enc = new TextEncoder();

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{name, data: Uint8Array|string}] -> Uint8Array (zip, stored)
export function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const head = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(head, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += head.length + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

const xml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function uuid() {
  const c = globalThis.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function bcfZip(report, { modelName = "model.ifc", author = "ids-model-check", date = new Date().toISOString(), maxTopics = 2000 } = {}) {
  const files = [{ name: "bcf.version", data: `<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>\n` }];
  const projectId = uuid();
  files.push({ name: "project.bcfp", data: `<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension><Project ProjectId="${projectId}"><Name>${xml(report.title || "IDS check")}</Name></Project><ExtensionSchema></ExtensionSchema></ProjectExtension>\n` });
  let n = 0;
  for (const s of report.specs) {
    const failures = s.failed.length ? s.failed : s.status === "fail" ? [{ id: null, type: null, globalId: null, name: null, reasons: [s.note || "specification failed"] }] : [];
    for (const f of failures) {
      if (n >= maxTopics) break;
      n++;
      const tid = uuid();
      const vid = uuid();
      const title = f.globalId ? `${s.name}: ${f.type}${f.name ? " " + f.name : ""}` : s.name;
      const desc = f.reasons.join("\n");
      files.push({
        name: `${tid}/markup.bcf`,
        data: `<?xml version="1.0" encoding="UTF-8"?>
<Markup>
  <Header><File IfcProject="" isExternal="true"><Filename>${xml(modelName)}</Filename><Date>${xml(date)}</Date></File></Header>
  <Topic Guid="${tid}" TopicType="Issue" TopicStatus="Open">
    <Title>${xml(title.slice(0, 250))}</Title>
    <Labels>IDS</Labels>
    <CreationDate>${xml(date)}</CreationDate>
    <CreationAuthor>${xml(author)}</CreationAuthor>
    <Description>${xml(desc)}</Description>
  </Topic>
  ${f.globalId ? `<Viewpoints Guid="${vid}"><Viewpoint>viewpoint.bcfv</Viewpoint></Viewpoints>` : ""}
</Markup>
`,
      });
      if (f.globalId) {
        files.push({
          name: `${tid}/viewpoint.bcfv`,
          data: `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="${vid}">
  <Components>
    <Selection><Component IfcGuid="${xml(f.globalId)}"/></Selection>
    <Visibility DefaultVisibility="true"/>
  </Components>
</VisualizationInfo>
`,
        });
      }
    }
  }
  return zipStore(files);
}
