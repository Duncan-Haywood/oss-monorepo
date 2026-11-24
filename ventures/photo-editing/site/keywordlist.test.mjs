import test from "node:test";
import assert from "node:assert/strict";
import { parseKeywordList, keywordVocabulary, resolveKeywords, keywordListText } from "./keywordlist.mjs";
import { frameIptc, mergeIptc, readIptc } from "./iptc.mjs";

// The layout Lightroom Classic's Metadata › Export Keywords writes (tabs,
// [not exported], {synonym}), with a BOM and CRLF line ends.
const LIST = "\uFEFF" + [
  "[People]",
  "\tJane Roe",
  "\t\t{Jane}",
  "\tJohn Roe",
  "Places",
  "\tYorkshire",
  "\t\tLeeds",
  "\t\t\t{Leodis}",
  "Sport",
  "\tIce hockey",
  "\t\t{hockey}",
  "\t\tFinal",
  "\tFootball",
  "\t\tFinal",
  "",
].join("\r\n");

test("parseKeywordList reads levels, [unexported] keywords and {synonyms}", () => {
  const { nodes, notes } = parseKeywordList(LIST);
  assert.deepEqual(notes, []);
  assert.deepEqual(nodes.map((n) => n.path), ["People", "People|Jane Roe", "People|John Roe", "Places", "Places|Yorkshire", "Places|Yorkshire|Leeds", "Sport", "Sport|Ice hockey", "Sport|Ice hockey|Final", "Sport|Football", "Sport|Football|Final"]);
  assert.equal(nodes[0].exported, false);
  assert.equal(nodes[1].exported, true);
  assert.deepEqual(nodes[1].synonyms, ["Jane"]);
  assert.deepEqual(nodes[5].synonyms, ["Leodis"]);
});

test("parseKeywordList notes what it had to guess", () => {
  const { nodes, notes } = parseKeywordList("{orphan}\nA\n\t\t\tDeep\nAC|DC\nA\n\t[Deep]\n");
  assert.deepEqual(nodes.map((n) => n.path), ["A", "A|Deep", "AC/DC"]);
  assert.equal(nodes[1].exported, false); // listed again in brackets
  assert.deepEqual(notes.map((n) => n.line), [1, 3, 4]);
  // Space-indented, no tabs anywhere: the smallest indent is one level.
  assert.deepEqual(parseKeywordList("A\n  B\n    C\n  D\n").nodes.map((n) => n.path), ["A", "A|B", "A|B|C", "A|D"]);
});

test("resolveKeywords turns names and synonyms into paths and reports the rest", () => {
  const v = keywordVocabulary(parseKeywordList(LIST));
  const r = resolveKeywords(["ice HOCKEY", "Leodis", "Jane", "Final", "Ice hockey|final", "Gretzky", "Sport > Football"], v);
  assert.deepEqual(r.keywords, ["Sport|Ice hockey", "Places|Yorkshire|Leeds", "People|Jane Roe", "Final", "Sport|Ice hockey|Final", "Gretzky", "Sport|Football"]);
  assert.deepEqual(r.synonyms, ["hockey", "Leodis", "Jane"]);
  assert.deepEqual(r.hidden, ["People"]);
  assert.deepEqual(r.unknown, ["Gretzky"]);
  assert.deepEqual(r.ambiguous, [{ typed: "Final", paths: ["Sport|Ice hockey|Final", "Sport|Football|Final"] }]);
  // No list: keywords pass through.
  assert.deepEqual(resolveKeywords(["a", "b|c"], null).keywords, ["a", "b|c"]);
});

test("a resolved frame writes the tree, synonyms and no unexported level into the sidecar", () => {
  const v = keywordVocabulary(parseKeywordList(LIST));
  const f = frameIptc({ keywords: "hockey" }, { name: "a.nef", keywords: ["Jane Roe", "Leeds"] }, null, (kw) => resolveKeywords(kw, v));
  assert.deepEqual(f.keywords, ["Sport|Ice hockey", "People|Jane Roe", "Places|Yorkshire|Leeds"]);
  const side = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:subject><rdf:Bag><rdf:li>landscape</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const out = mergeIptc(side, f);
  const bag = (name) => [...out.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))[1].matchAll(/<rdf:li>([^<]*)<\/rdf:li>/g)].map((m) => m[1]);
  assert.deepEqual(bag("dc:subject"), ["landscape", "Sport", "Ice hockey", "Jane Roe", "Places", "Yorkshire", "Leeds", "hockey", "Jane", "Leodis"]);
  assert.deepEqual(bag("lr:hierarchicalSubject"), ["Sport|Ice hockey", "People|Jane Roe", "Places|Yorkshire|Leeds", "landscape"]);
  assert.doesNotMatch(out, /synonyms|hidden/);
  assert.deepEqual(readIptc(out).keywords.slice(0, 3), ["Sport|Ice hockey", "People|Jane Roe", "Places|Yorkshire|Leeds"]);
});

test("keywordListText writes Lightroom's layout and round-trips a loaded list", () => {
  const v = keywordVocabulary(parseKeywordList(LIST));
  const all = v.nodes.map((n) => n.path);
  const text = keywordListText(all, v);
  assert.equal(text, LIST.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\n$/, "") + "\n");
  assert.equal(keywordListText(["Events|Wedding", "events|Party", "loose"]), "Events\n\tWedding\n\tParty\nloose\n");
  assert.equal(keywordListText([]), "");
});
