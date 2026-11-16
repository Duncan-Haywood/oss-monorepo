"""Second verifier for eval/facturae-gob-check.mjs: signxml 5.3.0 (lxml/libxml2 C14N,
`cryptography` RSA) on each case it writes with --write <dir>. The key is the
certificate embedded in each file (its chain is not checked, as in ours).
Run: python -I eval/facturae-gob-signxml.py <dir>"""
import base64, re, sys
from pathlib import Path
from lxml import etree
from signxml import XMLVerifier, SignatureConfiguration, SignatureMethod, DigestAlgorithm
from cryptography import x509

# Both example certificates expired before 2010 (MITyC test CA); signxml refuses an
# expired certificate before it checks anything, so only that date check is turned
# off here. Ours reports the dates separately (ES-SIG-12).
XMLVerifier._check_cert_validity = lambda self, cert, source: None

NAMES = ["as published", "InvoiceTotal edited", "re-indented", "SignatureValue flipped", "SigningTime edited"]
for f in sorted(Path(sys.argv[1]).glob("*.xml")):
    data = f.read_bytes()
    cert_b64 = re.search(rb"<(?:ds:)?X509Certificate>([^<]+)<", data).group(1)
    cert = x509.load_der_x509_certificate(base64.b64decode(re.sub(rb"\s+", b"", cert_b64)))
    pem = cert.public_bytes(encoding=__import__("cryptography.hazmat.primitives.serialization", fromlist=["Encoding"]).Encoding.PEM)
    try:
        # Facturae signers write RSA-SHA1; signxml refuses SHA-1 unless allowed.
        cfg = SignatureConfiguration(expect_references=3, signature_methods=frozenset(SignatureMethod), digest_algorithms=frozenset(DigestAlgorithm))
        XMLVerifier().verify(etree.fromstring(data), x509_cert=pem.decode(), expect_config=cfg, ignore_ambiguous_key_info=True)
        verdict = "valid"
    except Exception as e:  # signxml raises InvalidDigest / InvalidSignature
        verdict = f"{type(e).__name__}: {str(e)[:70]}"
    n = int(f.stem.rsplit(".", 1)[1])
    print(f"| {f.stem.rsplit('.', 1)[0]} | {NAMES[n]} | {verdict} |")
