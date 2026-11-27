"""Every tracked iCalendar feed (*.ics) has real dates, ends after it starts, and is well formed.

Red-team finding 2026-11-27: einvoice-preflight's mandate-calendar.mjs turned "31 Feb 2027" in the
hub table into DTSTART 20270231 with DTEND 20270304, which a calendar app rejects or puts on the
wrong day. The generator now refuses such a date; this suite catches the same class in any feed a
later venture commits, with no red-team run in the loop. unwired_checks.py runs it on every PR.
"""
import datetime
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATE_PROP = re.compile(r"^(DTSTART|DTEND|DUE|RECURRENCE-ID)(;[^:]*)?:(\d{8})(T(\d{6})Z?)?$")


def unfold(text: str) -> list[str]:
    """RFC 5545 3.1: a line starting with a space or tab continues the one before."""
    out: list[str] = []
    for line in text.split("\r\n"):
        if line[:1] in (" ", "\t") and out:
            out[-1] += line[1:]
        else:
            out.append(line)
    return out


def problems(text: str) -> list[str]:
    found: list[str] = []
    if not text.startswith("BEGIN:VCALENDAR\r\n") or not text.rstrip("\r\n").endswith("END:VCALENDAR"):
        found.append("not wrapped in BEGIN/END:VCALENDAR with CRLF line ends")
    if re.search(r"(?<!\r)\n", text):
        found.append("a bare LF line end (RFC 5545 needs CRLF)")
    event: dict[str, datetime.datetime] = {}
    for n, line in enumerate(unfold(text), 1):
        if line == "BEGIN:VEVENT":
            event = {}
        elif line == "END:VEVENT":
            if "DTSTART" not in event:
                found.append(f"line {n}: an event with no DTSTART")
            elif "DTEND" in event and event["DTEND"] <= event["DTSTART"]:
                found.append(f"line {n}: DTEND is not after DTSTART")
        m = DATE_PROP.match(line)
        if not m:
            continue
        try:
            d = datetime.datetime.strptime(m.group(3) + (m.group(5) or "000000"), "%Y%m%d%H%M%S")
        except ValueError:
            found.append(f"line {n}: {line} is not a real date")
            continue
        event[m.group(1)] = d
    return found


class IcsFeeds(unittest.TestCase):
    def test_checker_rejects_an_impossible_day_and_a_backwards_event(self):
        good = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270228\r\nDTEND;VALUE=DATE:20270301\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        self.assertEqual(problems(good), [])
        self.assertTrue(problems(good.replace("20270228", "20270231")))
        self.assertTrue(problems(good.replace("20270301", "20270227")))
        self.assertTrue(problems(good.replace("\r\n", "\n")))
        folded = good.replace("DTSTART;VALUE=DATE:20270228", "DTSTART;VALUE=DATE:2027\r\n 0231")
        self.assertTrue(problems(folded))

    def test_every_tracked_feed_is_valid(self):
        files = subprocess.run(["git", "ls-files", "*.ics"], cwd=ROOT, capture_output=True, text=True,
                               check=True).stdout.splitlines()
        bad = {}
        for rel in files:
            p = ROOT / rel
            if p.is_file():
                found = problems(p.read_bytes().decode("utf-8"))
                if found:
                    bad[rel] = found[:5]
        self.assertEqual(bad, {})


if __name__ == "__main__":
    unittest.main()
