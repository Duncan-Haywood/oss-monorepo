// Job search agent: the deterministic core.
//
// One long intake interview produces a profile. Everything after that reads
// the profile instead of asking the job seeker again:
//
//   triageJobs(text, profile)        rank pasted postings: apply / maybe / skip, with reasons
//   answerQuestions(text, profile)   fill an application form's questions from the profile
//   interviewPrep(profile, job)      likely questions, each matched to one of your stories
//   negotiate(offer, profile)        a counter number and the email that asks for it
//
// The model (bring-your-own-key, byok.mjs) only drafts open-ended prose, and
// `checkDraft` flags any number or employer in a draft that the profile does
// not contain, so an AI answer cannot quietly invent experience.
//
// What it deliberately does not do: submit anything, or speak in a live
// interview as the candidate. The person reviews and sends every answer.

/** @typedef {{id:string,label:string,type?:string,options?:string[],help?:string,required?:boolean}} Question */

/** The intake interview, in the order it is asked. */
export const INTAKE = Object.freeze([
  {
    id: 'basics', title: 'The basics', blurb: 'What every application form asks first.',
    questions: [
      { id: 'fullName', label: 'Full name', required: true },
      { id: 'preferredName', label: 'Preferred first name (if different)' },
      { id: 'email', label: 'Email', type: 'email', required: true },
      { id: 'phone', label: 'Phone', type: 'tel', required: true },
      { id: 'city', label: 'City, region / state', required: true },
      { id: 'country', label: 'Country', required: true },
      { id: 'linkedin', label: 'LinkedIn URL', type: 'url' },
      { id: 'website', label: 'Portfolio / website / GitHub URL', type: 'url' },
      { id: 'pronouns', label: 'Pronouns (optional; leave blank to not state them)' },
    ],
  },
  {
    id: 'eligibility', title: 'Eligibility and logistics', blurb: 'Yes/no gates that knock applications out when answered wrong.',
    questions: [
      { id: 'workAuthorized', label: 'Are you legally authorized to work in the country of the jobs you want?', type: 'select', options: ['yes', 'no'], required: true },
      { id: 'needsSponsorship', label: 'Will you now or in the future need visa sponsorship?', type: 'select', options: ['no', 'yes'], required: true },
      { id: 'workAuthDetail', label: 'Work authorization detail (citizen, permanent resident, visa type and expiry)' },
      { id: 'workMode', label: 'Work arrangement you will accept', type: 'select', options: ['remote only', 'remote or hybrid', 'any (remote, hybrid, onsite)', 'onsite or hybrid'], required: true },
      { id: 'willingToRelocate', label: 'Willing to relocate?', type: 'select', options: ['no', 'yes', 'for the right role'] },
      { id: 'relocateWhere', label: 'Places you would relocate to (comma-separated)' },
      { id: 'travelPercent', label: 'Most travel you will accept (% of time)', type: 'number' },
      { id: 'noticePeriod', label: 'Notice period / earliest start (e.g. "2 weeks", "immediately")', required: true },
      { id: 'over18', label: 'Are you 18 or older?', type: 'select', options: ['yes', 'no'] },
      { id: 'backgroundCheck', label: 'Willing to undergo a background check?', type: 'select', options: ['yes', 'no'] },
      { id: 'driversLicense', label: 'Valid driver\'s license?', type: 'select', options: ['yes', 'no', 'not applicable'] },
      { id: 'clearance', label: 'Security clearance held (blank if none)' },
    ],
  },
  {
    id: 'targets', title: 'What you are looking for', blurb: 'Used to rank postings and skip the ones you would turn down anyway.',
    questions: [
      { id: 'targetTitles', label: 'Job titles you want (comma-separated)', required: true, help: 'e.g. Data Analyst, Analytics Engineer, BI Developer' },
      { id: 'seniority', label: 'Seniority', type: 'select', options: ['entry', 'mid', 'senior', 'staff / principal', 'manager', 'director+'] },
      { id: 'industries', label: 'Industries you prefer (comma-separated)' },
      { id: 'avoidIndustries', label: 'Industries or companies you will not work for (comma-separated)' },
      { id: 'mustHaves', label: 'Must-haves in a job (comma-separated words a posting must mention)', help: 'e.g. 4-day week, visa sponsorship, PostgreSQL' },
      { id: 'dealBreakers', label: 'Deal-breakers (comma-separated words that make you skip a posting)', help: 'e.g. on-call, commission only, unpaid' },
      { id: 'companySize', label: 'Company size preference', type: 'select', options: ['any', 'startup (<50)', 'scale-up (50-1000)', 'large (1000+)'] },
      { id: 'employmentType', label: 'Employment type', type: 'select', options: ['full-time', 'part-time', 'contract', 'any'] },
    ],
  },
  {
    id: 'pay', title: 'Pay and negotiation', blurb: 'Kept on your device. Drives the salary answer and the counter-offer.',
    questions: [
      { id: 'currency', label: 'Currency (e.g. USD, GBP, EUR)', required: true },
      { id: 'currentBase', label: 'Current or most recent base salary (yearly; optional)', type: 'number' },
      { id: 'floorBase', label: 'Walk-away base salary: the lowest you would accept', type: 'number', required: true },
      { id: 'targetBase', label: 'Target base salary', type: 'number', required: true },
      { id: 'salaryDisclosure', label: 'When a form asks salary expectations, answer with', type: 'select', options: ['my target number', 'a range from target upward', 'defer: ask about their range'] },
      { id: 'negotiationPriorities', label: 'What matters most after base, in order (comma-separated)', help: 'e.g. remote, signing bonus, equity, PTO, title, start date' },
      { id: 'competingOffers', label: 'Other offers or processes in flight (optional; only facts you are willing to state)' },
    ],
  },
  {
    id: 'experience', title: 'Experience', blurb: 'Facts the drafts are allowed to use. Nothing outside this is claimed.',
    questions: [
      { id: 'yearsTotal', label: 'Total years of professional experience', type: 'number', required: true },
      { id: 'currentTitle', label: 'Current or most recent job title', required: true },
      { id: 'currentEmployer', label: 'Current or most recent employer', required: true },
      { id: 'pastEmployers', label: 'Earlier employers (comma-separated)' },
      { id: 'skills', label: 'Skills with years of experience, one per line as "Skill: years"', type: 'textarea', required: true, help: 'e.g.\nPython: 6\nSQL: 8\nTableau: 3' },
      { id: 'certifications', label: 'Certifications and licenses (comma-separated)' },
      { id: 'languages', label: 'Languages spoken, with level (comma-separated)' },
      { id: 'achievements', label: 'Three to five achievements with numbers, one per line', type: 'textarea', help: 'e.g. Cut monthly reporting from 5 days to 1 by automating the close pack' },
      { id: 'summary', label: 'Two-sentence professional summary in your own words', type: 'textarea', required: true },
    ],
  },
  {
    id: 'education', title: 'Education',
    questions: [
      { id: 'highestDegree', label: 'Highest education level', type: 'select', options: ['high school', 'associate', 'bachelor\'s', 'master\'s', 'doctorate', 'other / none'] },
      { id: 'degreeField', label: 'Field of study' },
      { id: 'school', label: 'School' },
      { id: 'graduationYear', label: 'Graduation year (optional)', type: 'number' },
    ],
  },
  {
    id: 'stories', title: 'Stories for interviews', blurb: 'Each story becomes the answer to a family of interview questions.',
    questions: [
      {
        id: 'stories', label: 'Stories: separate each with a blank line. First line is a title with [tags]; the rest is situation, action, result.', type: 'textarea', required: true,
        help: 'e.g.\nMigrated billing to Postgres [technical, ownership, deadline]\nOur billing DB was failing nightly. I planned and ran the migration over 3 weekends; zero downtime, invoices out on time.\n\nDisagreed with my manager on launch date [conflict, communication]\n…',
      },
      { id: 'whyLeaving', label: 'Why you are leaving / looking (as you would say it to an employer)', type: 'textarea' },
      { id: 'strengths', label: 'Strengths, in your words', type: 'textarea' },
      { id: 'weakness', label: 'A real weakness and what you do about it', type: 'textarea' },
      { id: 'careerGoal', label: 'Where you want to be in a few years', type: 'textarea' },
    ],
  },
  {
    id: 'voluntary', title: 'Voluntary self-identification', blurb: 'Optional. Defaults to declining. Only what you choose here is ever entered.',
    questions: [
      { id: 'eeoGender', label: 'Gender', type: 'select', options: ['decline to self-identify', 'woman', 'man', 'non-binary'] },
      { id: 'eeoRace', label: 'Race / ethnicity (free text, or leave blank to decline)' },
      { id: 'eeoVeteran', label: 'Veteran status', type: 'select', options: ['decline to self-identify', 'not a protected veteran', 'protected veteran'] },
      { id: 'eeoDisability', label: 'Disability status', type: 'select', options: ['decline to self-identify', 'no', 'yes'] },
    ],
  },
  {
    id: 'references', title: 'References and links',
    questions: [
      { id: 'references', label: 'References (name, relationship, contact), one per line; only people who agreed', type: 'textarea' },
      { id: 'referralSource', label: 'Default answer to "How did you hear about us?"', help: 'e.g. Company careers page' },
    ],
  },
]);

