# Importing an organization's documents (SWIF data load)

How to load a customer's documents into their Grant Autopilot organization in bulk, using
`scripts/bootstrap-org.mjs` and `scripts/import-documents.mjs`. Written for the first customer,
Southwest Indian Foundation (SWIF, Gallup NM), but nothing here is specific to SWIF.

Run every command from `apps/grants`. You need Node 22 or later. The scripts have no dependencies.

---

## 0. This all runs under the NDA's permitted use

SWIF's documents reach us under an NDA. Every step below is part of the use it permits:
setting up and operating **SWIF's own organization** in Grant Autopilot. Nothing else is permitted.

- **Use the documents only to load SWIF's org.** Do not use them as test fixtures, eval cases,
  demo data, prompt examples or seed data, and do not use them for any other customer. They
  must not appear in this repository, in issues or PRs, in screenshots, or in chat or AI tools
  outside the product.
- **Keep the folder outside the git checkout**, for example `~/nda/swif/docs`, on an encrypted
  disk. The import script prints a warning if `--dir` is inside a git working tree. Do not
  "fix" that by adding a `.gitignore` entry. Move the folder instead.
- **Treat the outputs as confidential too.** The manifest and `import-report.json` contain no
  file contents. They do contain file names, funder names and amounts, which can be
  confidential. Both are written with owner-only permissions (`0600`). Keep them next to the
  NDA folder, never in the repo.
- **Upload to SWIF's org only.** Before uploading, the import script shows the target
  organization's name and asks you to confirm it. Read the name before you answer.
- **When the load is done**, delete or return your local copies as the NDA requires. Inside the
  product, documents stay under SWIF's control: they can delete any of them, and deleting a
  document also deletes its passages, search entries and derived facts.

Every upload is sent with `consent=true`. That records (with your user id, a hashed IP and the
policy version) that **you confirm SWIF has the right to share the document and agrees to its
processing** under the Data Use Policy. Only upload what SWIF has authorized.

## 1. What NOT to upload

Grant Autopilot needs organizational facts: mission, programs, history, outcomes, budgets,
funders. It does **not** need information about individual people. Leave these out of the folder:

- **Client and participant records.** Anything about individual people SWIF serves: case
  notes, intake or application forms from clients, rosters, waitlists, eligibility files,
  housing or scholarship applicant files, and photos of identifiable clients (especially minors).
- **Identifiers.** Social Security numbers and ITINs, tribal enrollment or census numbers,
  dates of birth, driver's license or passport numbers, bank account or card numbers. Also
  W-2, W-9, I-9, payroll, personnel and background-check files.
- **Health information.** Medical, behavioral-health, disability or substance-use information
  about anyone (HIPAA / 42 CFR Part 2 territory), even when it is anonymized only by first name.
- **Individual donor records.** Donor lists that include home addresses or giving histories.
  Aggregate numbers ("312 donors gave $1.2M") are fine.
- **Credentials and third-party confidential material.** Passwords, portal logins, bank
  statements, or a partner's confidential documents that SWIF cannot share.

If a useful document (for example a past application) contains a section like this, **redact
it before upload**. Use real redaction that removes the text, such as a PDF editor's Redact
tool, and then export. Drawing black boxes over the text layer is not enough, because the
words are still in the file.

The script has a safety net, but it **cannot replace a human look at every file**:

- Files whose names suggest personal data are **blocked**. Examples: `clients`, `participants`,
  `intake`, `case notes`, `roster`, `SSN`, `medical`, `HIPAA`, `W-9`, `payroll`, `personnel`.
- Plain-text files (`.txt .md .csv .html .rtf`) that contain a number shaped like an SSN
  (`NNN-NN-NNNN`) are **blocked**.
- The script **cannot see inside** PDF, Word, Excel or image files. Checking those is your job.

A blocked file is uploaded only after you list it in the manifest with an explicit kind (see
section 5). Before you do that, open the file and make sure the block is a false positive. For
example, a program description titled "Client Services" is fine.

## 2. Create the organization (once)

Skip this step if SWIF's org already exists. To find its id, open the org in the app: the URL
is `/orgs/<orgId>/…`.

