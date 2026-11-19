#!/usr/bin/env python3
"""Runs buildingSMART-community's Excel2IDS tool (GPL-3.0, not committed here;
eval/fetch-excel2ids.sh) on every .xlsx in a folder, without its prompt.

    python3 eval/excel2ids_tool_run.py <Excel2IDS checkout> <folder of .xlsx>

For book.xlsx the tool writes book_<purpose>.ids beside it, as it does when run
by hand; a workbook it stops on gets book.error.txt with the exception. The
tool's own module is imported unchanged: this sets the three globals its
__main__ block sets (s, ids_list, MILESTONE) and calls excel2ids(). Needs
ifctester, openpyxl and tqdm (pip). eval/excel2ids-sidebyside.mjs calls it.
"""
import contextlib
import importlib.util
import io
import os
import sys
import traceback

import openpyxl


def main(tool_dir, book_dir):
    spec = importlib.util.spec_from_file_location("Excel2IDS", os.path.join(tool_dir, "Excel2IDS.py"))
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    tool.s = tool.Settings(os.path.join(tool_dir, "settings.json"))
    tool.MILESTONE = "LOD400"  # as its __main__ sets it
    ran = stopped = 0
    for name in sorted(os.listdir(book_dir)):
        if not name.endswith(".xlsx"):
            continue
        path = os.path.join(book_dir, name)
        tool.ids_list = {}
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                tool.excel2ids(openpyxl.load_workbook(path), path.replace(".xlsx", ".ids"))
            ran += 1
        except Exception as e:  # the tool's own failure is the measurement
            stopped += 1
            with open(path.replace(".xlsx", ".error.txt"), "w") as f:
                f.write(f"{type(e).__name__}: {e}\n")
                f.write(traceback.format_exc(limit=-1))
    print(f"Excel2IDS tool: {ran} workbooks written, {stopped} stopped")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
