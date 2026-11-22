"""Regenerate ../tables.mjs from the installed pre-commit and identify.

Usage: <python-with-pre-commit> differential/gen-tables.py > tables.mjs
"""
import importlib.metadata as md
import json

from identify.identify import ALL_TAGS
from pre_commit import clientlib
from pre_commit import constants as C
from pre_commit.all_languages import language_names

j = json.dumps
print(f"// Generated from identify {md.version('identify')} and pre-commit {C.VERSION} (both MIT licensed:")
print("// https://github.com/pre-commit/identify, https://github.com/pre-commit/pre-commit).")
print("// identify: Copyright (c) 2017 Chris Kuehl, Anthony Sottile (MIT).")
print("// pre-commit: Copyright (c) 2014 pre-commit dev team: Anthony Sottile, Ken Struys (MIT).")
print("// Both under the MIT licence, whose permission notice is the text of this")
print("// venture's LICENSE file (only the copyright lines differ).")
print('// Regenerate: see README, "Updating the tables". Do not edit by hand.')
print(f"export const PRE_COMMIT_VERSION = {j(C.VERSION)};")
print(f"export const IDENTIFY_VERSION = {j(md.version('identify'))};")
print(f"export const LANGUAGES = {j(list(language_names))};")
print(f"export const HOOK_TYPES = {j(list(clientlib.HOOK_TYPES))};")
print(f"export const STAGES = {j(list(clientlib.STAGES))};")
print(f"export const LEGACY_STAGES = {j(dict(clientlib._STAGES))};")
print(f"export const META_HOOK_IDS = {j([k for k, _ in clientlib._meta])};")
print(f"export const TYPE_TAGS = new Set({j(sorted(ALL_TAGS))});")
