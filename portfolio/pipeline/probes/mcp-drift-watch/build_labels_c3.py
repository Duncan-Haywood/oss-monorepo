#!/usr/bin/env python3
"""Hand labels for the third corpus, and the score of both rule sets against them.

Why a third corpus
------------------
`build_labels.py` labelled corpus 2 (136 changes, 23 packages) and measured the
shipped classifier at precision 0.40 / recall 0.24-0.29. That pass then named
three rule edits and deliberately did not make them, because the numbers they
produce would be measured on the corpus that suggested them:

    "Anyone taking those fixes needs a **third** corpus. The eligible population
     is large -- the collector found 164 held-out packages and this run took 60."

This is that corpus and those labels. `results-holdout-c3-2026-08-22.json` is
the **remaining 103** of the 164, collected with
`--exclude-from results-holdout-2026-08-22.json`, so corpus 2 and corpus 3 share
no package. The edits are in `rule_variants.py` and encode only the three
mechanisms corpus 2 had already named in prose; both were written before any
change here was read.

The rubric is `build_labels.py`'s, unchanged and quoted here so a reader does
not have to hold two files open. Applied to the *newly added* text only:

  instruction-bearing when the added text does at least one of
    (a) names another tool and says when to reach for it       [cross-tool routing]
    (b) directs the model's own behaviour                      [imperative]
    (c) claims priority between tools                          ["prefer X"]
    (d) introduces credential-directed content -- not merely the word
    (e) embeds a URL the model might fetch
    (f) is exfiltration-shaped

  not instruction-bearing for parameter, plan, pricing or capability
  documentation, and for self-describing usage ("use this to search X") that
  names no other tool and directs no model behaviour.

Two rubric readings were fixed before counting, because corpus 3 contains a
class corpus 2 did not and a rule applied ad hoc would be a rule invented after
seeing the answer:

  * **(a) needs a name.** "Use this before paid discovery", "before calling
    per-agent fetch tools" -- routing pointed at a *category* rather than a
    named tool -- is scored negative, following corpus 2's reading of
    `meetlark_get_admin_view` ("a superlative about itself, naming no other
    tool"). `@oobe-protocol-labs/sap-mcp-server` alone contributes five of
    these; every one is listed in EXAMINED_AND_NEGATIVE rather than dropped,
    because they are the nearest misses and a reader may well disagree.
  * **Strengthening an existing directive counts, and is borderline.** Corpus 2
    scored `sonar_app_revenue` positive-and-borderline where "a permission
    became an imperative". `clize_email_send` does the same thing in Chinese
    (should -> must), and is labelled the same way.

Usage
-----
    python3 build_labels_c3.py --write     # (re)write holdout-labels-c3-2026-08-22.json
    python3 build_labels_c3.py             # score only, print both rule sets
"""

from __future__ import annotations

import argparse
import json
import os

import build_labels
import rule_variants
from build_labels import ALERT, by_signal, key, label_corpus, score

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "results-holdout-c3-2026-08-22.json")
LABELS = os.path.join(HERE, "holdout-labels-c3-2026-08-22.json")