`bootstrap-org.mjs` creates the org through `POST /api/orgs`. **The person who signs in becomes
the owner, and that person is the one accepting the Terms, Privacy Policy and Data Use Policy
for SWIF.** That should be SWIF's authorized signer. If you run the script for them, they
must be at the keyboard and type their own password.

```sh
# 1) Print the terms and data-use summary. Exits without creating anything.
node scripts/bootstrap-org.mjs --base https://grants.example --email director@swif.example \
  --legal-name "Southwest Indian Foundation, Inc." --name "Southwest Indian Foundation" \
  --org-type nonprofit_501c3 --city Gallup --state NM

# 2) After the owner has read the policies: create the org, invite teammates, request the pilot plan.
node scripts/bootstrap-org.mjs --base https://grants.example --email director@swif.example \
  --legal-name "Southwest Indian Foundation, Inc." --name "Southwest Indian Foundation" \
  --org-type nonprofit_501c3 --city Gallup --state NM --accept-terms \
  --invite grants@swif.example:editor,board@swif.example:reviewer \
  --comp --admin-email you@operator.example
```

- `--org-type` is one of `nonprofit_501c3, tribal_government, tribal_organization, faith_based,
  community_based, educational, government, fiscally_sponsored, other`.
- `--invite` takes `email:role` pairs. The roles are `admin, editor, reviewer, viewer`, and
  `viewer` is the default. Each invitee receives an email link.
- `--comp` asks for the complimentary pilot plan through `POST /api/admin/orgs/:orgId/comp`.
  That call needs a platform-admin account. With `--admin-email`, the script signs in as that
  account separately, which means a second password prompt. If the deployment doesn't have the
  route yet, the script reports a 404 and carries on. In that case an operator grants the plan
  by hand.
- If the signed-in account already belongs to an org with the same name, the script refuses to
  create another one unless you pass `--allow-duplicate`.
- The script prints the new `orgId` on stdout. You need it in the next steps.

To import the documents yourself, ask the owner to invite you as an **editor**, then accept the
invitation in the app.

## 3. Organize the folder

The kind of each document comes from its **folder**. Use these folder names. Case, spaces,
`-` and `_` don't matter, so "Past Applications" and `past_applications` are the same folder.

```
swif-docs/
  mission/                         mission_statement
  governance/bylaws.pdf            charter_bylaws    (a filename match works too)
  annual-reports/                  annual_report
  financials/                      financial_statement  (audits, Form 990s)
  budgets/                         budget
  programs/                        program_description
  past-applications/
    awarded/                       past_application + pastOutcome=awarded  (also: funded, approved)
    declined/                      past_application + pastOutcome=declined (also: rejected, not funded)
    pending/                       past_application + pastOutcome=pending  (also: submitted)
  award-letters/                   award_letter
  rejection-letters/               rejection_letter
  letters-of-support/              letter_of_support
  transcripts/                     interview_transcript
  policies/                        policy
  other/                           other
```

How the kind is decided:

1. The **manifest** wins if it sets a kind (section 5).
2. Otherwise the **deepest folder** that matches a rule wins. For example, `financials/budgets/x.xlsx`
   is a `budget`.
3. If no folder matches, the **filename** is used. For example, `Mission Statement.docx` is a
   `mission_statement`, and `Form 990 2022.pdf` is a `financial_statement`.
4. If nothing matches, the kind is `other`. The dry run flags those files so you can sort them.

Things to watch for:

- **Put award and rejection letters in their own folders**, not under `past-applications/`.
  Anything under `past-applications/` is treated as an application.
- **Outcomes matter.** Awarded and declined applications are the strongest signal of what works
  for SWIF. Put each one in an outcome subfolder, or set `pastOutcome` in the manifest.
- **Allowed types:** `pdf, docx, doc, txt, md, markdown, html, htm, csv, xlsx, rtf, png, jpg, jpeg`.
  Each file can be **at most 25 MB** and must not be empty. Convert `.pptx`, `.xls`, `.pages`
  and `.key` files to PDF. Split or compress large scans.
- Hidden files (`.DS_Store`), Office lock files (`~$…`), `Thumbs.db` and `desktop.ini` are
  ignored. Symlinks are not followed.
- **Identical files are uploaded once.** The server rejects duplicate content. The script keeps
  the best-classified copy and marks the others as `duplicate`.
- Password-protected PDFs can't be processed. Remove the password first, with SWIF's permission.

