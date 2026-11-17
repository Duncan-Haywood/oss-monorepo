# python3 tools/test_rapidocr_receipt.py (no rapidocr needed: tests the line assembly only)
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rapidocr_receipt import lines_from_boxes


def box(x, y, w=80, h=20):
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


def test_rows_top_to_bottom_words_left_to_right():
    # boxes come back from the detector in any order; a slightly tilted row stays one row
    got = lines_from_boxes([
        (box(300, 52), "6.000", 0.9), (box(10, 50), "Total", 0.99),
        (box(10, 10), "Nu Greentea 330", 0.94),
        (box(10, 90), "Tunai", 0.9), (box(300, 93), "6.008", 0.87),
    ])
    assert got == "Nu Greentea 330\nTotal 6.000\nTunai 6.008", got


def test_empty():
    assert lines_from_boxes(None) == ""
    assert lines_from_boxes([]) == ""


if __name__ == "__main__":
    test_rows_top_to_bottom_words_left_to_right()
    test_empty()
    print("ok")
