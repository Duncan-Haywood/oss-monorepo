// Sets each tsconfig option (every enum value) alone and records what tsc 5.9.3, 6.0.3 and 7.0.2 report.
// Expects ./t59, ./t6, ./t7 installs beside it (npm i typescript@<v> in each); output: option-matrix.json.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const __dirname = require('node:path').dirname(new URL(import.meta.url).pathname);
const ts=require("./t6/node_modules/typescript");
const fs=require("fs"),cp=require("child_process"),path=require("path");
const W=path.join(__dirname,"work");
const TSC={"5.9":"t59","6.0":"t6","7.0":"t7"};
const skip=new Set(["generateCpuProfile","generateTrace","project","version","init","all","composite","tsBuildInfoFile","incremental"]);
const cases=[];
for(const d of ts.optionDeclarations){ if(d.isCommandLineOnly||skip.has(d.name))continue;
  let vals;
  if(d.type==="boolean") vals=[true,false];
  else if(d.type==="string") vals=[d.name==="ignoreDeprecations"?"6.0":d.name==="charset"?"utf8":d.name==="jsxFactory"?"h":d.name==="jsxFragmentFactory"?"Fragment":d.name==="jsxImportSource"?"react":d.name==="reactNamespace"?"React":"./x"];
  else if(d.type==="number") vals=[2];
  else if(d.type==="list") vals=[d.name==="lib"?["es2020"]:d.name==="plugins"?[{name:"x"}]:d.name==="moduleSuffixes"?[".ios",""]:["./x"]];
  else if(d.type==="object") vals=[{"a/*":["./x/*"]}];
  else vals=[...d.type.keys()];
  for(const v of vals) cases.push({name:d.name,value:v});
}
cases.push({name:"references.prepend",value:true});
const out=[];
fs.writeFileSync(path.join(W,"a.ts"),"export const a: number = 1;\n");
for(const c of cases){
  const co={noEmit:true};
  let cfg={compilerOptions:co,files:["a.ts"]};
  if(c.name==="references.prepend"){cfg.references=[{path:"./ref",prepend:true}];}
  else {co[c.name]=c.value; if(c.name==="noEmit") delete co.noEmit; if(["outFile","out","declarationDir","emitDeclarationOnly"].includes(c.name)){delete co.noEmit; co.declaration=true;}}
  fs.writeFileSync(path.join(W,"tsconfig.json"),JSON.stringify(cfg,null,1));
  const r={...c};
  for(const [v,dir] of Object.entries(TSC)){
    const p=cp.spawnSync(path.join(__dirname,dir,"node_modules/.bin/tsc"),["-p","."],{cwd:W,encoding:"utf8"});
    const lines=(p.stdout+p.stderr).split("\n").filter(l=>l.startsWith("tsconfig.json")||/error TS5\d\d\d|error TS6\d\d\d/.test(l));
    r[v]=lines.map(l=>{const m=l.match(/error (TS\d+): (.*)/);return m?m[1]+" "+m[2]:l}).join(" | ");
  }
  out.push(r);
}
fs.writeFileSync(path.join(__dirname,"matrix.json"),JSON.stringify(out,null,1));
console.log(out.length);
