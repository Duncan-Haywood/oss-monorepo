// Shows each changed default on a fixture with the option ABSENT, under tsc 5.9.3, 6.0.3 and 7.0.2.
// TSC59=... TSC6=... TSC7=... node eval/defaults-probe.mjs > eval/defaults.json
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const __dirname = require('node:path').dirname(new URL(import.meta.url).pathname);
// Each fixture: a tsconfig with the option ABSENT, and files whose result reveals the default.
const fs=require("fs"),cp=require("child_process"),path=require("path");
const TSC={"5.9":process.env.TSC59,"6.0":process.env.TSC6,"7.0":process.env.TSC7};
const fx={
 strict:{cfg:{noEmit:true},files:{"a.ts":"export function f(x) { return x; }\n"}},
 target_module:{cfg:{outDir:"out"},files:{"a.ts":"export const f = async (o?: {a: number}) => o?.a ?? 1;\nexport class C { x = 1; }\n"},show:"out/a.js"},
 esModuleInterop:{cfg:{noEmit:true,module:"commonjs"},files:{"a.ts":"import fs from 'fs';\nexport const r = fs;\n","node_modules/@types/fs-like/index.d.ts":"","fs.d.ts":"declare module 'fs' { function readFileSync(p: string): string; export = readFileSync; }\n"}},
 types:{cfg:{noEmit:true},files:{"a.ts":"export const d: string = __dirnameLike;\n","node_modules/@types/glob-like/index.d.ts":"declare const __dirnameLike: string;\n","node_modules/@types/glob-like/package.json":"{\"name\":\"@types/glob-like\",\"version\":\"1.0.0\",\"types\":\"index.d.ts\"}"}},
 rootDir:{cfg:{outDir:"out"},files:{"src/a.ts":"export const a = 1;\n"},list:"out"},
 sideEffect:{cfg:{noEmit:true},files:{"a.ts":"import './missing-polyfill';\nexport {};\n"}},
 moduleResolution_exports:{cfg:{noEmit:true,module:"esnext"},files:{"a.ts":"import { x } from 'pkg/sub';\nexport const y = x;\n","node_modules/pkg/package.json":"{\"name\":\"pkg\",\"exports\":{\"./sub\":{\"types\":\"./lib/sub.d.ts\"}}}","node_modules/pkg/lib/sub.d.ts":"export declare const x: number;\n"}},
};
const res={};
for(const [name,f] of Object.entries(fx)){
  res[name]={};
  for(const [v,dir] of Object.entries(TSC)){
    const W=path.join(require("os").tmpdir(),"ts7defaults",name+"-"+v); fs.rmSync(W,{recursive:true,force:true});
    for(const [p,c] of Object.entries(f.files)){fs.mkdirSync(path.dirname(path.join(W,p)),{recursive:true});fs.writeFileSync(path.join(W,p),c);}
    fs.writeFileSync(path.join(W,"tsconfig.json"),JSON.stringify({compilerOptions:{ignoreDeprecations:v==="6.0"?"6.0":undefined,...f.cfg}}));
    const p=cp.spawnSync(dir,["-p","."],{cwd:W,encoding:"utf8"});
    let o=(p.stdout+p.stderr).trim();
    if(f.show&&fs.existsSync(path.join(W,f.show))) o+="\n--- "+f.show+"\n"+fs.readFileSync(path.join(W,f.show),"utf8");
    if(f.list) o+="\n--- emitted: "+cp.execSync("find "+f.list+" -type f",{cwd:W,encoding:"utf8"}).trim().replace(/\n/g," ");
    res[name][v]=o;
  }
}
console.log(JSON.stringify(res,null,1));
