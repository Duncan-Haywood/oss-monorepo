import test from "node:test";
import assert from "node:assert/strict";
import { frameVars, expandTemplate, frameIptc, mergeIptc, readIptc, splitKeywords, keywordTree, normalizeKeyword, parseCodes, applyCodes } from "./iptc.mjs";
import { xmpSidecar, mergeXmpSidecar, readXmp } from "./rawpreview.mjs";

const LR = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
   xmp:Rating="2"
   photoshop:City="Leeds"
   crs:Exposure2012="+0.35">
   <dc:subject>
    <rdf:Bag>
     <rdf:li>wedding &amp; rings</rdf:li>
     <rdf:li>Bride</rdf:li>
    </rdf:Bag>
   </dc:subject>
   <dc:title>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">Old title</rdf:li>
     <rdf:li xml:lang="fr-FR">Ancien titre</rdf:li>
    </rdf:Alt>
   </dc:title>
   <crs:ToneCurvePV2012>
    <rdf:Seq>
     <rdf:li>0, 0</rdf:li>
     <rdf:li>255, 255</rdf:li>
    </rdf:Seq>
   </crs:ToneCurvePV2012>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;

const FRAME = {
  name: "DSC_0412.NEF", seq: 7,
  meta: { captured: "2026:06:14 15:02:09", make: "NIKON CORPORATION", model: "NIKON D850", lens: "24-70mm f/2.8", iso: 400, fNumber: 2.8, exposureTime: 0.004, focalLength: 50 },
};

test("frameVars reads date, camera and exposure from the frame", () => {
  const v = frameVars(FRAME);
  assert.equal(v.date, "2026-06-14");
  assert.equal(v.year, "2026");
  assert.equal(v.monthname, "June");
  assert.equal(v.time, "15:02:09");
  assert.equal(v.stem, "DSC_0412");
  assert.equal(v.aperture, "f/2.8");
  assert.equal(v.shutter, "1/250 s");
  assert.equal(v.focal, "50 mm");
  assert.equal(v.seq, "7");
  assert.equal(v.camera, "NIKON D850");
  assert.equal(frameVars({ meta: { captured: "2026:06:04 01:02:03" } }).day, "4");
});

test("expandTemplate fills known variables and keeps unknown ones visible", () => {
  const v = frameVars(FRAME);
  assert.equal(expandTemplate("© {year} Jane Doe", v), "© 2026 Jane Doe");
  assert.equal(expandTemplate("{Date} {nope}", v), "2026-06-14 {nope}");
});

test("splitKeywords splits, trims and drops case duplicates", () => {
  assert.deepEqual(splitKeywords("a, B;b\n c  d ,,"), ["a", "B", "c d"]);
});

test("frameIptc resolves a template and adds the frame's own keywords", () => {
  const f = frameIptc({ caption: "Finals on {date}, frame {seq}", creator: "Jane Doe", copyright: "© {year} Jane Doe", keywords: "athletics, {year}", city: "" },
    { ...FRAME, keywords: ["100 m", "Athletics"] });
  assert.deepEqual(f, { caption: "Finals on 2026-06-14, frame 7", creator: "Jane Doe", copyright: "© 2026 Jane Doe", keywords: ["athletics", "2026", "100 m"] });
});

test("mergeIptc into a fresh sidecar: every field reads back, rating kept", () => {
  const fields = {
    headline: "Gold for Leeds", title: "Final", caption: 'Runners "cross" the line & celebrate <3',
    keywords: ["athletics", "finals"], creator: "Jane Doe; John Roe", copyright: "© 2026 Jane Doe",
    credit: "Jane Doe Photo", source: "Own", location: "Main stadium", city: "Leeds", state: "West Yorkshire",
    country: "United Kingdom", instructions: "No archive sales",
  };
  const out = mergeIptc(xmpSidecar({ rating: 4, label: "Green" }), fields);
  assert.deepEqual(readXmp(out), { rating: 4, label: "Green" });
  assert.deepEqual(readIptc(out), { ...fields, creator: "Jane Doe; John Roe" });
  assert.match(out, /<dc:creator>\s*<rdf:Seq>\s*<rdf:li>Jane Doe<\/rdf:li>\s*<rdf:li>John Roe<\/rdf:li>/);
  assert.match(out, /xmlns:Iptc4xmpCore="http:\/\/iptc.org\/std\/Iptc4xmpCore\/1.0\/xmlns\/"/);
  assert.ok(!/<rdf:Description[^>]*\/>/.test(out), "self-closing Description was opened");
});

test("mergeIptc into a Lightroom sidecar keeps develop settings, other languages and old keywords", () => {
  const rated = mergeXmpSidecar(LR, { rating: 5, label: "Red" });
  const out = mergeIptc(rated, { title: "New title", keywords: ["BRIDE", "first dance"], city: "York", caption: "Cake" });
  const r = readIptc(out);
  assert.equal(r.title, "New title");
  assert.deepEqual(r.keywords, ["wedding & rings", "Bride", "first dance"]);
  assert.equal(r.city, "York");
  assert.equal(r.caption, "Cake");
  assert.match(out, /xml:lang="fr-FR">Ancien titre</);
  assert.match(out, /crs:Exposure2012="\+0.35"/);
  assert.match(out, /<crs:ToneCurvePV2012>\s*<rdf:Seq>\s*<rdf:li>0, 0<\/rdf:li>/);
  assert.deepEqual(readXmp(out), { rating: 5, label: "Red" });
  // City was an attribute: replaced in place, not duplicated.
  assert.equal(out.match(/photoshop:City/g).length, 1);
});

