#!/usr/bin/env node
// Every class/standard-set pair the editor offers, IFC4 and IFC4X3: how many
// sets the templates give only to some predefined types (schema/psets-*.json
// `pt`), and whether the audit and the editor agree on each one:
//
//   - written with no predefinedType: the audit warns pset-predefined;
//   - written with the set's type (what the editor fills in when the limit is
//     one type): the audit says nothing about it (no error, no warning);
//   - written with another of the class's types: warned, and the editor no
//     longer offers the set once that type is chosen.
//
//   node eval/predefined-sets.mjs > eval/predefined-sets.txt
import { resources } from "../node.mjs";
import { parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { classesWithSets, setsFor, setTypeLimit, commonSets, predefinedTypes, propertiesOf } from "../editor.mjs";

const R = resources();
const V = { IFC4: "IFC4", IFC4X3: "IFC4X3_ADD2" };
const xml = (ver, cls, pt, set, prop) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="s" ifcVersion="${ver}"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>${cls}</simpleValue></name>${pt ? `<predefinedType><simpleValue>${pt}</simpleValue></predefinedType>` : ""}</entity></applicability><requirements><property${prop.dataType ? ` dataType="${prop.dataType}"` : ""}><propertySet><simpleValue>${set}</simpleValue></propertySet><baseName><simpleValue>${prop.name}</simpleValue></baseName></property></requirements></specification></specifications></ids>`;
const codes = (t) => auditIds(parseIds(t), R).map((x) => x.code);

for (const id of ["IFC4", "IFC4X3"]) {
  const L = { S: R.schemas[id], psets: R.psets[id], tm: null };
  const withPt = Object.values(L.psets).filter((s) => s.pt).length;
  let pairs = 0, limited = 0, single = 0, multi = 0, okNone = 0, okRight = 0, okOther = 0, otherHidden = 0, otherTried = 0, noProp = 0, objType = 0;
  const bad = [];
  for (const cls of classesWithSets(L.psets, L.S)) {
    for (const set of setsFor(L.psets, L.S, cls)) {
      pairs++;
      const lim = setTypeLimit(L, set, [cls]);
      if (!lim) continue;
      limited++;
      lim.length === 1 ? single++ : multi++;
      const prop = propertiesOf(L.psets, L.S, set)[0];
      if (!prop) { noProp++; continue; }
      const none = codes(xml(V[id], cls, null, set, prop));
      if (none.includes("pset-predefined")) okNone++; else bad.push(`${cls} ${set}: no type, not warned (${none.join(",") || "nothing"})`);
      const types = predefinedTypes(L.S, cls);
      const right = lim.find((v) => types.includes(v));
      if (right) {
        const c = codes(xml(V[id], cls, right, set, prop));
        if (c.length === 0) okRight++; else bad.push(`${cls}/${right} ${set}: ${c.join(",")}`);
      } else objType++; // an ObjectType-style limit (IFC4 "Wire loop"): not an enumeration member, nothing to fill in
      const other = types.find((v) => !lim.some((x) => x.toLowerCase() === v.toLowerCase()) && v !== "USERDEFINED" && v !== "NOTDEFINED");
      if (other) {
        otherTried++;
        if (codes(xml(V[id], cls, other, set, prop)).includes("pset-predefined")) okOther++; else bad.push(`${cls}/${other} ${set}: other type, not warned`);
        if (!commonSets(L, [cls], other).includes(set)) otherHidden++; else bad.push(`${cls}/${other} ${set}: still offered`);
      }
    }
  }
  console.log(`${id}: ${withPt} of ${Object.keys(L.psets).length} standard sets limited to predefined types somewhere`);
  console.log(`  editor offers ${pairs} class/set pairs; ${limited} limited on that class (${single} to one type, ${multi} to several; ${noProp} with no property, skipped)`);
  console.log(`  no predefinedType: warned ${okNone} of ${limited - noProp}`);
  console.log(`  the set's own type: audit clean ${okRight} of ${limited - noProp - objType} (${objType} limited to ObjectType text such as \"Wire loop\", not an enumeration member: not filled in)`);
  console.log(`  another type: warned ${okOther} of ${otherTried}; set hidden by the editor ${otherHidden} of ${otherTried}`);
  for (const b of bad.slice(0, 20)) console.log("  MISMATCH " + b);
  if (bad.length > 20) console.log(`  ... ${bad.length - 20} more`);
}
