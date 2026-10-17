// Builds small PDFs for the tests: a statement laid out as positioned text,
// in three encodings real banks use. Test-only; the page never imports it.
import zlib from 'node:zlib';

const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function layout(text, { colWidth = 5.4, lineHeight = 14, top = 780 } = {}) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    const re = /\S+(?: \S+)*/g;
    let m;
    while ((m = re.exec(raw))) out.push({ text: m[0], x: 36 + m.index * colWidth, y: top - i * lineHeight });
  });
  return out;
}

function hex2(s) { return [...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join(''); }

/** mode: 'plain' (Helvetica, literal strings), 'tounicode' (Type0 Identity-H + ToUnicode CMap, hex glyph ids),
 *  'objstm' (plain fonts, but page/font objects inside a compressed object stream). */
export function buildStatementPdf(text, { mode = 'plain', compress = true, encrypt = false, pages = 1 } = {}) {
  const items = layout(text);
  const per = Math.ceil(items.length / pages);
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const streamObj = (dict, data) => {
    const raw = Buffer.from(data, 'latin1');
    const body = compress ? zlib.deflateSync(raw) : raw;
    const d = `<< ${dict} ${compress ? '/Filter /FlateDecode ' : ''}/Length ${body.length} >>`;
    return Buffer.concat([Buffer.from(`${d}\nstream\n`, 'latin1'), body, Buffer.from('\nendstream', 'latin1')]);
  };

  // glyph ids for the ToUnicode variant: code = char code - 31
  const glyphs = new Map();
  const gid = (ch) => { if (!glyphs.has(ch)) glyphs.set(ch, glyphs.size + 1); return glyphs.get(ch); };

  const contents = [];
  for (let p = 0; p < pages; p++) {
    const slice = items.slice(p * per, (p + 1) * per);
    let c = 'BT\n/F1 9 Tf\n';
    for (const it of slice) {
      if (mode === 'tounicode') c += `1 0 0 1 ${it.x.toFixed(2)} ${it.y} Tm <${[...it.text].map((ch) => gid(ch).toString(16).padStart(4, '0')).join('')}> Tj\n`;
      else c += `1 0 0 1 ${it.x.toFixed(2)} ${it.y} Tm (${esc(it.text)}) Tj\n`;
    }
    contents.push(`${c}ET\n`);
  }

  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesIdx = add(''); // placeholder, filled below
  const fontIdx = add('');  // placeholder
  const pageIdx = [];
  const contentIdx = [];
  for (let p = 0; p < pages; p++) {
    contentIdx.push(add(streamObj('', contents[p])));
    pageIdx.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontIdx} 0 R >> >> /Contents ${contentIdx[p]} 0 R >>`));
  }
  objs[pagesIdx - 1] = `<< /Type /Pages /Kids [${pageIdx.map((i) => `${i} 0 R`).join(' ')}] /Count ${pages} >>`;
  if (mode === 'tounicode') {
    const bf = [...glyphs].map(([ch, id]) => `<${id.toString(16).padStart(4, '0')}> <${hex2(ch)}>`);
    const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${bf.length} beginbfchar\n${bf.join('\n')}\nendbfchar\nendcmap end end`;
    const tu = add(streamObj('', cmap));
    const desc = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Sub /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>');
    objs[fontIdx - 1] = `<< /Type /Font /Subtype /Type0 /BaseFont /Sub /Encoding /Identity-H /DescendantFonts [${desc} 0 R] /ToUnicode ${tu} 0 R >>`;
  } else {
    objs[fontIdx - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  }

  const parts = [Buffer.from('%PDF-1.5\n', 'latin1')];
  let useObjStm = false;
  if (mode === 'objstm') {
    useObjStm = true;
  }
  const emit = (n, body) => {
    parts.push(Buffer.from(`${n} 0 obj\n`, 'latin1'));
    parts.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
    parts.push(Buffer.from('\nendobj\n', 'latin1'));
  };
  const inStm = [];
  objs.forEach((body, i) => {
    const n = i + 1;
    if (useObjStm && typeof body === 'string' && n !== 0) inStm.push([n, body]);
    else emit(n, body);
  });
  let next = objs.length + 1;
  if (inStm.length) {
    let header = '', bodies = '';
    for (const [n, body] of inStm) { header += `${n} ${bodies.length} `; bodies += `${body} `; }
    const data = header + bodies;
    emit(next++, streamObj(`/Type /ObjStm /N ${inStm.length} /First ${header.length}`, data));
  }
  parts.push(Buffer.from(`trailer\n<< /Root ${catalog} 0 R /Size ${next}${encrypt ? ' /Encrypt 99 0 R' : ''} >>\n%%EOF\n`, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}

export async function inflate(bytes) {
  try { return new Uint8Array(zlib.inflateSync(Buffer.from(bytes))); } catch { return null; }
}