test("mergeIptc with nothing to write returns the sidecar unchanged; non-XMP gives null", () => {
  assert.equal(mergeIptc(LR, {}), LR);
  assert.equal(mergeIptc(LR, { keywords: [] }), LR);
  assert.equal(mergeIptc("not xmp", { city: "x" }), null);
});

test("mergeIptc picks another prefix when dc is bound to something else", () => {
  const odd = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="urn:other" dc:x="1"/></rdf:RDF></x:xmpmeta>`;
  const out = mergeIptc(odd, { keywords: ["k"] });
  assert.match(out, /xmlns:dc2="http:\/\/purl.org\/dc\/elements\/1.1\/"/);
  assert.deepEqual(readIptc(out).keywords, ["k"]);
});

test("readIptc loads a template from a captioned sidecar", () => {
  const r = readIptc(LR);
  assert.deepEqual(r, { title: "Old title", keywords: ["wedding & rings", "Bride"], city: "Leeds" });
  assert.equal(readIptc("plain text"), null);
});

test("keywordTree splits paths into levels and keeps flat keywords in the tree", () => {
  const t = keywordTree(["Sport > Ice hockey", "Sport|Ice hockey|Final", "Leeds", "sport", "Ice hockey"]);
  assert.deepEqual(t.flat, ["Sport", "Ice hockey", "Final", "Leeds"]);
  assert.deepEqual(t.paths, ["Sport|Ice hockey", "Sport|Ice hockey|Final", "Leeds"]);
  assert.deepEqual(keywordTree(["a", "b"]), { flat: ["a", "b"], paths: [] });
  assert.equal(normalizeKeyword(" Places |  Leeds  | "), "Places|Leeds");
  assert.equal(normalizeKeyword("Rock>Roll"), "Rock>Roll"); // ">" needs spaces round it to be a level break
});

test("mergeIptc writes lr:hierarchicalSubject next to every level in dc:subject", () => {
  const out = mergeIptc(LR, { keywords: ["Sport|Ice hockey", "Bride"] });
  const back = readIptc(out);
  assert.deepEqual(back.keywords, ["Sport|Ice hockey", "wedding & rings", "Bride"]);
  const subj = /<dc:subject>([\s\S]*?)<\/dc:subject>/.exec(out)[1];
  assert.deepEqual([...subj.matchAll(/<rdf:li>([^<]*)</g)].map((m) => m[1]), ["wedding &amp; rings", "Bride", "Sport", "Ice hockey"]);
  assert.match(out, /xmlns:lr="http:\/\/ns.adobe.com\/lightroom\/1.0\/"/);
  const hs = /<lr:hierarchicalSubject>([\s\S]*?)<\/lr:hierarchicalSubject>/.exec(out)[1];
  assert.deepEqual([...hs.matchAll(/<rdf:li>([^<]*)</g)].map((m) => m[1]), ["Sport|Ice hockey", "wedding &amp; rings", "Bride"]);
  // A second pass adds to the existing tree without duplicating it.
  const again = mergeIptc(out, { keywords: ["Sport|Ice hockey|Final", "Places|Leeds"] });
  assert.deepEqual(readIptc(again).keywords, ["Sport|Ice hockey", "Sport|Ice hockey|Final", "Places|Leeds", "wedding & rings", "Bride"]);
  assert.equal((again.match(/<lr:hierarchicalSubject>/g) || []).length, 1);
  // Flat keywords only: no tree is written.
  assert.doesNotMatch(mergeIptc(LR, { keywords: ["a"] }), /hierarchicalSubject/);
  assert.match(again, /crs:Exposure2012="\+0.35"/);
});

test("codes replace \\code\\ in fields, frame keywords and frame captions", () => {
  const codes = parseCodes("23\tJane Roe (Leeds, 23)\tRoe\nLDS=Leeds United\n\nno separator here\nbad code\tx\n");
  assert.equal(codes.size, 2);
  assert.equal(applyCodes("\\23\\ beats \\99\; \\23#2\\, \\23#3\\, \\lds\\", codes), "Jane Roe (Leeds, 23) beats \\99\; Roe, \\23#3\\, Leeds United");
  const f = frameIptc(
    { caption: "{caption} {monthname} {day}, {year}.", keywords: "\\LDS\\, Sport|Football", headline: "\\LDS\\ win" },
    { ...FRAME, caption: "\\23\\ scores {seq}.", keywords: ["\\23#2\\"] },
    codes,
  );
  assert.equal(f.caption, "Jane Roe (Leeds, 23) scores 7. June 14, 2026.");
  assert.equal(f.headline, "Leeds United win");
  assert.deepEqual(f.keywords, ["Leeds United", "Sport|Football", "Roe"]);
  // A frame caption replaces a template caption without {caption}; {caption} with none is dropped.
  assert.equal(frameIptc({ caption: "General." }, { ...FRAME, caption: "Own." }).caption, "Own.");
  assert.equal(frameIptc({ caption: "{caption}General." }, FRAME).caption, "General.");
  // The frame's own text is not expanded twice.
  assert.equal(frameIptc({ caption: "A {caption}" }, { ...FRAME, caption: "{{year}}" }).caption, "A {2026}");
});
