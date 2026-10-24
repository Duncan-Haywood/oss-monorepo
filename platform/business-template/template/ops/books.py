#!/usr/bin/env python3
"""Plain-text double-entry books for finance/ledger.csv.

The ledger is a CSV with one row per posting:

    date,txn,account,amount,currency,memo,source

Every transaction (rows sharing a `txn` id) must sum to zero per currency.
Accounts start with Assets, Liabilities, Equity, Income or Expenses
(`Expenses:Hosting`, `Income:Sales`). `source` names the document the row
came from (a bank-statement line, an invoice file), because the books record
what happened, never an estimate.

    python3 ops/books.py check              # every transaction balances
    python3 ops/books.py pnl --month 2026-11
    python3 ops/books.py balance

This is bookkeeping, not tax or accounting advice; the owner's accountant
signs off on anything filed.
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "finance" / "ledger.csv"
COLUMNS = ["date", "txn", "account", "amount", "currency", "memo", "source"]
ROOTS = ("Assets", "Liabilities", "Equity", "Income", "Expenses")


def read(path: Path = LEDGER) -> list[dict]:
    with path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != COLUMNS:
            raise ValueError(f"{path.name}: header must be {','.join(COLUMNS)}")
        return list(reader)


def problems(rows: list[dict]) -> list[str]:
    out = []
    totals: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    for n, row in enumerate(rows, start=2):
        if row["account"].split(":")[0] not in ROOTS:
            out.append(f"line {n}: account {row['account']!r} must start with one of {', '.join(ROOTS)}")
        if len(row["date"]) != 10 or row["date"][4] != "-" or row["date"][7] != "-":
            out.append(f"line {n}: date {row['date']!r} is not YYYY-MM-DD")
        if not row["source"].strip():
            out.append(f"line {n}: no source document")
        try:
            totals[(row["txn"], row["currency"])] += Decimal(row["amount"])
        except InvalidOperation:
            out.append(f"line {n}: amount {row['amount']!r} is not a number")
    for (txn, cur), total in sorted(totals.items()):
        if total != 0:
            out.append(f"txn {txn}: {cur} postings sum to {total}, not 0")
    return out


def pnl(rows: list[dict], month: str | None) -> dict[str, dict[str, Decimal]]:
    by: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    for row in rows:
        if month and not row["date"].startswith(month):
            continue
        top = row["account"].split(":")[0]
        if top in ("Income", "Expenses"):
            # Income is credited (negative) in double entry; show it positive.
            by[row["currency"]][row["account"]] += -Decimal(row["amount"])
    return by


def balance(rows: list[dict]) -> dict[str, dict[str, Decimal]]:
    by: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    for row in rows:
        by[row["currency"]][row["account"]] += Decimal(row["amount"])
    return by


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    p = sub.add_parser("pnl")
    p.add_argument("--month", help="YYYY-MM; all time if omitted")
    sub.add_parser("balance")
    ap.add_argument("--ledger", type=Path, default=LEDGER)
    args = ap.parse_args(argv)

    rows = read(args.ledger)
    if args.cmd == "check":
        found = problems(rows)
        for line in found:
            print(line)
        print(f"{len(rows)} posting(s), {len(found)} problem(s)")
        return 1 if found else 0
    table = pnl(rows, args.month) if args.cmd == "pnl" else balance(rows)
    for cur, accounts in sorted(table.items()):
        print(cur)
        for account, amount in sorted(accounts.items()):
            print(f"  {account:<40} {amount:>12}")
        if args.cmd == "pnl":
            print(f"  {'Net profit':<40} {sum(accounts.values()):>12}")
    if not table:
        print("no postings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
