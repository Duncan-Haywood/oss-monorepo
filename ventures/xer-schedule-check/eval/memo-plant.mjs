// A seeded generator of P6 rich-text memos (notebook entries, resource notes)
// in the three forms P6 writes: P6 desktop's DHTML with 0x7F line breaks, P6
// Web's <HTML><BODY><P>, and plain text. Each comes with the text a reader
// should see (`want`, normalised by norm). Shared by notebooks-check.mjs and
// resource-notes-check.mjs.
export const norm = (s) => String(s ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();

// --- seeded generator -------------------------------------------------------
export function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32); }
const WORDS = ["pour", "slab", "after", "cube", "results", "rebar", "inspection", "RFI", "12", "crane", "lift", "façade", "café", "–", "°C", "50%", "a&b", "<16mm>", '"hold"', "client's", "ok", "level", "3", "Ünit", "pump"];
export function plantEntry(r) {
  const sentence = () => Array.from({ length: 2 + Math.floor(r() * 7) }, () => WORDS[Math.floor(r() * WORDS.length)]).join(" ");
  // a tab is the XER's field separator, so P6 cannot hold one raw: in HTML it is &#9;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/°/g, () => (r() < 0.5 ? "&#176;" : "°")).replace(/\t/g, "&#9;");
  const blocks = []; // [kind, text lines]
  const n = 1 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const k = r();
    if (k < 0.15 && i > 0) blocks.push(["heading-like", [`[see RFI ${1 + Math.floor(r() * 90)}]`]]);
    else if (k < 0.3) blocks.push(["list", Array.from({ length: 2 + Math.floor(r() * 3) }, sentence)]);
    else if (k < 0.45) blocks.push(["br", [sentence(), sentence()]]);
    else if (k < 0.55) blocks.push(["tab", [`${sentence()}\t${sentence()}`]]); // plain form: a space
    else blocks.push(["p", [sentence()]]);
  }
  const form = r() < 0.4 ? "desktop" : r() < 0.75 ? "web" : "plain";
  const want = [];
  const html = [];
  blocks.forEach(([kind, lines], i) => {
    if (kind === "heading-like" && form !== "plain") { html.push("<P>&nbsp;</P>"); want.push(""); }
    if (kind === "heading-like" && form === "plain") want.push("");
    for (const l of lines) want.push(kind === "list" ? `- ${l}` : l.replace(/\t/g, " "));
    if (form === "plain") return;
    const inl = (s) => { const w = esc(s).split(" "); if (w.length > 2 && r() < 0.4) w[1] = `<B>${w[1]}</B>`; if (w.length > 3 && r() < 0.3) w[2] = `<I>${w[2]}</I>`; return w.join(" "); };
    if (kind === "list") html.push(`<UL>${lines.map((l) => `<LI>${inl(l)}</LI>`).join(form === "desktop" ? "\x7f\x7f" : "")}</UL>`);
    else if (kind === "br") html.push(`<P>${inl(lines[0])}<BR>${inl(lines[1])}</P>`);
    else html.push(`<P>${inl(lines[0])}</P>`);
  });
  let memo;
  if (form === "plain") memo = want.join("\x7f\x7f").replace(/^- /gm, "- ");
  else if (form === "desktop") memo = `<HTML>\x7f\x7f<HEAD>\x7f\x7f<META NAME="GENERATOR" Content="Microsoft DHTML Editing Control">\x7f\x7f<TITLE></TITLE>\x7f\x7f</HEAD>\x7f\x7f<BODY bgColor=#ffffff>\x7f\x7f${html.join("\x7f\x7f")}\x7f\x7f</BODY>\x7f\x7f</HTML>`;
  else memo = `<HTML><BODY>${html.join("")}</BODY></HTML>`;
  if (form === "plain") memo = memo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\t/g, " ");
  return { memo, want: norm(want.join("\n")), form };
}
