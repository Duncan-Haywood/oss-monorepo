import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTAKE, ALL_QUESTIONS, completeness, parseSkills, parseStories, splitQuestions, answerQuestions,
  checkDraft, draftPrompt, profileFacts, splitPostings, parseSalaryRange, scorePosting, triageJobs,
  interviewPrep, negotiate,
} from './engine.mjs';

const profile = {
  fullName: 'Sam Rivera Ortiz', email: 'sam@example.com', phone: '555-0100', city: 'Austin, TX', country: 'United States',
  linkedin: 'https://linkedin.com/in/example', workAuthorized: 'yes', needsSponsorship: 'no', workMode: 'remote or hybrid',
  willingToRelocate: 'no', noticePeriod: '2 weeks', over18: 'yes', targetTitles: 'Data Analyst, Analytics Engineer',
  dealBreakers: 'commission only, on-call', mustHaves: 'SQL', currency: 'USD', floorBase: '95000', targetBase: '115000',
  salaryDisclosure: 'my target number', negotiationPriorities: 'base, remote, signing bonus, PTO', yearsTotal: '7',
  currentTitle: 'Senior Analyst', currentEmployer: 'Northwind', skills: 'Python: 6\nSQL: 8\nTableau: 3\nC++: 1',
  summary: 'Analyst who turns messy data into decisions.', referralSource: 'Company careers page',
  stories: 'Automated the close pack [process, automation, ownership]\nReporting took 5 days; I scripted it to 1.\n\nPushed back on a launch date [conflict, communication]\nShowed the data; we moved the date 2 weeks and shipped clean.',
  whyLeaving: 'I want to work closer to product decisions.',
};

test('the intake interview is extensive and every question id is unique', () => {
  assert.ok(INTAKE.length >= 8);
  assert.ok(ALL_QUESTIONS.length >= 50, `only ${ALL_QUESTIONS.length} questions`);
  assert.equal(new Set(ALL_QUESTIONS.map(q => q.id)).size, ALL_QUESTIONS.length);
});

test('completeness lists missing required answers and an inverted pay range', () => {
  const empty = completeness({});
  assert.equal(empty.answered, 3, 'only the three voluntary dropdowns are pre-filled, all to declining');
  assert.ok(empty.missingRequired.some(m => m.id === 'fullName'));
  const bad = completeness({ ...profile, targetBase: '80000' });
  assert.match(bad.problems.join(' '), /below your walk-away/);
  assert.equal(completeness(profile).missingRequired.length, 0);
});

test('skills and stories parse from the free-text fields', () => {
  assert.deepEqual(parseSkills('Python: 6\nSQL - 8 years\nExcel'), [
    { skill: 'Python', years: 6 }, { skill: 'SQL', years: 8 }, { skill: 'Excel', years: null }]);
  const s = parseStories(profile.stories);
  assert.equal(s.length, 2);
  assert.deepEqual(s[1].tags, ['conflict', 'communication']);
  assert.equal(s[0].title, 'Automated the close pack');
});

test('pasted form text splits into clean questions', () => {
  assert.deepEqual(splitQuestions('1. First name *\n\n- Email (required)\nQ3: Phone'), ['First name', 'Email', 'Phone']);
});

test('common application questions are filled from the profile', () => {
  const qs = [
    'First name', 'Last name', 'Email address', 'Are you legally authorized to work in the United States?',
    'Will you now or in the future require sponsorship for employment visa status?',
    'How many years of experience do you have with Python?', 'Years of experience with C++',
    'What are your salary expectations?', 'When can you start?', 'LinkedIn profile', 'How did you hear about us?',
    'Are you willing to relocate?', 'Are you open to a hybrid schedule?', 'Gender', 'Veteran status',
  ].join('\n');
  const byQ = Object.fromEntries(answerQuestions(qs, profile).map(r => [r.question, r]));
  assert.equal(byQ['First name'].answer, 'Sam');
  assert.equal(byQ['Last name'].answer, 'Rivera Ortiz');
  assert.equal(byQ['Email address'].answer, 'sam@example.com');
  assert.equal(byQ['Are you legally authorized to work in the United States?'].answer, 'Yes');
  assert.equal(byQ['Will you now or in the future require sponsorship for employment visa status?'].answer, 'No');
  assert.equal(byQ['How many years of experience do you have with Python?'].answer, '6');
  assert.equal(byQ['Years of experience with C++'].answer, '1');
  assert.match(byQ['What are your salary expectations?'].answer, /115,000 USD/);
  assert.equal(byQ['When can you start?'].answer, '2 weeks');
  assert.equal(byQ['How did you hear about us?'].answer, 'Company careers page');
  assert.equal(byQ['Are you willing to relocate?'].answer, 'No');
  assert.match(byQ['Are you open to a hybrid schedule?'].answer, /remote or hybrid/);
  assert.equal(byQ['Gender'].answer, 'I decline to self-identify', 'voluntary questions default to declining');
  assert.equal(byQ['Veteran status'].answer, 'I decline to self-identify');
});

