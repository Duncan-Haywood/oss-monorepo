// Examples for the page. LSAT6 is data/lsat6.csv verbatim (page.test.mjs checks it).
import { SAMPLE_TEXT } from "./engine.mjs";

export const LSAT6 = "item1,item2,item3,item4,item5,count\n0,0,0,0,0,3\n0,0,0,0,1,6\n0,0,0,1,0,2\n0,0,0,1,1,11\n0,0,1,0,0,1\n0,0,1,0,1,1\n0,0,1,1,0,3\n0,0,1,1,1,4\n0,1,0,0,0,1\n0,1,0,0,1,8\n0,1,0,1,1,16\n0,1,1,0,1,3\n0,1,1,1,0,2\n0,1,1,1,1,15\n1,0,0,0,0,10\n1,0,0,0,1,29\n1,0,0,1,0,14\n1,0,0,1,1,81\n1,0,1,0,0,3\n1,0,1,0,1,28\n1,0,1,1,0,15\n1,0,1,1,1,80\n1,1,0,0,0,16\n1,1,0,0,1,56\n1,1,0,1,0,21\n1,1,0,1,1,173\n1,1,1,0,0,11\n1,1,1,0,1,61\n1,1,1,1,0,28\n1,1,1,1,1,298\n";

export const EXAMPLES = {
  lsat: { text: LSAT6, label: "LSAT Section 6: 1,000 examinees, 5 items (Bock & Lieberman 1970), as pattern counts" },
  quiz: { text: SAMPLE_TEXT, label: "Made-up 6-question multiple-choice quiz, 20 students, with an answer key row" },
};