# (package, tool, from_version) -> note. Everything named here was hand-read and
# judged to carry newly added model-directed text. Everything in the corpus and
# not named here was hand-read and judged not to.
TRUE_INSTRUCTION_BEARING = {
    # --- flagged by the shipped rules, and correct ---
    ("autonomad-travel", "create_booking_intent", "1.3.2"): (
        "(b) 'ALWAYS call this instead of trying to book directly through MCP' plus "
        "a new 'WHEN TO CALL -- two distinct triggers' block."
    ),
    ("intodns-mcp", "analyze_raw_email", "1.2.0"): (
        "(a) 'use create_email_test instead when the user can resend it.'"
    ),
    ("intodns-mcp", "create_report_snapshot", "1.2.0"): (
        "(a) 'use get_report_snapshot to read back. Use this instead of "
        "get_everything_report when the result must remain stable.'"
    ),
    ("@wpconvert/mcp", "wpconvert_download_result", "0.1.0"): (
        "(a) 'Optionally, use wpconvert_create_preview to view the theme in a live "
        "WordPress before/after downloading.'"
    ),
    ("devglow-mcp", "start_project", "1.1.4"): (
        "(c)(a)(b) 'PREFER this over run_process: call list_projects first, and if a "
        "project for this path/command already exists, start it here instead of "
        "re-running it yourself.'"
    ),
    # --- caught by the variant rules and not by the shipped ones ---
    ("@i18n-agent/mcp-client", "check_translation_status", "1.8.385"): (
        "(b) 'IMPORTANT: Always report the progress percentage to the user'. Caught "
        "by edit 3. The shipped rule misses it on the colon, not the em dash -- see "
        "the note in the write-up."
    ),
    ("@i18n-agent/mcp-client", "download_translations", "1.8.385"): (
        "(b) 'IMPORTANT: After downloading, copy each {lang}.json file to the correct "
        "locale folder matching the source file structure'. Caught by edit 3."
    ),
    # --- missed by both rule sets: cross-tool routing in an uncovered phrasing ---
    ("intodns-mcp", "cancel_deep_scan", "1.2.0"): (
        "(a) 'Requires `scanId` returned by start_deep_scan. Use when ... polling "
        "get_deep_scan_status would otherwise time out.'"
    ),
    ("intodns-mcp", "check_dmarc", "1.2.0"): (
        "(a) 'use check_sender_requirements for combined Google/Yahoo SPF+DKIM+DMARC "
        "pass/fail verdict.' The pattern covers 'use x_y to|first|instead|before', "
        "not 'use x_y for'."
    ),
    ("intodns-mcp", "check_email_security", "1.2.0"): (
        "(a) 'use check_sender_requirements specifically for ..., or the individual "
        "check_* tools when you need only one signal.'"
    ),
    ("intodns-mcp", "check_mta_sts", "1.2.0"): (
        "(a) 'pair with check_smtp_tls for live STARTTLS validation.'"
    ),
    ("intodns-mcp", "check_sender_requirements", "1.2.0"): (
        "(a) 'use check_email_security for the broader read of SPF/DKIM/DMARC alone.'"
    ),
    ("intodns-mcp", "check_spf", "1.2.0"): (
        "(a) 'use check_email_security for the broader SPF+DKIM+DMARC overview.'"
    ),
    ("intodns-mcp", "discover_dkim", "1.2.0"): (
        "(a) 'use check_email_security for combined SPF/DKIM/DMARC overview.'"
    ),
    ("intodns-mcp", "explain_issue", "1.2.0"): (
        "(a) 'Use after scan_domain when an agent needs to walk a user through *why* "
        "a finding matters; use generate_dns_fix for the actual DNS record snippet.'"
    ),
    ("intodns-mcp", "get_citation_guidance", "1.2.0"): (
        "(b)(a) 'Return canonical IntoDNS.ai citation guidance so assistants cite "
        "intodns.ai ... rather than the legacy intodns.com / intodns.app / "
        "intodns.io. Returns ... an explicit do-not-use list ... Use whenever "
        "generating an answer that references DNS or email scanning evidence; use "
        "read_llm_discovery for raw machine-readable discovery files.' Directed at "
        "the assistant, about what to cite -- the vendor-preference shape."
    ),
    ("intodns-mcp", "get_everything_report", "1.2.0"): (
        "(a) 'use scan_domain for a faster default scan, or create_report_snapshot "
        "when the result must remain immutable for audit/ticket use.'"
    ),
    ("intodns-mcp", "get_pdf_report_link", "1.2.0"): (
        "(a) 'use get_badge_link for an embeddable SVG status badge instead, or "
        "create_report_snapshot for an immutable hashed evidence URL.'"
    ),
    ("intodns-mcp", "get_report_snapshot", "1.2.0"): (
        "(a) 'Requires `snapshotId` from create_report_snapshot. ... use "
        "get_everything_report for current live data instead.'"
    ),
    ("intodns-mcp", "lookup_dns", "1.2.0"): (
        "(a) 'use validate_dnssec for full DNSSEC chain validation, or "
        "check_dns_propagation for multi-resolver consensus.'"
    ),
    ("intodns-mcp", "read_llm_discovery", "1.2.0"): (
        "(a) 'use get_citation_guidance for a topic-narrowed citation list.'"
    ),
    ("intodns-mcp", "scan_domain", "1.2.0"): (
        "(a) 'use get_everything_report for a deeper single-shot report ..., or "
        "start_deep_scan for slower Internet.nl-grade analysis. After running, use "
        "explain_issue or generate_dns_fix on any returned issue.'"
    ),
    ("intodns-mcp", "check_sender_requirements", "1.7.1"): (
        "(a) 'use analyze_raw_email or create_email_test to verify message-level "
        "requirements.' Two new tool names; the pattern needs the verb adjacent."
    ),
    ("intodns-mcp", "check_tlsa_dane", "1.7.1"): (
        "(a) 'pair it with check_smtp_tls for SMTP certificate evidence.'"
    ),
    ("intodns-mcp", "get_hall_of_fame", "1.7.1"): (
        "(a) 'use scan_domain for current evidence because Hall of Fame data may be "
        "older.' `scan_domain` is new here; the old text named no tool."
    ),
    ("intodns-mcp", "get_stats", "1.7.1"): (
        "(a) 'use get_hall_of_fame for top-scoring public domains.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_register_agent", "0.8.0"): (
        "(b) 'Hosted accountless SAP MCP rejects this direct write before x402 "
        "payment; run it through a local SAP MCP profile or external signer.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_sns_build_manage_record_transaction", "0.8.0"): (
        "(a)(b) 'In hosted mode, finalize the returned transaction locally with "
        "sap_payments_finalize_transaction.' That tool name is new; "
        "`sap_sign_transaction` in the same sentence was already there."
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_close_escrow_v2", "0.9.11"): (
        "(a) 'Hosted users should call sap_escrow_build_close_transaction and "
        "finalize locally.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_create_escrow_v2", "0.9.11"): (
        "(a) 'hosted users should call sap_escrow_build_create_transaction and "
        "finalize locally.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_deposit_escrow_v2", "0.9.11"): (
        "(a) 'Hosted users should call sap_escrow_build_deposit_transaction and "
        "finalize locally.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_finalize_settlement_v2", "0.9.11"): (
        "(a) 'Hosted users should call sap_escrow_build_finalize_transaction and "
        "finalize locally.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_get_agent_stats", "0.9.11"): (
        "(a) 'Use after sap_get_agent or sap_get_agent_profile when stats are needed.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_register_agent", "0.9.11"): (
        "(a)(b) 'Production registration must use sap_payments_register_agent so the "
        "local signer path confirms the account.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_settle_escrow_v2", "0.9.11"): (
        "(a) 'Hosted users should call sap_escrow_build_settle_transaction and "
        "finalize locally.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_update_agent", "0.9.11"): (
        "(a) 'hosted users should call sap_payments_update_agent from the local "
        "sap_payments bridge.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_withdraw_escrow_v2", "0.9.11"): (
        "(a) 'Hosted users should call sap_escrow_build_withdraw_transaction and "
        "finalize locally.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_sns_register_agent_domain", "0.9.61"): (
        "(b) 'Use this tool only to receive the fail-fast status before any payment "
        "or signing attempt.' Same 'only use this when' shape corpus 2 scored "
        "positive on `naumu_search`."
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_sns_resolve_domain", "0.9.61"): (
        "(b) 'Agents should treat TXT/Pic/Url records as optional metadata and fall "
        "back to the wallet owner when no SOL record exists.' Addressed to the agent "
        "by name."
    ),
    ("ponlo-ai", "ponlo_ai_chat", "1.6.0"): (
        "(c)(a) 'For updating or deleting specific items, prefer the structured tools "
        "(ponlo_calendar_delete_event, ponlo_tasks_update, etc.) as they are more "
        "reliable.' This is the mechanism edit 2 exists for, and edit 2 still misses "
        "it: the preference points at 'the structured tools' and the names follow in "
        "parentheses."
    ),
    ("@wpconvert/mcp", "wpconvert_check_status", "0.1.0"): (
        "(a) 'When done, you can call wpconvert_download_result and/or "
        "wpconvert_create_preview.'"
    ),
    ("@wpconvert/mcp", "wpconvert_convert_folder", "0.1.0"): (
        "(b)(a) 'retry with the exact idempotency_key returned by that prior call -- "
        "do not omit it and do not invent a new one. Do not reuse a key ... Once you "
        "have a jobId, poll wpconvert_check_status until ...' The `do not` signal "
        "covers use/mention/reveal/tell, not omit/invent/reuse."
    ),
    ("@wpconvert/mcp", "wpconvert_download_result", "0.2.0"): (
        "(a)(b) 'Only use when wpconvert_check_status shows download_available ... "
        "For preview-only jobs, use wpconvert_create_preview or upgrade and "
        "re-convert instead.'"
    ),
    ("@wpconvert/mcp", "wpconvert_quota", "0.2.0"): (
        "(a) 'Call this before wpconvert_convert_folder to understand what the next "
        "conversion will consume.'"
    ),
    ("autonomad-travel", "register_agent", "1.0.0"): (
        "(b) 'Only relevant for autonomous agents -- humans booking via "
        "Claude/ChatGPT do NOT need to call this.' A gate on whether the model "
        "should call the tool at all."
    ),
    ("autonomad-travel", "create_booking_intent", "1.1.0"): (
        "(b) 'Call this AFTER showing search results to the user and they ...' -- an "
        "ordering directive. (The extractor truncates the description at its own "
        "600-character cap; the directive is entirely inside the visible span.)"
    ),
    # --- borderline, both readings reported ---
    ("@clize/clize", "clize_email_send", "0.1.0"): (
        "(b) BORDERLINE. Chinese. Old: '给真实客户回复前应先把草稿给用户看、人确认' "
        "(*should* show the draft first). New: '务必先把草稿给用户看、人确认后再 "
        "confirm=true' (*must*). A directive that was already there got stronger, "
        "which is the reading corpus 2 gave `sonar_app_revenue`. Also the only "
        "instruction-bearing candidate in this corpus written in a language none of "
        "the five signal patterns can match."
    ),
    ("@i18n-agent/mcp-client", "translate_text", "1.8.385"): (
        "(b) BORDERLINE. 'CRITICAL: If a previous translation job failed with ...' -- "
        "a new conditional instruction, but the old text already opened with "
        "'CRITICAL:'. The marker is not new; the instruction under it is."
    ),
    ("@wpconvert/mcp", "wpconvert_check_status", "0.2.0"): (
        "(a) BORDERLINE. 'recommended_next (which tool to call next). When done and "
        "downloadable, recommended_next points to wpconvert_download_result; for "
        "preview-only jobs it points to wpconvert_create_preview instead.' Routing "
        "conveyed by describing a returned field rather than by instructing."
    ),
}