## 4. Generate the manifest (recommended)

A manifest lets you add the details the folder can't express, such as funder, amount, year and
title. It also lets you exclude individual files.

```sh
node scripts/import-documents.mjs --dir ~/nda/swif/docs --make-manifest --manifest ~/nda/swif/manifest.csv
```

This writes one row per file, with the inferred `kind` and `pastOutcome` filled in. Rows that
are blocked or invalid start out as `kind=skip`, with a `REVIEW:` or `CANNOT UPLOAD:` note.
Open the file in a spreadsheet, fill it in, and save it as CSV. The command won't overwrite an
existing manifest unless you pass `--force`.

## 5. Manifest columns

| Column          | Meaning                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`          | **Required.** The path relative to `--dir`, e.g. `past-applications/awarded/NMCF 2023.pdf`. Either slash direction works.                                |
| `kind`          | A document kind (`mission_statement`, `charter_bylaws`, `annual_report`, `financial_statement`, `budget`, `program_description`, `past_application`, `award_letter`, `rejection_letter`, `letter_of_support`, `interview_transcript`, `website_page`, `policy`, `other`). `skip` means the file is never uploaded. Leave it blank to infer. |
| `title`         | The display title, up to 300 characters. Leave it blank to use the filename.                                                                            |
| `pastOutcome`   | `awarded`, `declined`, `pending` or `unknown`. Used for past applications.                                                                              |
| `pastFunder`    | The funder's name, e.g. `New Mexico Community Foundation`.                                                                                              |
| `pastAmountUSD` | The amount requested or awarded, in **dollars**, e.g. `12500` or `$12,500.00`. The script converts it to cents.                                         |
| `pastYear`      | A four-digit year, from 1900 to 2100.                                                                                                                    |
| `notes`         | Up to 5,000 characters, stored with the document. **Every SWIF member can see them**, so don't put sensitive commentary here. Template `REVIEW:` / `CANNOT UPLOAD:` notes are never sent. |

Rules:

- Blank cells mean "infer" or "not set". Columns can be in any order, and header case doesn't
  matter. An unknown column is an error, which catches typos like `outcome`.
- Every row is validated before anything is uploaded. Errors are reported with their line
  numbers. A path that matches no file in the folder is also an error.
- Files in the folder but not in the manifest still get a kind inferred, and the dry run flags
  them as `not in manifest`.
- Fill in the `past*` columns from the documents themselves, such as the award letter or the
  application's cover page. **Never guess them.** They become facts the drafting system may cite.

## 6. Dry run first

```sh
node scripts/import-documents.mjs --dir ~/nda/swif/docs --manifest ~/nda/swif/manifest.csv \
  --dry-run --report ~/nda/swif/dry-run-report.json
```

A dry run uses no network and needs no password. It prints one row per file:

- `KIND` / `OUTCOME` / `FROM` show what will be sent and where the kind came from: `manifest`,
  `folder`, `filename` or `default`.
- `ACTION` is one of these:
  - `upload`: the file will be sent.
  - `invalid`: the file has the wrong type, is over 25 MB, or is empty.
  - `blocked`: the file may hold personal data (section 1).
  - `duplicate`: the file is identical to another file in the folder.
  - `excluded`: the file is marked `kind=skip`, or it is a symlink or special file.
- `NOTE` shows warnings, such as a past application without an outcome, a file not in the
  manifest, or a file where no rule matched.

Fix the folder or the manifest and repeat the dry run until every row is what you intend.
**Pay particular attention to every `blocked` row and to every `other` row.**

## 7. Run the import

```sh
node scripts/import-documents.mjs --base https://grants.example --email you@operator.example \
  --org <orgId> --dir ~/nda/swif/docs --manifest ~/nda/swif/manifest.csv \
  --report ~/nda/swif/import-report.json
```

What happens:

1. **Password.** The script prompts for your password without echoing it. It never accepts
   the password as a flag, so it can't end up in shell history or `ps`. You can pipe it from a
   password manager instead, e.g. `op read op://… | node scripts/import-documents.mjs … --yes`.
   When the password is piped, `--yes` is required, because there is no terminal to confirm on.
