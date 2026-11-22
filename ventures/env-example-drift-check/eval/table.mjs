import {parseEnv} from 'node:util';import {createRequire} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);const S=process.argv[2];const e=await import(process.argv[3]);
const d16=require(S+'/npmdotenv/dotenv-16.4.7/package/lib/main.js');const d17=require(S+'/npmdotenv/dotenv-17.2.3/package/lib/main.js');
const cases=JSON.parse(readFileSync(new URL('./cases.json',import.meta.url)));writeFileSync(S+'/cf.json',JSON.stringify(cases.map(c=>c[1])));
execFileSync('python3',['-I',new URL('./py.py',import.meta.url).pathname,S,S+'/cf.json',S+'/cpy.json']);const py=JSON.parse(readFileSync(S+'/cpy.json'));
const f=a=>[...a].join(' ')||'(none)';
console.log('| case | this tool | Node util.parseEnv | dotenv 16.4.7 | dotenv 17.2.3 | python-dotenv 1.0.1 |\n|---|---|---|---|---|---|');
cases.forEach(([n,t],i)=>console.log(`| ${n} | ${f(e.parseExampleFile(t).keys())} | ${f(Object.keys(parseEnv(t)))} | ${f(Object.keys(d16.parse(t)))} | ${f(Object.keys(d17.parse(t)))} | ${py[i].all.map(k=>py[i].valued.includes(k)?k:k+'*').join(' ')||'(none)'} |`));
