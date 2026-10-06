// Employment offer / agreement red-flag checker. Reads the pasted text plus what the user was promised and returns
// findings. It is a set of text rules, not a legal reading: each finding says what to ask the employer for.

export const STATE_NOTES = {
  CA: "California generally voids employee non-competes (Bus. & Prof. Code 16600 and following)",
  ND: "North Dakota generally voids employee non-competes",
  OK: "Oklahoma generally voids employee non-competes",
  MN: "Minnesota bars new employee non-competes signed since mid-2023",
  CO: "Colorado limits non-competes by pay level and requires separate notice",
  WA: "Washington limits non-competes by pay level and caps some terms",
  IL: "Illinois limits non-competes by pay level and requires notice and time to review",
  MA: "Massachusetts limits non-competes (length, garden-leave pay, notice)",
  DC: "Washington DC limits non-competes by pay level",
};

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

export function parseMoney(s) {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
export function dollars(c) {
  return "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function extractAmounts(text) {
  const out = [];
  for (const m of String(text).matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)(\s?[kK]\b)?/g)) {
    let c = parseMoney(m[1]);
    if (c && m[2]) c *= 1000;
    if (c) out.push(c);
  }
  return out;
}

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, nine: 9, twelve: 12, eighteen: 18, twenty: 20, thirty: 30, sixty: 60, ninety: 90 };
const num = (s) => (/^\d+$/.test(s) ? Number(s) : WORDS[s.toLowerCase()] ?? null);
const PERIOD = "(\\d+|one|two|three|four|five|six|nine|twelve|eighteen|twenty|thirty|sixty|ninety)(?:\\s*\\(\\d+\\))?[- ](day|week|month|year)s?";
const toMonths = (n, unit) => (unit === "year" ? n * 12 : unit === "month" ? n : unit === "week" ? n / 4.345 : n / 30.4);

// Longest period in the sentence holding each anchor match, in months. Sentence-bound so a vesting term two
// sentences away is never read as the length of a non-compete.
export function periodAfter(text, anchor) {
  const t = String(text).toLowerCase();
  let best = null;
  for (const a of t.matchAll(anchor)) {
    const start = Math.max(0, t.lastIndexOf(". ", a.index) + 1);
    const end = t.indexOf(". ", a.index);
    const seg = t.slice(start, end === -1 ? t.length : end);
    for (const m of seg.matchAll(new RegExp(PERIOD, "g"))) {
      const n = num(m[1]);
      if (n === null) continue;
      const months = toMonths(n, m[2]);
      if (best === null || months > best.months) best = { months, label: `${n} ${m[2]}${n === 1 ? "" : "s"}` };
    }
  }
  return best;
}

const f = (id, severity, title, why, ask) => ({ id, severity, title, why, ask });

