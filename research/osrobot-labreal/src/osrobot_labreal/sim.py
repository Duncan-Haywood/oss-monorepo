"""Run a generated script in the real Opentrons simulator (opentrons==8.0.0, needs Python 3.10 to 3.11)."""
import io
import re


def simulate(src):
    """Return (ok, first_error_text). The simulator stops at the first failing command."""
    import opentrons.simulate as s
    try:
        s.simulate(io.StringIO(src))
        return True, ""
    except Exception as e:  # the engine wraps protocol errors; the text is what we classify
        args = e.args[0] if e.args and isinstance(e.args[0], list) and e.args[0] else None
        text = args[0].detail if args is not None and hasattr(args[0], "detail") else str(e)
        return False, text.replace("\n", " ")[:300]


def classify(text):
    """Short name of the error the simulator raised (the Python exception class named in its message)."""
    m = re.search(r"\): (\w+(?:Error|Exception))", text) or re.search(r"(\w+(?:Error|Exception))", text)
    return m.group(1) if m else "other"
