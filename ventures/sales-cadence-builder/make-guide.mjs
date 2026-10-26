// Regenerates sales-cadence-template.html from the engine, so the worked example is always what the tool writes.
// node make-guide.mjs   (page.test.mjs fails if the committed page drifts from this output)
import { writeFileSync } from "node:fs";
import { buildPlan, CADENCES, CHANNEL_LABELS, SAMPLE_PROSPECTS, SAMPLE_SENDER } from "./calc.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PURPOSE = {
  intro: "Who you are, why them, why now, one easy question.",
  connect: "A short note with no pitch, so your name is familiar.",
  call: "Opener, one question, one ask; a 30-second voicemail if they do not pick up.",
  question: "A question about how they handle the problem today, not a pitch.",
  letter: "A one-page letter by post: few sellers send them, so it stands out.",
  proof: "One real result from a similar customer, or, with none to show, ask who owns the problem.",
  breakup: "Say you will stop, and stop.",
};
export function guide() {
  const plan = buildPlan(SAMPLE_PROSPECTS, SAMPLE_SENDER, { start: "2026-10-26", sellerTz: "America/Denver" });
  const dana = plan.tasks.filter((t) => t.prospect === "Dana Reyes");
  const intro = dana.find((t) => t.template === "intro");
  const call = dana.find((t) => t.channel === "call");
  const rows = CADENCES["b2b-classic"].steps.map((s, i) => `<tr><td>${s.day}</td><td>${dana[i].date}</td><td>${CHANNEL_LABELS[s.channel]}</td><td>${PURPOSE[s.template]}</td></tr>`).join("\n        ");
  const faq = [
    ["How many touches should a sales cadence have?", "Most B2B cadences use six to ten touches over two to four weeks. Fewer than five gives up before a busy person has seen you; more than about twelve starts to feel like pressure. The template here uses eight touches over fifteen business days and then stops."],
    ["How long should I wait between sales follow-ups?", "Two to three business days between early touches and three to four between later ones. Spacing that widens over time reads as persistent rather than pushy, and keeping touches on business days means they arrive when people work."],
    ["Which channels should a cadence mix?", "Email, phone and one social or physical touch. Email is cheap and easy to reply to, a call gets a decision in one conversation, a LinkedIn connection makes your name familiar, and a mailed letter stands out because so few sellers send one."],
    ["What should the last email in a cadence say?", "That you will stop, and then stop. Say you will assume the problem is not a priority, that you will not follow up again, and that they can reply if that changes. It is honest, it respects their time, and it gives a busy person an easy moment to answer."],
  ];
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%23321b7e'/%3E%3Ctext%20x='16'%20y='23'%20font-size='20'%20font-family='system-ui,sans-serif'%20font-weight='700'%20text-anchor='middle'%20fill='%23fff'%3ES%3C/text%3E%3C/svg%3E">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>B2B sales cadence template: 8 touches over 15 business days (email, call, LinkedIn, letter)</title>
  <meta name="description" content="A B2B sales cadence template you can copy: eight touches over fifteen business days across email, phone, LinkedIn and a mailed letter, with the email, call script and voicemail for each step, worked through for one prospect.">
  <link rel="canonical" href="./sales-cadence-template.html">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
  <style>
    :root { font: 16px system-ui, sans-serif; color: #1d2330; background: #f4f4f8; }
    body { max-width: 860px; margin: auto; padding: 28px; }
    a { color: #2b4ea8; }
    h1 { font-size: clamp(1.7rem, 4.4vw, 2.5rem); line-height: 1.1; color: #1f2a55; }
    h2 { color: #1f2a55; margin-top: 30px; }
    p, li { line-height: 1.6; }
    table { border-collapse: collapse; width: 100%; font-size: .93rem; background: #fff; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #d6d9e4; vertical-align: top; }
    pre { white-space: pre-wrap; background: #fff; border: 1px solid #d6d9e4; border-radius: 10px; padding: 14px; font: 14px/1.5 system-ui, sans-serif; }
    .note, footer { font-size: .86rem; color: #4a4f5e; }
    .scroll { overflow-x: auto; }
    footer { margin-top: 30px; border-top: 1px solid #d6d9e4; padding-top: 16px; }
    @media (max-width: 720px) { body { padding: 16px; } }
  </style>
</head>
<body>
  <p class="note"><a href="./index.html">Sales Cadence Builder</a> · guide</p>
  <h1>B2B sales cadence template: 8 touches over 15 business days</h1>
  <p>A sales cadence is the order of touches you make with one prospect before you stop. This one mixes four channels, because people answer different ones: <strong>email</strong>, <strong>phone</strong> (with a voicemail when they do not pick up), a <strong>LinkedIn</strong> connection note and a <strong>mailed letter</strong>. Every touch is on a business day, every call is inside the prospect's own business hours, and the last email says you will stop, and you do.</p>
  <p>To build it for your own list with your own words, paste the list into the <a href="./index.html">Sales Cadence Builder</a>. It does the dates, the time zones and the checks, and gives you a CSV task list and a calendar file.</p>

  <h2>The eight steps</h2>
  <p>Worked for an example prospect, starting Monday ${dana[0].date}.</p>
  <div class="scroll"><table>
    <thead><tr><th>Business day</th><th>Date</th><th>Channel</th><th>What it does</th></tr></thead>
    <tbody>
        ${rows}
    </tbody>
  </table></div>

  <h2>Step 1: the first email</h2>
  <p>Short, specific and honest. Say why you are writing to <em>this</em> person now (the trigger), what you do in one sentence, and ask one question that is easy to answer. Your postal address and an opt-out line go at the bottom of every cold email; CAN-SPAM requires both.</p>
  <pre>Subject: ${esc(intro.subject)}

${esc(intro.body)}</pre>

  <h2>The call script and voicemail</h2>
  <p>Ask for permission to talk, ask one question about how they handle the problem today, and make one ask. If they do not pick up, leave a voicemail of about thirty seconds and say your number twice. For this prospect in Colorado, the builder schedules the first call for ${call.date} between ${call.window.label} Denver time, inside 9:00 to 17:00 where they are.</p>
  <pre>${esc(call.body)}</pre>
  <pre>Voicemail: ${esc(call.voicemail)}</pre>

  <h2>Rules that apply to every cadence</h2>
  <ul>
    <li><strong>Remove people first.</strong> Take out anyone on your suppression list or marked do-not-contact, and duplicates, before you plan a single touch. In the example, ${plan.summary.excluded} of ${plan.summary.prospects} rows are left out for exactly these reasons.</li>
    <li><strong>Email needs a lawful basis outside the US.</strong> Canada's CASL needs consent for commercial email, several EU countries need consent even for business email, and in the UK a personal address counts as an individual. Those prospects still get calls, letters and a LinkedIn note.</li>
    <li><strong>Call in their hours, not yours.</strong> The US federal limit is 8am to 9pm in the called person's time and some states end at 8pm; 9am to 5pm their time keeps you inside all of them and inside their working day.</li>
    <li><strong>No invented proof.</strong> If you have no real result from a similar customer, ask who owns the problem instead. Never write a number or a customer name you cannot show.</li>
  </ul>

  <section id="faq">
    <h2>Questions</h2>
${faq.map(([q, a]) => `    <h3>${q}</h3>\n    <p>${a}</p>`).join("\n")}
  </section>

  <footer>
    <p><strong>No warranty.</strong> A template and a worked example, not legal or sales-compliance advice. You are responsible for every message and call you make and for the rules where you and your prospects are. The example people and companies are invented.</p>
    <p>Free and open source under an <a href="LICENSE" rel="noopener">MIT licence</a> — <a href="https://github.com/sponsors/Duncan-Haywood" rel="noopener">support</a> is entirely optional.</p>
  </footer>
</body>
</html>
`;
}
if (import.meta.url === `file://${process.argv[1]}`) writeFileSync(new URL("./sales-cadence-template.html", import.meta.url), guide());