2. **Sign in and check.** The script signs in with `POST /api/auth/sign-in/email`. Every
   request carries `Origin: <base>`, which the Worker's CSRF check requires. The script then
   checks with `GET /api/me` that you are an editor or above in `--org`. It prints the org's
   name and asks you to confirm.
3. **Upload.** Files are uploaded with `--concurrency` parallel requests: 2 by default, 4 at
   most. Each upload sends `consent=true`. The server's responses are handled like this:
   - `201` means the file was uploaded.
   - `409 duplicate_document` means the file was **skipped** because it is already in the org.
   - `413` and `415` are errors (file too large, unsupported type).
   - `429` and transient `502/503/504` errors are retried with backoff, honoring `Retry-After`.
   - `401`, `403` and `404` stop the run, because they mean the session, role or org is wrong.
4. **Processing.** The script polls the document list until each document is `ready` or
   `failed`. It waits up to 15 minutes; change that with `--poll-timeout <sec>`, or skip waiting
   with `--no-wait`.
5. **Report.** The script prints a summary table, writes `--report`, and signs out. The exit
   code is 1 if anything errored, was not attempted, or failed processing.

**Re-running is safe.** Files that were already uploaded come back as `skipped (duplicate)`, so
after fixing a problem you can run exactly the same command again.

## 8. Verify the facts in the Fact base

Uploading only produces **proposed** facts. Drafts may only assert confirmed facts, so the load
isn't done until the facts have been reviewed.

1. **Documents** (`/orgs/<orgId>/knowledge/documents`). Check that every document is *Ready*.
   For a *Failed* document, open it and read the error. Then use **Reprocess**, or upload a
   cleaner PDF or Word version (scanned images and password-protected files are the usual
   causes). Check that past applications show the right outcome, funder, amount and year.
2. **Fact base** (`/orgs/<orgId>/knowledge/facts`). Filter to **Proposed**. For each fact,
   compare the statement with its **source quote** and document, then take one of these actions:
   - **Confirm** facts that are accurate. Use **Confirm selected** only for facts you have actually read.
   - **Edit** facts that are almost right, such as a wrong year or a rounded figure. Then
     confirm them.
   - **Reject** facts that are wrong, outdated, or about an individual person. A fact about a
     client should not exist at all. If one must be kept, set its sensitivity to `restricted`
     (`PATCH /api/orgs/<orgId>/facts/<id>` `{ "sensitivity": "restricted" }`). Restricted facts
     are never sent to drafting.
3. **Who confirms.** SWIF staff should confirm anything you can't verify from the documents
   yourself, such as current staff counts, this year's budget, or outcomes after the documents
   were written. Leave those as proposed and walk through them with SWIF.
4. **Coverage.** The Coverage panel on the Fact base page lists the topics that are *missing* or
   *thin*. Fill those gaps with the onboarding interview rather than by hunting for more documents.

Spot-check at least one document from each kind against its facts. Spot-check every awarded
and declined past application.

## 9. Undoing a mistake

If something was uploaded that shouldn't have been, such as client data or the wrong file,
**delete the document in the app right away**. You can do this from Documents, then the
document, then Delete, or with `DELETE /api/orgs/<orgId>/documents/<id>`. Deleting a document
also removes its stored file, extracted passages, search entries and derived facts. Then tell
SWIF's contact what happened, as the NDA requires.

## 10. Troubleshooting

| Message                                         | Fix                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Sign-in failed: Invalid email or password`     | Check the account. Sign-in is rate limited to about 10 attempts a minute.                       |
| `… is not a member of org_…`                    | Wrong `--org`, or your invitation hasn't been accepted yet.                                     |
| `… uploading needs editor or above`             | Ask an owner or admin to change your role.                                                      |
| `bad_origin` (403)                              | Use the app's own origin for `--base`, the one in the browser's address bar.                    |
| `--base must be https://`                       | Plain http is only allowed for `localhost`.                                                     |
| `manifest error: Line N: …`                     | Fix that row. Nothing is uploaded until the manifest is clean.                                  |
| `still rate limited after retries`              | Wait a few minutes and re-run. Files that were already uploaded are skipped.                    |
| Document *Failed* after upload                  | See section 8, step 1.                                                                          |
| `policy_version_mismatch` (bootstrap)           | The policies changed. Re-run without `--accept-terms`, re-read them, then accept.               |