export function analyze(rawText, settings = {}) {
  const text = norm(rawText);
  const low = text.toLowerCase();
  if (text.length < 80) return { errors: ["Paste the full offer letter or agreement text first (at least a few sentences)."], findings: [], extracted: {} };
  const salary = parseMoney(settings.expectedSalary);
  const signOn = parseMoney(settings.signingBonus);
  if (salary === null) return { errors: ["The salary you were promised is not a number."], findings: [], extracted: {} };
  if (signOn === null) return { errors: ["The signing bonus is not a number."], findings: [], extracted: {} };

  const amounts = extractAmounts(text);
  const findings = [];
  const state = settings.state || "";

  // Compensation matches what was promised.
  if (salary) {
    if (!amounts.length) {
      findings.push(f("no-amounts", "high", "No dollar figures in the text",
        "The salary you were promised is not written anywhere in what you pasted, so it is not part of the agreement.",
        `Ask for the base salary (${dollars(salary)}) and any bonus target to be stated in writing.`));
    } else if (!amounts.some((a) => a === salary || a === salary * 100 / 100)) {
      const below = amounts.every((a) => a < salary);
      findings.push(f("salary-mismatch", "high", `No figure in the text matches the ${dollars(salary)} you were promised`,
        `The text names ${[...new Set(amounts)].slice(0, 6).map(dollars).join(", ")}${below ? ", all lower than what you expect" : ""}. What you were told verbally or by email is not binding if the signed document says otherwise.`,
        `Ask for the base salary to read ${dollars(salary)} before you sign, or for the difference to be explained.`));
    }
  }
  if (signOn && !amounts.includes(signOn)) {
    findings.push(f("signing-mismatch", "high", `The ${dollars(signOn)} signing bonus is not in the text`,
      "A signing bonus that is not written down cannot be enforced later.", "Ask for the amount, the payment date and the repayment terms to be written in."));
  }

  // Non-compete.
  const nc = /(non-?compet|not\s+(to\s+)?(directly or indirectly\s+)?(engage|compete|work|be employed)[^.]{0,80}(compet|similar|same|any business)|covenant not to compete|noncompetition)/.test(low);
  const ncPeriod = nc ? periodAfter(text, /non-?compet|covenant not to compete|noncompetition|not\s+(to\s+)?(directly or indirectly\s+)?(engage|compete|work)/g) : null;
  const wide = /(worldwide|nationwide|anywhere in the (united states|world)|any (business|company|entity) (that|which)|any competing)/.test(low);
  const garden = /(garden leave|continue to (pay|receive)[^.]{0,80}(salary|base)|paid (during|for) the (restricted|non-?compet))/.test(low);
  if (nc) {
    const long = ncPeriod && ncPeriod.months > 12;
    findings.push(f("noncompete", long || wide ? "high" : "medium",
      `Non-compete${ncPeriod ? ` of ${ncPeriod.label}` : ""}${wide ? ", broadly scoped" : ""}`,
      `A non-compete limits who you can work for after you leave${ncPeriod ? `: ${ncPeriod.label} here` : ", and the length is not clear from the text"}.${wide ? " It also reaches any competing business or a very wide area, which is the hardest kind to live with." : ""}${garden ? "" : " It does not say you are paid during the restricted period."}`,
      "Ask for it to be dropped, or cut to 6 months or less, limited to named direct competitors in your actual role, and paid (garden leave) if the employer ends your job."));
    if (!/(terminated without cause|laid off|without cause|reduction in force)[^.]{0,120}(not (apply|enforce|be enforce)|void|shall not|no longer)/.test(low) && !/(not (apply|be enforce\w*))[^.]{0,120}(without cause|laid off)/.test(low)) {
      findings.push(f("noncompete-layoff", "medium", "The non-compete still applies if you are laid off",
        "Nothing in the text turns the restriction off when the employer ends your job without cause, which is when you most need to work elsewhere.",
        "Ask that the non-compete fall away if you are terminated without cause or laid off."));
    }
    if (state && STATE_NOTES[state]) {
      findings.push(f("noncompete-state", "info", `${STATE_NOTES[state]}`,
        "State law on non-competes has changed quickly, and what applies can depend on where you live, where you work and your pay. This page does not decide it.",
        "Check the current statute for your state or ask an employment attorney before relying on or ignoring the clause."));
    }
  } else if (state && STATE_NOTES[state] && /(compet)/.test(low)) {
    findings.push(f("noncompete-state", "info", STATE_NOTES[state], "The text mentions competing, but no clear non-compete was found.", "Read the clause yourself and ask an attorney if unsure."));
  }

  // Non-solicit.
  const ns = /(non-?solicit|not\s+(to\s+)?(directly or indirectly\s+)?solicit|no-?hire)/.test(low);
  if (ns) {
    const p = periodAfter(text, /non-?solicit|solicit|no-?hire/g);
    const clients = /(customer|client)s?/.test(low.slice(low.search(/solicit|no-?hire/)));
    findings.push(f("nonsolicit", p && p.months > 12 ? "medium" : "info", `Non-solicitation${p ? ` for ${p.label}` : ""}`,
      `You may not approach ${clients ? "the employer's customers or clients" : "its staff"} after leaving${p ? ` for ${p.label}` : ""}. These are more often enforced than non-competes.`,
      "Limit it to customers you actually dealt with in your last 12 months, for 12 months or less, and exclude general ads and people who contact you first."));
  }

  // Invention assignment.
  const assign = /(assign|hereby assigns?|work made for hire|work for hire|all right, title)[^.]{0,200}(invention|work product|idea|intellectual property|developments?|inventions?)/.test(low) || /(invention|work product|intellectual property)[^.]{0,200}(assign|belong|property of the company|owned by)/.test(low);
  if (assign) {
    const carve = /(prior invention|excluded invention|exhibit a|on (my|your|his or her) own time|without (the )?use of (the )?company|2870|(not|no)[^.]{0,60}(related to|relate to)[^.]{0,60}(business|research))/.test(low);
    const everything = /(whether or not|regardless of whether)[^.]{0,80}(during|working hours|business hours|company (time|resources|equipment))|(all|any)\s+(inventions|ideas|works|work product)[^.]{0,80}(conceived|created|developed|made)[^.]{0,60}(during|while|throughout)[^.]{0,40}(employ|term)/.test(low);
    if (!carve) {
      findings.push(f("ip-no-carveout", everything ? "high" : "medium", "Assigns your inventions to the employer with no carve-out for your own time",
        "Without an exception for work done on your own time with your own equipment and unrelated to the business, side projects, open source and a startup on the weekend can be claimed by the employer." + (everything ? " The wording reaches things made whether or not they use company time or resources." : ""),
        "Ask for a carve-out for inventions made on your own time, without company resources, and unrelated to the company's business, and add a list of your prior inventions as an exhibit."));
    } else if (everything) {
      findings.push(f("ip-broad", "medium", "Invention assignment reaches work done outside working hours", "The text assigns things made during the whole term of employment, and the carve-out may not be wide enough to protect side work.", "Read the carve-out against your actual side projects and have it name them."));
    }
    if (!/(prior invention|excluded invention|exhibit a|list of (prior )?inventions|schedule of (prior )?inventions)/.test(low)) {
      findings.push(f("no-prior-inventions", "info", "No place to list the inventions you already own", "If you bring existing code, designs or patents, there is nothing saying they are yours.", "Ask for a prior-inventions exhibit and list anything you own, including projects in progress."));
    }
  }

  // Repayment of bonuses and costs.
  const claw = /(repa(y|id)|reimburse|refund|pay back|claw ?back|forfeit[^.]{0,40}(bonus|relocation))[^.]{0,200}(bonus|relocation|tuition|training|moving|sign-?on|signing|advance)/.test(low) || /(bonus|relocation|tuition|training|moving|sign-?on|signing)[^.]{0,200}(repa(y|id)|reimburse|refund|pay back|claw ?back|returned to the company)/.test(low);
  if (claw) {
    const p = periodAfter(text, /repa(y|id)|reimburse|refund|pay back|claw ?back/g);
    const prorated = /(pro[- ]?rat|reduced by|decreas|declin)/.test(low);
    const noFault = /(without cause|laid off|good reason|reduction in force|not (be )?required to repay[^.]{0,80}(without cause|laid off))/.test(low);
    findings.push(f("clawback", (p && p.months > 12) || (!prorated && !noFault) ? "high" : "medium",
      `You may have to pay money back if you leave${p ? ` within ${p.label}` : ""}`,
      `The text makes a bonus, relocation or training cost repayable${p ? ` for ${p.label}` : ""}.${prorated ? "" : " It is not reduced as time passes, so leaving one day early can cost the whole amount."}${noFault ? "" : " Nothing says you owe nothing if you are laid off or leave for good reason."}`,
      "Ask for the amount to shrink pro rata each month, for repayment to cover only the after-tax amount, and for no repayment if you are laid off, the role changes materially or you leave for good reason."));
  }

  // Bonus and commission earned only if still employed.
  const bonusDisc = /(bonus|incentive)[^.]{0,200}(sole discretion|discretion of the (company|board)|may,? in its discretion|not guaranteed)/.test(low);
  const bonusEmployed = /(bonus|incentive)[^.]{0,260}(must be (actively )?employed|remain (actively )?employed|employed (on|as of|at) the (date|time)|on the (date|day) (of )?payment)/.test(low);
  if (bonusDisc || bonusEmployed) {
    findings.push(f("bonus-conditional", bonusEmployed && bonusDisc ? "medium" : "info",
      bonusEmployed ? "Bonus is lost if you are gone on the payout date" : "Bonus is at the employer's discretion",
      `${bonusDisc ? "The employer can decide not to pay it, whatever the target says. " : ""}${bonusEmployed ? "You must still be employed on the payout date, so a layoff or a resignation a week before can forfeit a bonus you worked all year for." : ""}`,
      "Ask for the target, the formula and the payout date in writing, and for a pro-rated bonus if you are terminated without cause before the date."));
  }
  if (/commission/.test(low)) {
    const forfeit = /(commission)[^.]{0,260}(not (considered )?earned|only (earned|paid)|no longer (eligible|entitled)|forfeit|upon termination|after termination|cease)/.test(low);
    if (forfeit) {
      findings.push(f("commission-forfeit", "high", "Commissions can stop or be forfeited when you leave", "Commissions on deals you closed may not be paid if you leave or are terminated before they are collected or paid out.", "Ask that commissions on deals you closed before your last day are paid when the customer pays, and that the plan is attached and cannot be changed retroactively."));
    }
    if (!/(commission plan|compensation plan|plan document|exhibit|schedule)/.test(low)) {
      findings.push(f("commission-plan-missing", "medium", "Commissions are mentioned but the plan is not attached", "Quota, rate, accelerators, clawbacks and territory live in the plan, and a plan can often be changed unilaterally.", "Ask for the written plan before you sign and for notice and consent before it changes."));
    }
  }

  // Equity.
  const equity = /(stock option|options|rsu|restricted stock|equity|shares|vest)/.test(low);
  if (equity) {
    const repurchase = /(repurchase|call right|right of first refusal|buy back|buyback)[^.]{0,200}(vested|cost|lower of|fair market)/.test(low) || /(vested|fully vested)[^.]{0,120}(repurchase|forfeit|cancel)/.test(low);
    if (repurchase) {
      findings.push(f("equity-repurchase", "high", "The company can buy back or cancel vested equity", "Vested equity that can be repurchased at cost or cancelled for cause is much less than it looks.", "Ask for repurchase only at fair market value, and for the cause definition to be narrow and decided on notice."));
    }
    const ex = periodAfter(text, /(exercise|exercisable)/g);
    if (ex && /(terminat|leav|ends|cessation|separation|resign)/.test(low) && ex.months <= 3.1) {
      findings.push(f("short-exercise-window", "medium", `Only ${ex.label} to exercise vested options after you leave`, "A short window can force you to find money for the exercise price and the tax in weeks or lose the options.", "Ask for a longer post-termination exercise window, such as 5 to 10 years, or at least 12 months."));
    }
    if (!/(vest(ing|s|ed)?)[^.]{0,200}(\d+|one|four)[^.]{0,30}(year|month)/.test(low) && !/(\d+|one|two|three|four)[- ](year|month)[^.]{0,20}vest/.test(low) && /(option|rsu|share|equity)/.test(low) && !/(grant agreement|plan)/.test(low)) {
      findings.push(f("equity-terms-missing", "medium", "Equity is mentioned without the vesting terms", "The number of shares, strike price, vesting schedule and cliff are what make it worth anything.", "Ask for share count, strike price or valuation, vesting schedule, cliff and acceleration on a sale in writing."));
    } else if (/(cliff)/.test(low) === false && /(vest)/.test(low) && /(four|4)[- ]year/.test(low) && !/(accelerat)/.test(low)) {
      findings.push(f("no-acceleration", "info", "No acceleration of vesting if the company is sold", "If the company is acquired and your job ends, unvested equity may be lost.", "Ask for double-trigger acceleration, at least for a termination without cause after a sale."));
    }
  }

  // Dispute rules.
  if (/(binding arbitration|mandatory arbitration|arbitrat\w+)[^.]{0,200}(waive|class|jury|final and binding)/.test(low) || /(class|collective) action waiver|waive[^.]{0,60}(jury|class)/.test(low)) {
    findings.push(f("arbitration", "medium", "Disputes go to private arbitration, with rights waived", "You give up a jury and often the ability to join others. Some claims cannot legally be forced into arbitration, and the rules and costs vary by provider.", "Ask who pays the arbitration fees (it should be the employer), that you keep access to agencies, and for a venue near you."));
  }
  if (/(governing law|governed by the laws|venue|exclusive jurisdiction)/.test(low) && state) {
    const m = text.match(/laws? of (?:the )?(?:state of )?([A-Z][a-z]+(?: [A-Z][a-z]+)?)/);
    if (m && STATE_NOTES[state] && !new RegExp(Object.values({ CA: "California", ND: "North Dakota", OK: "Oklahoma", MN: "Minnesota", CO: "Colorado", WA: "Washington", IL: "Illinois", MA: "Massachusetts", DC: "District" }[state] || "zzz"), "i").test(m[1])) {
      findings.push(f("foreign-law", "medium", `The contract is governed by ${m[1]} law, not ${state}`, "Choosing another state's law is a common way to get around a rule that protects you where you live.", "Ask for the law and courts of the state where you work."));
    }
  }

  // Leaving, changing, speaking.
  const notice = periodAfter(text, /(notice of (resignation|termination)|give[^.]{0,40}notice)/g);
  if (notice && notice.months > 1.1 && /(resign|notice)/.test(low)) {
    findings.push(f("long-notice", notice.months > 3 || /garden leave/.test(low) ? "high" : "medium", `You must give ${notice.label} notice to quit`, "A long notice period keeps you tied to the job, and the employer can often release you from work without paying the rest of it.", "Ask for 2 weeks, or for the employer to pay you through the notice period if it ends it early."));
  }
  if (/(outside (employment|activities|business)|moonlight|other (employment|business)[^.]{0,60}(prior|written) (consent|approval))/.test(low)) {
    findings.push(f("moonlighting", "medium", "Outside work needs the employer's permission", "Even unpaid side projects, teaching or advising can need written consent.", "Ask for a clause allowing work that does not compete or use company time, and list your current side work."));
  }
  if ((/(may (modify|change|amend|revise|alter)|reserves the right to (modify|change|amend|revise|alter))[^.]{0,160}(at any time|from time to time|sole discretion)[^.]{0,120}(compensation|salary|duties|title|territory|plan|bonus|commission|policies)/.test(low) || /(may (modify|change|amend|revise|alter)|reserves the right to (modify|change|amend|revise|alter))[^.]{0,120}(compensation|salary|duties|title|territory|plan|bonus|commission|policies)[^.]{0,160}(at any time|from time to time|sole discretion)/.test(low))) {
    findings.push(f("unilateral-change", "medium", "The employer can change pay or terms on its own", "Salary, bonus, territory or duties can be changed without your agreement.", "Ask that changes to your pay, title, territory or bonus plan need your written consent or reasonable notice and apply only going forward."));
  }
  if (/(confidential|proprietary)/.test(low)) {
    const carve = /(nothing in this[^.]{0,120}(prohibit|limit|restrict)[^.]{0,160}(government|agency|sec|eeoc|nlrb|law enforcement|report))|(whistleblow|protected activity|defend trade secrets act|section 7)/.test(low);
    if (!carve) {
      findings.push(f("confidentiality-carveout", "medium", "Confidentiality with no carve-out for reporting to authorities or discussing pay", "Agreements that bar you from reporting to a regulator or discussing your own pay can be unlawful, and employers are expected to carve those out.", "Ask for a clause saying nothing in the agreement stops you from reporting to government agencies or discussing your wages and working conditions."));
    }
  }
  if (/(non-?disparage|disparag)/.test(low) && !/(nothing in this|except as (required|permitted)|to the extent permitted|protected by law|protected activity|truthful statements)/.test(low)) {
    findings.push(f("nondisparagement", "medium", "Non-disparagement with no exceptions", "It can be read to bar truthful statements about pay or conditions and reports to authorities, and it usually runs forever.", "Ask for it to be mutual, limited in time, and to exclude truthful statements required or protected by law."));
  }
  if (/(severance)/.test(low) && /(release|waive)/.test(low) && /(severance)[^.]{0,200}(release|execut|sign)/.test(low)) {
    findings.push(f("severance-release", "info", "Severance depends on signing a release", "Common, but it means the amount is the price of giving up claims you may not yet know about.", "Ask for the severance formula now, and review the release with a lawyer when it is offered."));
  }
  if (/(at[- ]will)/.test(low) && !/(severance|notice pay|termination without cause)/.test(low)) {
    findings.push(f("no-severance", "info", "At-will employment and nothing on severance", "You can be let go at any time and nothing here says what you would receive.", "Ask for severance if you are terminated without cause, even a few weeks, or at least accelerated vesting."));
  }
  if (/(contingent|conditional)[^.]{0,120}(background|reference|verification|drug|i-9|credit)/.test(low) && !/(rescind|withdraw)[^.]{0,80}(reasonable|written)/.test(low)) {
    findings.push(f("contingent-offer", "info", "The offer is contingent on checks the text does not limit", "If you resign a current job on a contingent offer and the checks go badly, you can be left with neither.", "Wait for the checks to clear before giving notice, and ask what would cause it to be withdrawn."));
  }

  const order = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const high = findings.filter((x) => x.severity === "high").length;
  const medium = findings.filter((x) => x.severity === "medium").length;
  const verdict = high ? "negotiate-before-signing" : medium ? "ask-for-changes" : "no-red-flags";
  return { errors: [], findings, verdict, extracted: { amounts, noncompeteMonths: ncPeriod ? ncPeriod.months : null, noticeMonths: notice ? notice.months : null, salary, signOn } };
}

