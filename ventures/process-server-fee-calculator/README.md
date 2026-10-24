# Process Server Fee & Route Profit Calculator

Independent process servers can use this free browser-local calculator to find real net profit for one service-of-process job — after extra-attempt, rush, and skip-trace add-ons, mileage, and the server's own vehicle cost and time — then compare two or three clients' fee schedules by what they actually pay per hour, not just their headline base fee. **After using this, you can tell which of two clients paying different base fees for the same kind of job is actually worth serving for, which used to mean a guess about how much a hard-to-find defendant and a long drive were quietly eating into a "good" flat rate.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/process-server-fee-calculator/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why a flat per-serve fee is the wrong number to judge a client by

A $65-a-serve client can still pay a few dollars an hour once the real costs come out — costs an independent 1099 process server carries alone, not the client:

- **Attempts are not guaranteed.** A base fee usually covers one or two attempts; a defendant who is hard to find adds fees the flat rate never priced in.
- **A bad address can mean skip tracing before you can even attempt service** — a real cost and a real delay the client's mileage or per-attempt add-ons rarely cover in full.
- **Vehicle cost runs on every mile driven, not just the miles a client's mileage add-on pays for.** A base fee's included-mileage radius is where the client's cost stops; it is not where the server's cost stops.
- **Rush and same-day surcharges change the effective rate**, but only if they are actually billed — a client who calls a job "rush" without paying the surcharge is asking for the same margin compression under a different name.

The comparison table then answers the question one job's profit can't: given two or three real client fee schedules, which one actually pays the best effective hourly rate for the same kind of job?

## Privacy and usage

Everything runs in your browser. Your job figures are saved locally on this device so you don't retype them; your client comparison rows are never uploaded and are cleared on refresh by design. We count anonymous local feature events only (`job-priced`, `clients-compared`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No client names, fees, or job figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not determine whether service was validly effected under any state's rules of civil procedure, whether you are licensed, bonded, or registered to serve process in a jurisdiction, or whether an affidavit of service will hold up in court — verify all of that independently. It does not audit your books or replace your own insurance, bond, or accountant.

MIT licensed. See `LICENSE`.