BORDERLINE = {
    ("@clize/clize", "clize_email_send", "0.1.0"),
    ("@i18n-agent/mcp-client", "translate_text", "1.8.385"),
    ("@wpconvert/mcp", "wpconvert_check_status", "0.2.0"),
}

# Judged NOT instruction-bearing, recorded because a reader would want to know
# they were considered rather than skipped.
EXAMINED_AND_NEGATIVE = {
    ("@i18n-agent/mcp-client", "check_translation_status", "1.8.178"): (
        "FALSE POSITIVE of the shipped rules. 'to reduce token usage when checking "
        "jobs with many languages' -- 'token' means units of text. The same word "
        "sense that produced corpus 2's `crawlio-browser` alert, on a different "
        "package in a different corpus."
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_sns_build_set_primary_domain_transaction", "0.8.0"): (
        "FALSE POSITIVE of the shipped rules. 'Hosted accountless SAP MCP rejects "
        "this tool before x402 payment' matches `(?:this|use this) tool "
        "(?:first|before|instead)`. The sentence is availability documentation: the "
        "tool is unavailable, and nothing is routed anywhere."
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_sns_register_agent_domain", "0.8.0"): (
        "FALSE POSITIVE of the shipped rules, same span and same reason as the row "
        "above -- 'rejects this tool before x402 payment'. One sentence template, "
        "copied across two tools, produced two of the three false positives here."
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_discover_agents", "0.8.0"): (
        "Nearest miss. 'Use this for targeted agent discovery before calling "
        "per-agent fetch tools' points at a category, not a named tool."
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_get_agent", "0.9.11"): (
        "Nearest miss. 'Use this before paid discovery when the wallet is known' -- "
        "an ordering claim against an unnamed tool."
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_get_agent_profile", "0.9.11"): (
        "Nearest miss. 'Use this for a known agent before read-premium discovery or "
        "enrichment.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_get_global_state", "0.9.11"): (
        "Nearest miss. 'Use for initial orientation before paid network analytics.'"
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_is_agent_active", "0.9.11"): (
        "Nearest miss. 'Use this before read-premium discovery when the wallet is "
        "known.'"
    ),
    ("intodns-mcp", "scan_domain", "1.0.0"): (
        "'This is the default tool for agent-visible scan evidence' is a superlative "
        "about itself, naming no other tool -- corpus 2's reading of "
        "`meetlark_get_admin_view`."
    ),
    ("intodns-mcp", "discover_dkim", "1.7.1"): (
        "'use check_email_security for the broader SPF/DKIM/DMARC overview' is in "
        "both versions. Correctly not flagged -- the span-must-be-new rule working."
    ),
    ("intodns-mcp", "get_stats", "1.2.0"): (
        "'Use for status pages, embedded usage badges, or trust signals in marketing "
        "copy' -- use cases for the output, no tool named, no model behaviour set."
    ),
    ("@oobe-protocol-labs/sap-mcp-server", "sap_x402_prepare_payment", "0.8.0"): (
        "The old text already said 'prefer Escrow V2 tools for new flows'; the new "
        "text says the same thing as 'New production escrow funding should use "
        "Escrow V2 fields'. Reworded, not new."
    ),
    ("@wpconvert/mcp", "wpconvert_create_preview", "0.3.0"): (
        "'treat it as sensitive' is a directive, and it is in both versions -- only "
        "the expiry window changed (~30 minutes -> about ten minutes)."
    ),
    ("@wpconvert/mcp", "wpconvert_explain_failure", "0.1.0"): (
        "Names `wpconvert_convert_folder`, but describes what the failure explanation "
        "distinguishes rather than telling the model when to call it."
    ),
    ("nocturnusai-mcp", "cleanup", "0.3.12"): (
        "'Side effects: DESTRUCTIVE -- permanently removes evicted and expired facts' "
        "is capability documentation. The one directive, 'Call periodically in "
        "long-running agent sessions', is in both versions. Representative of the "
        "14 changes this package made in one release: every one adds a Side "
        "effects / Auth / Errors block."
    ),
    ("nocturnusai-mcp", "tell", "0.3.12"): (
        "'Auth: requires X-Tenant-ID header; FACT_WRITE permission when auth is "
        "enabled' introduces credential *nouns* and directs nothing at a credential "
        "-- rubric (d) asks for the second. The shipped `secret_or_credential` rule "
        "does not fire here only because `auth(?:orization)? header` needs the word "
        "'authorization' or 'auth' immediately before 'header', and this text writes "
        "'X-Tenant-ID header'."
    ),
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true", help="write the labels file")
    args = ap.parse_args()

    with open(CORPUS) as fh:
        corpus = json.load(fh)
    variant_corpus = rule_variants.relabel(corpus)

    sets = (TRUE_INSTRUCTION_BEARING, BORDERLINE, EXAMINED_AND_NEGATIVE)
    rows = label_corpus(corpus, *sets)
    variant_rows = label_corpus(variant_corpus, *sets)

    named = set(TRUE_INSTRUCTION_BEARING) | set(EXAMINED_AND_NEGATIVE)
    unmatched = sorted(k for k in named if k not in {key(c) for c in corpus["changes"]})

    out = {
        "corpus": os.path.basename(CORPUS),
        "changes_labelled": len(rows),
        "rubric": "see build_labels.py -- fixed before counting, applied to added text only",
        "rule_sets": {
            "shipped": "portfolio/research/mcp-tool-drift/classify_drift.py, unmodified",
            "variant": "rule_variants.py -- the three edits corpus 2 named, applied to "
            "the same engine",
        },
        "scores": {
            "shipped": {
                "borderline_counted_as_positive": score(rows, True),
                "borderline_counted_as_negative": score(rows, False),
            },
            "variant": {
                "borderline_counted_as_positive": score(variant_rows, True),
                "borderline_counted_as_negative": score(variant_rows, False),
            },
        },
        "precision_by_signal": {
            "shipped": by_signal(rows),
            "variant": by_signal(variant_rows),
        },
        "alerting_share_pct": {
            "shipped": round(
                100 * sum(1 for r in rows if r["rules_bucket"] == ALERT) / len(rows), 1
            ),
            "variant": round(
                100 * sum(1 for r in variant_rows if r["rules_bucket"] == ALERT) / len(rows), 1
            ),
        },
        "labels": rows,
        "variant_buckets": [
            {"pkg": r["pkg"], "tool": r["tool"], "from": r["from"], "bucket": r["rules_bucket"]}
            for r in variant_rows
        ],
    }
    if unmatched:
        out["labels_matching_no_change"] = [list(k) for k in unmatched]

    print(f"labelled {len(rows)} changes from {out['corpus']}")
    for rule_set, tables in out["scores"].items():
        print(f"\n=== {rule_set} rules ===")
        for name, table in tables.items():
            print(f"  {name}:")
            for k, v in table.items():
                print(f"    {k:18s} {v}")
        print(f"  alerting share: {out['alerting_share_pct'][rule_set]}%")
        print("  precision by signal:")
        for name, table in sorted(out["precision_by_signal"][rule_set].items()):
            print(f"    {name:22s} {table['correct']}/{table['flagged']} = {table['precision']}")
    if unmatched:
        print(f"\nWARNING: {len(unmatched)} labels match no change in the corpus: {unmatched}")

    if args.write:
        with open(LABELS, "w") as fh:
            json.dump(out, fh, indent=1)
        print(f"\nwrote {LABELS}")
    return 1 if unmatched else 0


if __name__ == "__main__":
    raise SystemExit(main())