export const VERDICT_TEXT = {
  "negotiate-before-signing": "Negotiate before you sign",
  "ask-for-changes": "Ask for changes before signing",
  "no-red-flags": "No red flags found by these rules",
};

export function summaryText(r, s = {}) {
  const lines = ["EMPLOYMENT CONTRACT CHECK"];
  if (s.state) lines.push(`State: ${s.state}`);
  if (r.extracted.salary) lines.push(`Salary you were promised: ${dollars(r.extracted.salary)}`);
  const x = r.extracted;
  lines.push(`Dollar figures in the text: ${x.amounts.length ? [...new Set(x.amounts)].map(dollars).join(", ") : "none found"}`);
  if (x.noncompeteMonths) lines.push(`Non-compete length found: about ${Math.round(x.noncompeteMonths)} months`);
  lines.push("", `RESULT: ${VERDICT_TEXT[r.verdict]}`, "");
  if (!r.findings.length) lines.push("Nothing flagged. These rules read text only; they cannot tell you the contract is fair or enforceable.");
  for (const [i, g] of r.findings.entries()) lines.push(`${i + 1}. [${g.severity.toUpperCase()}] ${g.title}`, `   Why: ${g.why}`, `   Ask for: ${g.ask}`, "");
  lines.push("A worksheet from a text checker, not legal advice. Have an employment attorney review anything that matters.");
  return lines.join("\n");
}

