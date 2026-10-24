#!/usr/bin/env python3
"""Create a new business repository that scheduled Claude Code runs build and operate.

Describe the business in a sentence or two; this writes a repository with a
master prompt, one brief per business function (product, marketing, sales,
finance, legal, support), a router that spreads hourly runs across them, an
owner checklist for the steps only a person may take, and the intake
questions the first run will refine and ask.

    python3 platform/business-template/new_business.py \\
        --name "Tidy Gutters" --type local-service \\
        --idea "Gutter cleaning in Leeds with instant online quotes." \\
        --out ../tidy-gutters

    python3 platform/business-template/new_business.py --interactive --out ../my-biz

Types: see presets/ (saas, local-service, ecommerce, content, services).
Standard library only; Python 3.9+.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "template"
PRESETS = HERE / "presets"
TEXT = {".md", ".json", ".py", ".yml", ".yaml", ".csv", ".txt", ".html", ""}


def presets() -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text()) for p in sorted(PRESETS.glob("*.json"))}


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "business"


def render_questions(questions: list[dict], answers: dict[str, str]) -> str:
    lines = []
    for q in questions:
        lines.append(f"- **{q['id']}**: {q['ask']}")
        answer = answers.get(q["id"], "").strip()
        lines.append(f"  - **Answer:** {answer}" if answer else "  - **Answer:** _open_")
        lines.append(f"  - Default: {q['default']}")
    return "\n".join(lines)


def render_owner_items(items: list[dict]) -> str:
    return "\n".join(f"- [ ] **{i['id']}** {i['what']} Why: {i['why']}" for i in items)


def build(name: str, idea: str, kind: str, out: Path, answers: dict[str, str] | None = None,
          today: str | None = None) -> Path:
    catalogue = presets()
    if kind not in catalogue:
        raise ValueError(f"unknown type {kind!r}; choose one of {', '.join(catalogue)}")
    if out.exists() and any(out.iterdir()):
        raise FileExistsError(f"{out} exists and is not empty")
    preset = catalogue[kind]
    answers = answers or {}
    values = {
        "BUSINESS_NAME": name.strip(),
        "BUSINESS_SLUG": slugify(name),
        "BUSINESS_TYPE": preset["label"],
        "IDEA": idea.strip(),
        "STACK": preset["default_stack"],
        "CREATED": today or date.today().isoformat(),
        "QUESTIONS": render_questions(preset["questions"], answers),
        "OWNER_ITEMS": render_owner_items(preset["owner_setup"]),
    }
    pattern = re.compile(r"\{\{(" + "|".join(values) + r")\}\}")

    shutil.copytree(TEMPLATE, out, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for path in out.rglob("*"):
        if path.is_file() and path.suffix in TEXT:
            text = path.read_text()
            new = pattern.sub(lambda m: values[m.group(1)], text)
            if new != text:
                path.write_text(new)

    routing = {"stage": "intake", "review_every": 24, "weights": preset["weights"]}
    (out / "ops" / "routing.json").write_text(json.dumps(routing, indent=2) + "\n")
    return out


def interactive(catalogue: dict[str, dict]) -> tuple[str, str, str, dict[str, str]]:
    name = input("Business name (a working name is fine): ").strip() or "New Business"
    idea = ""
    while not idea:
        idea = input("Describe the business or product idea in a sentence or two:\n> ").strip()
    print("\nWhat kind of business is it?")
    keys = list(catalogue)
    for n, key in enumerate(keys, 1):
        print(f"  {n}. {catalogue[key]['label']}")
    choice = input(f"Number [1-{len(keys)}]: ").strip()
    kind = keys[int(choice) - 1] if choice.isdigit() and 1 <= int(choice) <= len(keys) else keys[0]
    print("\nA few questions. Press Enter to skip; the first run will use the default shown.")
    answers = {}
    for q in catalogue[kind]["questions"]:
        a = input(f"\n{q['ask']}\n  default: {q['default']}\n> ").strip()
        if a:
            answers[q["id"]] = a
    return name, idea, kind, answers


def main(argv: list[str] | None = None) -> int:
    catalogue = presets()
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--name")
    ap.add_argument("--idea")
    ap.add_argument("--type", choices=sorted(catalogue), default="saas")
    ap.add_argument("--answer", action="append", default=[], metavar="ID=TEXT",
                    help="answer an intake question up front (repeatable)")
    ap.add_argument("--interactive", action="store_true", help="ask for name, idea, type and answers")
    ap.add_argument("--out", type=Path, required=True, help="directory to create")
    args = ap.parse_args(argv)

    if args.interactive:
        name, idea, kind, answers = interactive(catalogue)
    else:
        if not args.name or not args.idea:
            ap.error("--name and --idea are required unless --interactive")
        name, idea, kind = args.name, args.idea, args.type
        answers = {}
        for item in args.answer:
            key, sep, text = item.partition("=")
            if not sep:
                ap.error(f"--answer {item!r}: expected ID=TEXT")
            answers[key.strip()] = text
        known = {q["id"] for q in catalogue[kind]["questions"]}
        unknown = sorted(set(answers) - known)
        if unknown:
            ap.error(f"unknown question id(s) {unknown} for {kind}; known: {sorted(known)}")
    try:
        out = build(name, idea, kind, args.out, answers)
    except (ValueError, FileExistsError) as exc:
        print(exc, file=sys.stderr)
        return 2
    print(f"Created {out}")
    print(f"Next: follow {out / 'SETUP.md'} to connect hourly Claude Code runs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