test('a skill not in the profile is never guessed, and open-ended questions go to the drafter', () => {
  const [kotlin, why] = answerQuestions('How many years of Kotlin experience do you have?\nWhy do you want to work here?', profile);
  assert.equal(kotlin.status, 'needs-you');
  assert.equal(kotlin.answer, '');
  assert.equal(why.status, 'draft-with-ai');
  const [total] = answerQuestions('How many years of professional experience do you have?', profile);
  assert.equal(total.answer, '7');
});

test('salary disclosure styles, and numeric-only fields', () => {
  const [defer] = answerQuestions('Desired salary', { ...profile, salaryDisclosure: 'defer: ask about their range' });
  assert.match(defer.answer, /budgeted range/);
  const [range] = answerQuestions('Salary expectations', { ...profile, salaryDisclosure: 'a range from target upward' });
  assert.match(range.answer, /115,000 USD to 132,000 USD/);
  const [n] = answerQuestions('Desired salary (numbers only)', profile);
  assert.equal(n.answer, '115000');
});

test('the drafting prompt leaves out contact details, self-ID and the walk-away number', () => {
  const facts = profileFacts({ ...profile, eeoGender: 'woman' });
  assert.ok(!facts.includes('sam@example.com'));
  assert.ok(!facts.includes('woman'));
  assert.ok(!facts.includes('95000'), 'the floor must never reach a model or an employer');
  assert.match(draftPrompt('Why us?', profile, 'Acme analytics role'), /QUESTION\nWhy us\?/);
});

test('checkDraft flags numbers and employers the profile does not contain', () => {
  assert.deepEqual(checkDraft('At Northwind I cut reporting from 5 days to 1.', profile), []);
  const issues = checkDraft('I spent 9 years at Contoso Labs and grew revenue 40%.', profile);
  assert.deepEqual(issues.map(i => i.text).sort(), ['40', '9', 'Contoso Labs'].sort());
  assert.equal(checkDraft('NEEDS_INPUT: your reason for this industry', profile)[0].kind, 'needs-input');
});

test('salary ranges parse in common formats', () => {
  assert.deepEqual(parseSalaryRange('Pay: $120,000 - $150,000 per year'), { min: 120000, max: 150000 });
  assert.deepEqual(parseSalaryRange('Base 90k–110k plus bonus'), { min: 90000, max: 110000 });
  assert.equal(parseSalaryRange('Founded 2010-2012, 50-100 staff'), null);
});

const postings = [
  'Analytics Engineer at Acme\nRemote (US). SQL, Python and dbt. $110,000 - $140,000.',
  'Sales Development Rep\nCommission only. Onsite in Dallas.',
  'Data Analyst at Globex\nHybrid in Austin. SQL and Tableau. $70,000 - $85,000.',
  'Office Manager\nRun the front desk. Remote friendly.',
].join('\n---\n');

test('bulk triage ranks postings and names the blocker', () => {
  assert.equal(splitPostings(postings).length, 4);
  const ranked = triageJobs(postings, profile);
  assert.equal(ranked[0].title, 'Analytics Engineer at Acme');
  assert.equal(ranked[0].verdict, 'apply');
  const sdr = ranked.find(r => r.title.startsWith('Sales'));
  assert.equal(sdr.verdict, 'skip');
  assert.match(sdr.blockers.join(' '), /commission only/);
  const globex = ranked.find(r => r.title.startsWith('Data Analyst'));
  assert.equal(globex.verdict, 'skip');
  assert.match(globex.blockers.join(' '), /below your walk-away/);
});

test('remote-only seekers skip postings with no sign of remote; sponsorship refusals block', () => {
  const r = scorePosting('Data Analyst\nOnsite in Austin. SQL.', { ...profile, workMode: 'remote only' });
  assert.equal(r.verdict, 'skip');
  const s = scorePosting('Data Analyst, remote. SQL. We are unable to sponsor visas.', { ...profile, needsSponsorship: 'yes' });
  assert.match(s.blockers.join(' '), /sponsor/);
});

test('interview prep pairs behavioural questions with tagged stories and flags gaps', () => {
  const prep = interviewPrep(profile, 'We use Python and Tableau daily.');
  const conflict = prep.items.find(i => /disagreed/.test(i.question));
  assert.match(conflict.source, /Pushed back on a launch date/);
  const failure = prep.items.find(i => /failed/.test(i.question));
  assert.match(failure.source, /^missing/);
  assert.ok(prep.items.some(i => i.question.includes('Python')));
  assert.ok(prep.gaps > 0);
});

test('negotiation: counter above the offer, to the floor when below it, extras when generous', () => {
  const c = negotiate({ company: 'Acme', role: 'Analytics Engineer', base: 105000 }, profile);
  assert.equal(c.decision, 'counter');
  assert.equal(c.counter, 118000);
  assert.match(c.email, /118,000 USD/);
  assert.match(c.email, /remote or signing bonus/);
  assert.ok(!c.email.includes('95,000'), 'the walk-away number is never put in the email');

  const low = negotiate({ base: 90000 }, profile);
  assert.equal(low.decision, 'counter-to-floor');
  assert.equal(low.counter, 115000);

  const high = negotiate({ base: 130000 }, profile);
  assert.equal(high.decision, 'accept-or-ask-extras');
  assert.equal(high.counter, null);
  assert.match(high.email, /remote/);

  assert.equal(negotiate({}, profile).decision, null);
});