export const ALL_QUESTIONS = Object.freeze(INTAKE.flatMap(s => s.questions.map(q => ({ ...q, section: s.id }))));

const DECLINE = 'I decline to self-identify';

const str = v => (v === undefined || v === null ? '' : String(v).trim());
const list = v => str(v).split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
const num = v => {
  const n = Number(String(v ?? '').replace(/[,_\s]/g, ''));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
};
const lower = s => str(s).toLowerCase();
// Word-boundary match that also works for tokens like "c++" or "node.js".
const mentions = (text, term) => {
  const t = lower(term);
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`, 'i').test(text);
};

/** Fill in defaults so every question has a value key. */
export function normaliseProfile(raw = {}) {
  const p = {};
  for (const q of ALL_QUESTIONS) p[q.id] = raw[q.id] ?? (q.type === 'select' && q.section === 'voluntary' ? q.options[0] : '');
  return p;
}

/** How much of the interview is done, and which required answers are missing. */
export function completeness(raw) {
  const p = normaliseProfile(raw);
  const answered = ALL_QUESTIONS.filter(q => str(p[q.id]) !== '');
  const missingRequired = ALL_QUESTIONS.filter(q => q.required && str(p[q.id]) === '').map(q => ({ id: q.id, label: q.label, section: q.section }));
  const problems = [];
  const floor = num(p.floorBase), target = num(p.targetBase);
  if (floor !== null && target !== null && target < floor) problems.push('Target base is below your walk-away base.');
  return { answered: answered.length, total: ALL_QUESTIONS.length, percent: Math.round(100 * answered.length / ALL_QUESTIONS.length), missingRequired, problems };
}

/** "Python: 6" lines -> [{ skill, years }] */
export function parseSkills(text) {
  return str(text).split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.+?)\s*[:=\-–]\s*(\d+(?:\.\d+)?)\s*(?:y|yr|yrs|years?)?\.?$/i);
    return m ? { skill: m[1].trim(), years: Number(m[2]) } : { skill: l.replace(/[:\-–]\s*$/, ''), years: null };
  });
}

/** Blank-line separated stories, first line "Title [tag, tag]". */
export function parseStories(text) {
  return str(text).split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(block => {
    const [head, ...rest] = block.split('\n');
    const m = head.match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
    return {
      title: (m ? m[1] : head).trim(),
      tags: m ? list(m[2]).map(t => t.toLowerCase()) : [],
      body: rest.join('\n').trim(),
    };
  });
}

function money(n, currency) {
  if (n === null) return '';
  const rounded = Math.round(n);
  return `${rounded.toLocaleString('en-US')} ${str(currency) || ''}`.trim();
}

function yesNo(v) {
  const s = lower(v);
  if (s === 'yes' || s === 'y' || s === 'true') return 'Yes';
  if (s === 'no' || s === 'n' || s === 'false') return 'No';
  return '';
}

// ---------------------------------------------------------------------------
// Application questions
// ---------------------------------------------------------------------------

/**
 * Rules tried in order; the first whose pattern matches answers the question.
 * `answer` returns a string ('' means the profile lacks it: ask the person).
 */
const RULES = [
  { key: 'eeoGender', re: /\b(gender|sex)\b/i, answer: p => (p.eeoGender && !/decline/i.test(p.eeoGender) ? cap(p.eeoGender) : DECLINE), note: 'Voluntary; answered only as you chose in the interview.' },
  { key: 'eeoRace', re: /\b(race|ethnicity|hispanic|latino)\b/i, answer: p => str(p.eeoRace) || DECLINE, note: 'Voluntary; answered only as you chose in the interview.' },
  { key: 'eeoVeteran', re: /\bveteran\b/i, answer: p => (p.eeoVeteran && !/decline/i.test(p.eeoVeteran) ? cap(p.eeoVeteran) : DECLINE), note: 'Voluntary.' },
  { key: 'eeoDisability', re: /\bdisabilit/i, answer: p => (p.eeoDisability && !/decline/i.test(p.eeoDisability) ? cap(p.eeoDisability) : DECLINE), note: 'Voluntary.' },
  { key: 'pronouns', re: /\bpronouns?\b/i, answer: p => str(p.pronouns) || 'Prefer not to say' },
  { key: 'sponsorship', re: /\b(sponsor(ship)?|visa|h-?1b)\b/i, answer: p => yesNo(p.needsSponsorship), note: 'Answers whether you need sponsorship.' },
  { key: 'workAuthorized', re: /\b(authori[sz]ed|eligible|right) to work\b|\bwork (authori[sz]ation|permit|eligibility)\b/i, answer: p => yesNo(p.workAuthorized) },
  { key: 'over18', re: /\b(18|eighteen) (years|or older)|\bat least 18\b|\blegal age\b/i, answer: p => yesNo(p.over18) },
  { key: 'backgroundCheck', re: /\bbackground (check|screen)/i, answer: p => yesNo(p.backgroundCheck) },
  { key: 'driversLicense', re: /\bdriver'?s'? licen[cs]e\b/i, answer: p => (lower(p.driversLicense) === 'not applicable' ? '' : yesNo(p.driversLicense)) },
  { key: 'clearance', re: /\b(security )?clearance\b/i, answer: p => str(p.clearance) || 'No' },
  { key: 'relocate', re: /\breloca/i, answer: p => relocateAnswer(p) },
  { key: 'travel', re: /\btravel\b/i, answer: p => (num(p.travelPercent) === null ? '' : `Yes, up to ${num(p.travelPercent)}% of the time`) },
  { key: 'workMode', re: /\b(remote|hybrid|on-?site|in[- ]office|in person)\b/i, answer: p => workModeAnswer(p) },
  { key: 'salary', re: /\b(salary|compensation|pay|rate) (expectation|requirement|range|desired)|\bdesired (salary|pay|compensation)|\bexpected (salary|compensation)|\bsalary\b/i, answer: (p, ctx) => salaryAnswer(p, ctx), note: 'Uses your target and the disclosure style you chose.' },
  { key: 'startDate', re: /\b(start date|when can you start|available to start|notice period|availability)\b/i, answer: p => str(p.noticePeriod) },
  { key: 'yearsWith', re: /\b(how many )?years\b.*\b(experience|worked|using|with|in)\b/i, answer: (p, ctx) => yearsAnswer(p, ctx.question), note: 'From your skills list; never rounded up.' },
  { key: 'linkedin', re: /\blinked\s*in\b/i, answer: p => str(p.linkedin) },
  { key: 'website', re: /\b(website|portfolio|github|personal (site|url))\b/i, answer: p => str(p.website) },
  { key: 'email', re: /\be-?mail\b/i, answer: p => str(p.email) },
  { key: 'phone', re: /\b(phone|mobile|cell)\b/i, answer: p => str(p.phone) },
  { key: 'preferredName', re: /\bpreferred (first )?name\b/i, answer: p => str(p.preferredName) || firstName(p) },
  { key: 'firstName', re: /\bfirst name\b|\bgiven name\b/i, answer: p => firstName(p) },
  { key: 'lastName', re: /\b(last|family) name\b|\bsurname\b/i, answer: p => str(p.fullName).split(/\s+/).slice(1).join(' ') },
  { key: 'fullName', re: /\b(full )?name\b/i, answer: p => str(p.fullName) },
  { key: 'location', re: /\b(city|location|where (are you|do you live)|address|based)\b/i, answer: p => [str(p.city), str(p.country)].filter(Boolean).join(', ') },
  { key: 'country', re: /\bcountry\b/i, answer: p => str(p.country) },
  { key: 'currentTitle', re: /\bcurrent (job )?title\b|\bmost recent (job )?title\b/i, answer: p => str(p.currentTitle) },
  { key: 'currentEmployer', re: /\b(current|most recent) (employer|company)\b/i, answer: p => str(p.currentEmployer) },
  { key: 'education', re: /\b(degree|education|highest level)\b/i, answer: p => [str(p.highestDegree), str(p.degreeField) && `in ${p.degreeField}`, str(p.school) && `(${p.school})`].filter(Boolean).join(' ') },
  { key: 'school', re: /\b(school|university|college)\b/i, answer: p => str(p.school) },
  { key: 'certifications', re: /\b(certific|licen[cs]e)/i, answer: p => str(p.certifications) },
  { key: 'languages', re: /\blanguages?\b/i, answer: p => str(p.languages) },
  { key: 'hearAbout', re: /\b(hear about|how did you (find|learn)|referr(al|ed)|source)\b/i, answer: p => str(p.referralSource) },
  { key: 'references', re: /\breferences?\b/i, answer: p => str(p.references) || 'Available on request' },
  { key: 'whyLeaving', re: /\bwhy (are you|did you) (leav|look)|\breason for leaving\b/i, answer: p => str(p.whyLeaving) },
  { key: 'weakness', re: /\bweakness/i, answer: p => str(p.weakness) },
  { key: 'strengths', re: /\bstrength/i, answer: p => str(p.strengths) },
  { key: 'careerGoal', re: /\b(five|5|few) years\b|\bcareer goals?\b/i, answer: p => str(p.careerGoal) },
  { key: 'summary', re: /\b(tell us about yourself|summary|about you|introduce yourself)\b/i, answer: p => str(p.summary) },
];

// Questions a template cannot honestly answer: they need the job, or prose.
const OPEN_ENDED = /\b(why (do you want|are you interested|this (role|company|position)|us|join)|cover letter|what (excites|interests|attracts) you|describe a time|tell us about a time|anything else|additional information)\b/i;

const cap = s => str(s).charAt(0).toUpperCase() + str(s).slice(1);
const firstName = p => str(p.preferredName) || str(p.fullName).split(/\s+/)[0] || '';

function relocateAnswer(p) {
  const r = lower(p.willingToRelocate);
  if (!r) return '';
  if (r === 'no') return 'No';
  const where = str(p.relocateWhere);
  return r === 'yes' ? (where ? `Yes (open to ${where})` : 'Yes') : (where ? `Open to it for the right role (${where})` : 'Open to it for the right role');
}

function workModeAnswer(p) {
  const m = lower(p.workMode);
  if (!m) return '';
  if (m === 'remote only') return 'I am looking for fully remote roles.';
  if (m === 'remote or hybrid') return 'Yes to remote or hybrid.';
  if (m === 'onsite or hybrid') return `Yes, I can work onsite or hybrid${str(p.city) ? ` from ${p.city}` : ''}.`;
  return 'Yes, I am open to remote, hybrid or onsite.';
}

function salaryAnswer(p, ctx = {}) {
  const target = num(p.targetBase);
  if (target === null) return '';
  const cur = str(p.currency);
  const style = lower(p.salaryDisclosure);
  // A form field that only takes a number gets a number whatever the style.
  if (ctx.numericOnly) return String(Math.round(target));
  if (style.startsWith('defer')) return `I'm flexible and would like to understand the full package and the budgeted range for this role first. For reference, I'm targeting around ${money(target, cur)} base.`;
  if (style.startsWith('a range')) return `${money(target, cur)} to ${money(Math.round(target * 1.15 / 1000) * 1000, cur)} base, depending on the full package.`;
  return `${money(target, cur)} base, depending on the full package.`;
}

function yearsAnswer(p, question) {
  const skills = parseSkills(p.skills);
  const q = lower(question);
  const hit = skills.filter(s => s.years !== null && mentions(q, s.skill)).sort((a, b) => b.skill.length - a.skill.length)[0];
  if (hit) return String(hit.years);
  // "years of professional / relevant / total experience" with no named skill
  if (/\b(professional|total|relevant|work|overall|industry)\b/.test(q) && num(p.yearsTotal) !== null) return String(num(p.yearsTotal));
  return '';
}

/** Split pasted form text into questions: one per line, numbering and asterisks dropped. */
export function splitQuestions(text) {
  return str(text).split('\n')
    .map(l => l.replace(/^\s*(?:\d+[.)]|[-*•]|q\d*[:.])\s*/i, '').replace(/\s*\*+\s*$/, '').replace(/\s*\((required|optional)\)\s*$/i, '').trim())
    .filter(l => l.length > 1);
}

/**
 * Answer every question in `text` from the profile.
 * Each result: { question, answer, status: 'filled' | 'needs-you' | 'draft-with-ai', rule, note }
 */
export function answerQuestions(text, raw, { job = '' } = {}) {
  const p = normaliseProfile(raw);
  return splitQuestions(text).map(question => {
    if (OPEN_ENDED.test(question)) {
      return { question, answer: '', status: 'draft-with-ai', rule: 'open-ended', note: job ? 'Needs prose about this job: draft it with AI, or write it yourself.' : 'Paste the job description to draft this.' };
    }
    const numericOnly = /\b(numeric|numbers? only|digits only)\b/i.test(question);
    for (const rule of RULES) {
      if (!rule.re.test(question)) continue;
      const answer = rule.answer(p, { question, numericOnly, job });
      if (answer) return { question, answer, status: 'filled', rule: rule.key, note: rule.note || '' };
      return { question, answer: '', status: 'needs-you', rule: rule.key, note: 'Your interview profile has no answer for this yet.' };
    }
    return { question, answer: '', status: 'needs-you', rule: null, note: 'Not a question the profile recognises; answer it yourself or draft it with AI.' };
  });
}

// ---------------------------------------------------------------------------
// Drafting with a model (prompt in, then a deterministic fabrication check)
// ---------------------------------------------------------------------------

export const DRAFT_SYSTEM = [
  'You draft job-application answers for the job seeker described in PROFILE, in their first-person voice.',
  'Use only facts stated in PROFILE. Never invent employers, titles, dates, numbers, skills, degrees or results.',
  'If the question needs a fact PROFILE does not contain, reply exactly NEEDS_INPUT: followed by what is missing.',
  'Be specific to JOB where PROFILE supports it. Plain, confident, no clichés, under 180 words unless asked for a letter.',
  'Never mention that you are an AI, and never state protected characteristics.',
].join('\n');

/** Profile facts as plain text for a prompt: voluntary self-ID and contact details left out. */
export function profileFacts(raw) {
  const p = normaliseProfile(raw);
  const skip = new Set(['email', 'phone', 'pronouns', 'eeoGender', 'eeoRace', 'eeoVeteran', 'eeoDisability', 'references', 'floorBase', 'currentBase', 'competingOffers']);
  return ALL_QUESTIONS.filter(q => !skip.has(q.id) && str(p[q.id]))
    .map(q => `${q.label.replace(/\s*\(.*?\)\s*$/, '')}: ${str(p[q.id])}`).join('\n');
}

export function draftPrompt(question, raw, job = '') {
  return `PROFILE\n${profileFacts(raw)}\n\nJOB\n${str(job) || '(not provided)'}\n\nQUESTION\n${str(question)}`;
}

/**
 * Flag what a draft claims that the profile does not support: numbers (years,
 * percentages, money, counts) and capitalised organisation-like names after
 * "at". Returns [] when nothing is unsupported. A guard, not a proof.
 */
export function checkDraft(draft, raw, job = '') {
  const source = `${profileFacts(raw)}\n${str(job)}`.toLowerCase();
  const issues = [];
  if (/^\s*NEEDS_INPUT:/i.test(draft)) return [{ kind: 'needs-input', text: str(draft).replace(/^\s*NEEDS_INPUT:\s*/i, '') }];
  const sourceNums = new Set((source.match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(/,/g, '')));
  for (const n of new Set((str(draft).match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(/,/g, '')))) {
    if (!sourceNums.has(n)) issues.push({ kind: 'number', text: n });
  }
  for (const m of str(draft).matchAll(/\b(?:at|for|with) ((?:[A-Z][\w&.-]+)(?: [A-Z][\w&.-]+){0,3})/g)) {
    if (!source.includes(m[1].toLowerCase())) issues.push({ kind: 'name', text: m[1] });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Bulk triage of postings
// ---------------------------------------------------------------------------

/** Postings pasted one after another, separated by a line of three or more dashes. */
export function splitPostings(text) {
  return str(text).split(/\n\s*-{3,}\s*\n/).map(t => t.trim()).filter(Boolean).map((body, i) => {
    const firstLine = body.split('\n')[0].trim();
    return { index: i + 1, title: firstLine.slice(0, 120), body };
  });
}

/** Largest yearly salary range in the text, e.g. "$120,000 - $150,000" or "120k-150k". */
export function parseSalaryRange(text) {
  const t = str(text);
  const re = /(?:[$£€]\s?)?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?\s?k)\s*(?:-|–|—|to)\s*(?:[$£€]\s?)?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?\s?k)/gi;
  const val = s => (/k$/i.test(s.trim()) ? parseFloat(s) * 1000 : Number(s.replace(/,/g, '')));
  let best = null;
  for (const m of t.matchAll(re)) {
    const lo = val(m[1]), hi = val(m[2]);
    if (lo >= 10000 && hi >= lo && (!best || hi > best.max)) best = { min: lo, max: hi };
  }
  return best;
}

/**
 * Score one posting against the profile. Returns
 * { verdict: 'apply'|'maybe'|'skip', score 0-100, reasons: [...], blockers: [...], matchedSkills }.
 * Blockers are hard: a deal-breaker word, pay entirely below the floor,
 * sponsorship explicitly refused when you need it, or onsite-only when you
 * want remote only.
 */
export function scorePosting(body, raw) {
  const p = normaliseProfile(raw);
  const text = lower(body);
  const reasons = [], blockers = [];
  let score = 50;

  const titles = list(p.targetTitles);
  const titleHit = titles.find(t => mentions(text, t));
  if (titleHit) { score += 20; reasons.push(`mentions "${titleHit}"`); } else if (titles.length) { score -= 15; reasons.push('none of your target titles appear'); }

  const skills = parseSkills(p.skills).map(s => s.skill).filter(Boolean);
  const matchedSkills = skills.filter(s => mentions(text, s));
  if (skills.length) {
    const share = matchedSkills.length / skills.length;
    score += Math.round(25 * Math.min(1, share * 2));
    reasons.push(`${matchedSkills.length} of your ${skills.length} skills mentioned`);
  }

  for (const w of list(p.mustHaves)) {
    if (mentions(text, w)) { score += 5; reasons.push(`has must-have "${w}"`); } else { score -= 8; reasons.push(`no mention of must-have "${w}"`); }
  }
  for (const w of [...list(p.dealBreakers), ...list(p.avoidIndustries)]) {
    if (mentions(text, w)) blockers.push(`mentions "${w}"`);
  }

  const range = parseSalaryRange(body);
  const floor = num(p.floorBase), target = num(p.targetBase);
  if (range && floor !== null && range.max < floor) blockers.push(`pay tops out at ${money(range.max, p.currency)}, below your walk-away ${money(floor, p.currency)}`);
  else if (range && target !== null && range.max >= target) { score += 10; reasons.push('posted range reaches your target'); } else if (range) reasons.push('posted range is below your target but above your floor');

  if (lower(p.needsSponsorship) === 'yes' && /\b(no|not|unable to|cannot|can't|will not|won't)\b[^.]{0,40}\bsponsor/.test(text)) blockers.push('says it will not sponsor visas');
  const mode = lower(p.workMode);
  const remote = /\b(remote|work from home|wfh|distributed)\b/.test(text) && !/\bnot remote\b|\bno remote\b/.test(text);
  if (mode === 'remote only' && !remote) blockers.push('no sign the role is remote');
  else if (mode === 'remote only' || mode === 'remote or hybrid') { if (remote) { score += 5; reasons.push('remote'); } }

  score = Math.max(0, Math.min(100, score));
  const verdict = blockers.length ? 'skip' : score >= 70 ? 'apply' : score >= 45 ? 'maybe' : 'skip';
  return { verdict, score, reasons, blockers, matchedSkills, salaryRange: range };
}

/** Rank every pasted posting, best first. */
export function triageJobs(text, raw) {
  const order = { apply: 0, maybe: 1, skip: 2 };
  return splitPostings(text).map(post => ({ ...post, ...scorePosting(post.body, raw) }))
    .sort((a, b) => order[a.verdict] - order[b.verdict] || b.score - a.score || a.index - b.index);
}

// ---------------------------------------------------------------------------
// Interview prep
// ---------------------------------------------------------------------------

export const COMMON_QUESTIONS = Object.freeze([
  { q: 'Tell me about yourself.', tags: [], profile: 'summary' },
  { q: 'Why are you leaving your current role?', tags: [], profile: 'whyLeaving' },
  { q: 'What is your greatest strength?', tags: [], profile: 'strengths' },
  { q: 'What is a weakness you are working on?', tags: [], profile: 'weakness' },
  { q: 'Where do you see yourself in a few years?', tags: [], profile: 'careerGoal' },
  { q: 'Tell me about a time you disagreed with a colleague or manager.', tags: ['conflict', 'disagreement', 'communication'] },
  { q: 'Tell me about a time you failed or made a mistake.', tags: ['failure', 'mistake', 'learning'] },
  { q: 'Tell me about a project you are most proud of.', tags: ['proud', 'impact', 'ownership', 'technical'] },
  { q: 'Tell me about a time you worked to a tight deadline.', tags: ['deadline', 'pressure', 'prioritisation', 'prioritization'] },
  { q: 'Tell me about a time you led without formal authority.', tags: ['leadership', 'influence', 'ownership'] },
  { q: 'Tell me about a time you dealt with ambiguity.', tags: ['ambiguity', 'initiative'] },
  { q: 'Tell me about a difficult customer or stakeholder.', tags: ['customer', 'stakeholder', 'communication'] },
  { q: 'Describe a hard technical problem you solved.', tags: ['technical', 'problem-solving', 'debugging'] },
  { q: 'Tell me about a time you improved a process.', tags: ['process', 'efficiency', 'automation'] },
  { q: 'What are your salary expectations?', tags: [], special: 'salary' },
  { q: 'Do you have any questions for us?', tags: [], special: 'questions' },
]);

/**
 * Likely questions for this job, each paired with the profile answer or the
 * story whose tags fit best, plus the job's skills you can speak to.
 */
export function interviewPrep(raw, job = '') {
  const p = normaliseProfile(raw);
  const stories = parseStories(p.stories);
  const jobText = lower(job);
  const used = new Map();
  const items = COMMON_QUESTIONS.map(c => {
    if (c.profile) return { question: c.q, answer: str(p[c.profile]), source: str(p[c.profile]) ? 'your interview answer' : 'missing: add it to your interview' };
    if (c.special === 'salary') return { question: c.q, answer: salaryAnswer(p), source: 'your pay settings' };
    if (c.special === 'questions') return { question: c.q, answer: 'Ask about: how success is measured in the first 90 days; what the team is struggling with now; why the role is open.', source: 'generic' };
    let best = null, bestScore = 0;
    for (const s of stories) {
      const overlap = s.tags.filter(t => c.tags.includes(t)).length;
      const score = overlap * 10 - (used.get(s.title) || 0) * 3; // spread stories across questions
      if (overlap && score > bestScore) { best = s; bestScore = score; }
    }
    if (best) used.set(best.title, (used.get(best.title) || 0) + 1);
    return best
      ? { question: c.q, answer: `${best.title}. ${best.body}`.trim(), source: `story: ${best.title}` }
      : { question: c.q, answer: '', source: `missing: add a story tagged ${c.tags.slice(0, 2).join(' or ')}` };
  });
  const skills = parseSkills(p.skills);
  const jobSkills = jobText ? skills.filter(s => mentions(jobText, s.skill)) : [];
  for (const s of jobSkills) {
    items.push({ question: `Walk me through your experience with ${s.skill}.`, answer: s.years !== null ? `${s.years} years. ` : '', source: 'job mentions this skill: pick a story that uses it' });
  }
  return { items, gaps: items.filter(i => !i.answer || i.source.startsWith('missing')).length, storyCount: stories.length };
}

// ---------------------------------------------------------------------------
// Negotiation
// ---------------------------------------------------------------------------

const round1k = n => Math.round(n / 1000) * 1000;

/**
 * offer: { company, role, base, bonus?, signing?, equity?, deadline? }
 * Returns { decision: 'counter'|'counter-to-floor'|'accept-or-ask-extras', counter, reasons, email }.
 *
 * Convention, not a guarantee: counter once, about 10-15% above the offer and
 * at least at your target, and ask for the next priority if base cannot move.
 */
export function negotiate(offer = {}, raw) {
  const p = normaliseProfile(raw);
  const base = num(offer.base), floor = num(p.floorBase), target = num(p.targetBase);
  const cur = str(p.currency);
  if (base === null) return { decision: null, counter: null, reasons: ['Enter the offered base salary.'], email: '' };
  const reasons = [];
  let decision, counter;
  if (floor !== null && base < floor) {
    decision = 'counter-to-floor';
    counter = round1k(Math.max(target ?? floor, floor));
    reasons.push(`The offer (${money(base, cur)}) is below your walk-away (${money(floor, cur)}). Ask for ${money(counter, cur)}; if they cannot reach your walk-away, you said you would decline.`);
  } else if (target !== null && base >= target * 1.1) {
    decision = 'accept-or-ask-extras';
    counter = null;
    reasons.push(`The offer is at least 10% above your target. Base is strong; consider asking for your next priority instead of more base.`);
  } else {
    decision = 'counter';
    counter = round1k(Math.max(target ?? 0, base * 1.12));
    reasons.push(`Counter at ${money(counter, cur)}: about 12% above the offer${target !== null && counter === round1k(target) ? ' and at your target' : ''}. A single, specific number with a reason tends to work better than a range.`);
  }
  const priorities = list(p.negotiationPriorities).filter(x => !/^base/i.test(x));
  if (priorities.length) reasons.push(`If base cannot move, ask for: ${priorities.slice(0, 2).join(', then ')}.`);
  if (str(offer.deadline)) reasons.push(`They gave a deadline (${offer.deadline}); asking for a few more days is normal.`);

  const name = firstName(p);
  const company = str(offer.company) || 'the team';
  const role = str(offer.role) || 'the role';
  const ask = counter !== null
    ? `Based on the scope of ${role} and my experience${num(p.yearsTotal) !== null ? ` (${num(p.yearsTotal)} years` + (str(p.currentTitle) ? `, currently ${p.currentTitle}` : '') + ')' : ''}, I'd like to ask whether you can bring the base salary to ${money(counter, cur)}. If that's possible, I'm ready to accept.`
    : `The base works for me. Before I sign, I'd like to ask about ${priorities[0] || 'the start date and any signing bonus'}.`;
  const extra = counter !== null && priorities.length ? `\n\nIf there's no flexibility on base, I'd be glad to talk about ${priorities.slice(0, 2).join(' or ')} instead.` : '';
  const email = `Hi,\n\nThank you for the offer for ${role} at ${company}. I'm excited about the team and the work.\n\n${ask}${extra}\n\nThank you,\n${name}`;
  return { decision, counter, reasons, email };
}
