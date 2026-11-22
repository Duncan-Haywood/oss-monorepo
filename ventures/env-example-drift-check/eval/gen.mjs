// seeded .env generator
export function rng(seed){let s=Math.imul((seed>>>0)^0x9e3779b9,0x85ebca6b)>>>0||1;s^=s>>>13;s=Math.imul(s,0xc2b2ae35)>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
const pick=(r,a)=>a[Math.floor(r()*a.length)];
const KEYS=['FOO','BAR_1','_X','db_url','API_KEY','A','B2','APP.NAME','my-key','9LIVES','KEY','X'];
const VALS=['1','hello world','http://x/y?a=b#frag','',' spaced ','a=b','x#y','$OTHER','${HOME}/p'];
export function genLine(r, keys){
  const k=pick(r,keys);
  const pre=pick(r,['','','','  ','\t','export ','export  ']);
  const sep=pick(r,['=','=','=',' = ',' =','= ',': ',':']);
  const q=pick(r,['none','none','dq','sq','bt','dqml','sqml','btml','unterm','esc','comment','mltrail','sqesc','crlfml']);
  const v=pick(r,VALS);
  const inner=()=>{const k2=pick(r,keys);return pick(r,[`${k2}=inside`,'plain text',`# ${k2}=c`,`export ${k2}=z`]);};
  let val;
  switch(q){
    case 'none': val=v; break;
    case 'dq': val=`"${v}"`; break;
    case 'sq': val=`'${v}'`; break;
    case 'bt': val='`'+v+'`'; break;
    case 'dqml': val=`"${v}\n${inner()}\nend"`; break;
    case 'sqml': val=`'${v}\n${inner()}\nend'`; break;
    case 'btml': val='`'+v+'\n'+inner()+'\nend`'; break;
    case 'unterm': val=`"${v}\n${inner()}`; break;
    case 'esc': val=`"a\\"b\n${inner()}\\" c"`; break;
    case 'mltrail': val=`"${v}\n${inner()}\nend" trailing`; break;
    case 'sqesc': val=`'a\\'b\n${inner()}\nc'`; break;
    case 'crlfml': val=`"${v}\r\n${inner()}\r\nend"`; break;
    case 'comment': val=`${v} # note`; break;
  }
  return pre+k+sep+val;
}
export function genFile(seed){
  const r=rng(seed); const n=1+Math.floor(r()*8); const out=[];
  for(let i=0;i<n;i++){
    const t=r();
    if(t<0.1) out.push(''); else if(t<0.2) out.push('# '+genLine(r,KEYS)); else out.push(genLine(r,KEYS));
  }
  return out.join(r()<0.15?'\r\n':'\n')+(r()<0.5?'\n':'');
}