export function findingsCsv(r) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ["severity,finding,why,ask_for", ...r.findings.map((g) => [g.severity, g.title, g.why, g.ask].map(q).join(","))].join("\n");
}

export function sampleContract() {
  return `OFFER OF EMPLOYMENT. Brightwave Inc. offers you the position of Senior Engineer at an annual base salary of $165,000. You will receive a signing bonus of $20,000, which you must repay in full if you resign within 24 months of your start date. You will be eligible for an annual bonus in the sole discretion of the Company, and you must be employed on the payment date to receive it. You will be granted 20,000 stock options subject to four-year vesting. After your employment ends for any reason you will have 30 days to exercise vested options, and the Company may repurchase vested shares at cost.

You agree that during employment and for 18 months after, you will not directly or indirectly work for any business that competes with the Company anywhere in the United States, and will not solicit any customer or employee. You hereby assign to the Company all inventions, ideas and work product you conceive during your employment, whether or not during working hours. You will give 60 days notice of resignation. All disputes are subject to binding arbitration and you waive any right to a jury or class action. Employment is at will. The Company may modify your compensation and duties at any time in its sole discretion. You will keep all Company information confidential.`;
}

export const SAMPLE_SETTINGS = { expectedSalary: "175000", signingBonus: "20000", state: "" };
