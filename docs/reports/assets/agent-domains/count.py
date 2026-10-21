"""Count ventures/ and research/ directories per domain by name keywords.

Rough on purpose: names only, so generic names are missed and a few match the
wrong bucket. Run from the repository root:
    python3 docs/reports/assets/agent-domains/count.py
"""
import os
import re

VENTURES = {
    "tax, accounting, payroll, invoicing": r"tax|invoice|payroll|ledger|bookkeep|accounting|vat|receipt|expense|1099|w2|depreciat|amortiz|journal",
    "legal documents": r"contract|lease|clause|legal|nda|will-|estate|notice|tenant|eviction|deposit",
    "logistics and inventory": r"route|freight|ship|inventory|warehouse|logistic|delivery|fleet|pallet",
    "data work (csv, sql)": r"csv|sql|etl|dedup|schema|json|spreadsheet|data-",
    "compliance and audit": r"complian|audit|gdpr|hipaa|osha|ada-|regulat|license|permit|preflight",
    "physical trades, robotics": r"construct|contractor|plumb|roof|lumber|concrete|framing|drywall|paint|electrician|hvac|cnc|print|robot",
    "energy and power": r"energy|solar|grid|battery|power|kwh|electric|heat-pump|hvac",
    "identity, verification, trust": r"identity|kyc|verify|verif|trust|provenance|signature",
}
RESEARCH = {
    "robotics (robofab, osrobot, hanger)": r"^(robofab|osrobot|hanger)-",
    "mechanical design (simdesign)": r"^simdesign-",
    "energy": r"^energy-",
    "verifier, scoring, elicitation": r"verifier|elicitation|verification|slashing|scor",
    "audit mechanisms": r"^audit-",
}


def dirs(root):
    return sorted(d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d)) and not d.startswith(("_", ".")))


for root, buckets in (("ventures", VENTURES), ("research", RESEARCH)):
    names = dirs(root)
    print(f"{root}: {len(names)} directories")
    for label, pattern in buckets.items():
        hits = [n for n in names if re.search(pattern, n)]
        print(f"  {len(hits):4d}  {label}")
