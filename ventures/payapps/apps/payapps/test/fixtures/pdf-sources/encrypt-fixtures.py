"""Writes the encrypted PDF fixtures from schedule-of-values-example.pdf with pypdf (and cryptography).

Each opens with an empty user password and an owner password that restricts changes and copying, the way
bank and insurer downloads arrive; locked-user-password.pdf needs a password to open. Run from test/fixtures:
    python3 -m venv /tmp/v && /tmp/v/bin/pip install pypdf cryptography
    /tmp/v/bin/python pdf-sources/encrypt-fixtures.py
"""
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions as P

SOURCE = "schedule-of-values-example.pdf"
# Print allowed; changes, copying and assembly not: the usual "restricted" bank statement.
PERMS = P.PRINT | P.PRINT_TO_REPRESENTATION

for name, algorithm, user in [
    ("encrypted-rc4-40.pdf", "RC4-40", ""),
    ("encrypted-aes-128.pdf", "AES-128", ""),
    ("encrypted-aes-256-r5.pdf", "AES-256-R5", ""),
    ("encrypted-aes-256.pdf", "AES-256", ""),
    ("locked-user-password.pdf", "AES-128", "open-sesame"),
]:
    writer = PdfWriter(clone_from=PdfReader(SOURCE))
    writer.encrypt(user_password=user, owner_password="owner-secret", algorithm=algorithm, permissions_flag=PERMS)
    with open(name, "wb") as f:
        writer.write(f)
