// How often the exact fewest-payments search beats largest-to-largest on
// simulated trips: n people, 3-12 expenses, 60% shared by everyone, else a
// random subset; amounts either multiples of 5 or random cents. Seeded LCG,
// 2,000 trips per row. Run: node eval/greedy-gap.mjs
import { run } from "../calc.mjs";
let s=42; const r=()=>{s=(s*1103515245+12345)%2147483648; return s/2147483648;};
for (const round of [true,false]) for (const n of [4,6,8,10]) {
  let better=0, saved=0, N=2000;
  for (let t=0;t<N;t++){
    const people=Array.from({length:n},(_,i)=>"P"+i); const lines=[];
    const E=3+Math.floor(r()*10);
    for(let e=0;e<E;e++){ const amt = round ? (5*(1+Math.floor(r()*40))) : (1+Math.floor(r()*20000))/100;
      const who = r()<0.6 ? "" : " / "+people.filter(()=>r()<0.6).concat([people[0]]).filter((v,i,a)=>a.indexOf(v)===i).join(", ");
      lines.push(`${people[Math.floor(r()*n)]} ${amt} x${who}`);}
    const res=run({peopleText:people.join("\n"),linesText:lines.join("\n"),base:"EUR"});
    if(res.errors.length) throw new Error(res.errors[0]);
    if(res.counts.greedy>res.transfers.length){better++; saved+=res.counts.greedy-res.transfers.length;}
  }
  console.log(round?"round 5-euro amounts":"cent amounts", "n="+n, "fewer than greedy in", (100*better/N).toFixed(1)+"%", "avg saved when better", better?(saved/better).toFixed(2):"-");
}
