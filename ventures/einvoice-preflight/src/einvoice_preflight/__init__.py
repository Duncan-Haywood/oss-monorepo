"""Local, format-neutral e-invoice preflight checks."""

from .bic import inspect_payment_bic, looks_like_complete_bic, normalize_bic
from .checks import check_invoice
from .iban import inspect_payment_iban, looks_like_complete_iban, normalize_iban
from .remittance import inspect_payment_remittance, looks_like_structured_rf, normalize_remittance
from .vat import inspect_party_vat, looks_like_complete_vat, normalize_vat

__all__ = [
    "check_invoice",
    "inspect_party_vat",
    "inspect_payment_bic",
    "inspect_payment_iban",
    "inspect_payment_remittance",
    "looks_like_complete_bic",
    "looks_like_complete_iban",
    "looks_like_complete_vat",
    "looks_like_structured_rf",
    "normalize_bic",
    "normalize_iban",
    "normalize_remittance",
    "normalize_vat",
]
